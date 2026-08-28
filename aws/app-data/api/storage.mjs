import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const bucket = process.env.MEDIA_BUCKET || '';
const s3 = new S3Client({});

const CATEGORY = {
  tracks: { prefix: 'tracks/audio', family: 'audio/', max: 500 * 1024 * 1024 },
  artwork: { prefix: 'tracks/artwork', family: 'image/', max: 20 * 1024 * 1024 },
  'promo-video': { prefix: 'promo/videos', family: 'video/', max: 2 * 1024 * 1024 * 1024 },
  'message-image': { prefix: 'messages/images', family: 'image/', max: 20 * 1024 * 1024 },
  'profile-image': { prefix: 'profiles', family: 'image/', max: 20 * 1024 * 1024 },
};

const safeRelatedId = (value) => {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(text)) throw new Error('relatedId is invalid.');
  return text;
};

const safeFilename = (value) => {
  const filename = String(value || '').trim();
  if (!filename || filename.length > 255 || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('filename is invalid.');
  }
  return filename.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, '-');
};

export function normalizeUploadRequest(body = {}) {
  const category = String(body.category || '').trim();
  const config = CATEGORY[category];
  if (!config) throw new Error('Upload category is invalid.');

  const relatedId = safeRelatedId(body.relatedId ?? body.related_id);
  const filename = safeFilename(body.filename);
  const contentType = String(body.contentType ?? body.content_type ?? '').trim().toLowerCase();
  if (!contentType.startsWith(config.family)) throw new Error('Upload content type is invalid for this category.');

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0 || size > config.max) throw new Error('Upload size is invalid for this category.');

  return { category, relatedId, filename, contentType, size };
}

export function buildObjectKey(input) {
  const category = String(input.category || '').trim();
  const config = CATEGORY[category];
  if (!config) throw new Error('Upload category is invalid.');
  const relatedId = safeRelatedId(input.relatedId ?? input.related_id);
  const filename = safeFilename(input.filename);
  return `${config.prefix}/${relatedId}/${randomUUID()}-${filename}`;
}

const ensureBucket = () => {
  if (!bucket) throw new Error('Media bucket is not configured.');
};

export async function presignRead(objectKey) {
  if (!objectKey) return null;
  ensureBucket();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: 30 * 60 });
}

export async function presignUpload(body) {
  ensureBucket();
  const input = normalizeUploadRequest(body);
  const objectKey = buildObjectKey(input);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: input.contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 10 * 60 });
  const readUrl = await presignRead(objectKey);
  return {
    upload_url: uploadUrl,
    object_key: objectKey,
    read_url: readUrl,
    headers: { 'content-type': input.contentType },
  };
}

export const uploadCategories = Object.freeze(Object.keys(CATEGORY));
