export type UploadFileKind = 'audio' | 'image' | 'lyrics' | 'unsupported';

const AUDIO_EXTENSIONS = new Set([
  'wav',
  'mp3',
  'flac',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
  'aif',
  'aiff',
  'alac',
]);

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
  'bmp',
  'tif',
  'tiff',
]);

const extensionOf = (name: string) => {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
};

export function classifyUploadFile(file: Pick<File, 'name' | 'type'>): UploadFileKind {
  const type = String(file.type || '').toLowerCase();
  const extension = extensionOf(file.name);

  if (type.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (type.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (type === 'text/plain' || extension === 'txt' || extension === 'lrc') return 'lyrics';
  return 'unsupported';
}
