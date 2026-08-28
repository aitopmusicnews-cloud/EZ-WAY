const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const asString = (value, fallback = '') => value == null ? fallback : String(value);

const parseJsonObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const parseJsonArray = (value) => {
  if (Array.isArray(value)) return [...value];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const rowToTrack = (row = {}) => ({
  id: asString(row.id),
  name: asString(row.name),
  artist: asString(row.artist, 'OGBeatz'),
  bpm: asNumber(row.bpm),
  key_signature: asString(row.key_signature),
  duration: asNumber(row.duration),
  tags: parseJsonArray(row.tags),
  status: row.status || 'processing',
  size: asNumber(row.size),
  type: asString(row.type, 'audio/mpeg'),
  file_url: row.file_url ?? null,
  file_key: row.file_key ?? null,
  image_url: row.image_url ?? null,
  image_key: row.image_key ?? null,
  plays: asNumber(row.plays),
  likes: asNumber(row.likes),
  created_at: asString(row.created_at),
  lyrics: row.lyrics ?? undefined,
});

export const rowToPlaylist = (row = {}) => ({
  id: asString(row.id),
  name: asString(row.name),
  description: asString(row.description),
  image_url: row.image_url ?? undefined,
  image_key: row.image_key ?? null,
  track_ids: parseJsonArray(row.track_ids),
  start_color: asString(row.start_color, '#f97316'),
  end_color: asString(row.end_color, '#ea580c'),
  created_at: asString(row.created_at),
});

export const rowToClient = (row = {}) => ({
  id: asString(row.id),
  name: asString(row.name),
  email: asString(row.email),
  status: row.status || 'offline',
  last_active: asString(row.last_active),
  tags: parseJsonArray(row.tags),
  company: row.company ?? undefined,
  phone: row.phone ?? undefined,
  avatar_url: row.avatar_url ?? undefined,
  avatar_key: row.avatar_key ?? null,
  created_at: asString(row.created_at),
});

export const rowToShareLink = (row = {}) => ({
  id: asString(row.id),
  token: asString(row.token),
  track_id: row.track_id ?? undefined,
  playlist_id: row.playlist_id ?? undefined,
  client_id: row.client_id ?? undefined,
  recipient_email: row.recipient_email ?? undefined,
  download_enabled: row.download_enabled !== false,
  access_count: asNumber(row.access_count),
  expires_at: row.expires_at ?? null,
  created_at: asString(row.created_at),
});

export const rowToActivity = (row = {}) => ({
  id: asString(row.id),
  type: asString(row.type),
  user: asString(row.user, 'Anonymous'),
  action: asString(row.action),
  target: row.target ?? undefined,
  details: row.details ?? undefined,
  timestamp: asString(row.timestamp),
  client_id: row.client_id ?? undefined,
  track_id: row.track_id ?? undefined,
  playlist_id: row.playlist_id ?? undefined,
});

export const rowToMessage = (row = {}) => ({
  id: asString(row.id),
  client_id: asString(row.client_id),
  recipient_id: asString(row.recipient_id),
  content: asString(row.content),
  image_url: row.image_url ?? null,
  image_key: row.image_key ?? null,
  direction: row.direction || 'outbound',
  timestamp: asString(row.timestamp),
  is_read: Boolean(row.is_read),
});

export const rowToPromoVideo = (row = {}) => ({
  id: asString(row.id),
  track_id: row.track_id ?? undefined,
  playlist_id: row.playlist_id ?? undefined,
  video_url: asString(row.video_url),
  video_key: row.video_key ?? null,
  thumbnail_url: asString(row.thumbnail_url),
  thumbnail_key: row.thumbnail_key ?? null,
  style: asString(row.style),
  status: row.status || 'processing',
  created_at: asString(row.created_at),
  name: row.name ?? undefined,
  title: row.title ?? undefined,
});

export const rowToProfile = (row = {}) => ({
  id: asString(row.id),
  name: asString(row.name),
  artist_name: asString(row.artist_name),
  email: asString(row.email),
  avatar_url: asString(row.avatar_url),
  avatar_key: row.avatar_key ?? null,
  bio: asString(row.bio),
  social_links: parseJsonObject(row.social_links),
});

export async function resolveMediaUrls(entity, item, presignRead) {
  if (!item || typeof presignRead !== 'function') return item;
  const output = { ...item };
  const resolve = async (keyField, urlField, emptyValue = null) => {
    if (output[keyField]) output[urlField] = await presignRead(output[keyField]);
    else if (output[urlField] == null) output[urlField] = emptyValue;
  };

  if (entity === 'tracks') {
    await Promise.all([resolve('file_key', 'file_url'), resolve('image_key', 'image_url')]);
  } else if (entity === 'playlists') {
    await resolve('image_key', 'image_url', undefined);
  } else if (entity === 'clients') {
    await resolve('avatar_key', 'avatar_url', undefined);
  } else if (entity === 'messages') {
    await resolve('image_key', 'image_url');
  } else if (entity === 'promo_videos') {
    await Promise.all([resolve('video_key', 'video_url', ''), resolve('thumbnail_key', 'thumbnail_url', '')]);
  } else if (entity === 'profiles') {
    await resolve('avatar_key', 'avatar_url', '');
  }
  return output;
}
