const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS = new Set(['ready', 'processing', 'error']);
const CLIENT_STATUS = new Set(['online', 'offline', 'away']);
const DIRECTION = new Set(['inbound', 'outbound']);

const PATCH_FIELDS = {
  tracks: new Set(['name', 'artist', 'duration', 'bpm', 'key_signature', 'size', 'type', 'plays', 'likes', 'tags', 'lyrics', 'status', 'file_url', 'file_key', 'image_url', 'image_key']),
  playlists: new Set(['name', 'description', 'track_ids', 'start_color', 'end_color', 'image_url', 'image_key']),
  clients: new Set(['name', 'email', 'phone', 'avatar_url', 'avatar_key', 'company', 'status', 'last_active', 'tags']),
};

const requireUuid = (value, field = 'id') => {
  const text = String(value || '').trim();
  if (!UUID_RE.test(text)) throw new Error(`${field} must be a UUID.`);
  return text;
};

const optionalUuid = (value, field) => value == null || value === '' ? null : requireUuid(value, field);

const requireText = (value, field, max = 4000) => {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${field} is required.`);
  if (text.length > max) throw new Error(`${field} is too long.`);
  return text;
};

const optionalText = (value, max = 4000) => {
  if (value == null) return null;
  const text = String(value);
  if (text.length > max) throw new Error('Text value is too long.');
  return text;
};

const optionalUrl = (value, field) => {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${field} is invalid.`);
  }
  if (!new Set(['https:', 'http:']).has(parsed.protocol)) throw new Error(`${field} is invalid.`);
  return text;
};

const numberValue = (value, fallback = 0) => {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Numeric value is invalid.');
  return n;
};

const integerValue = (value, fallback = 0) => Math.trunc(numberValue(value, fallback));

const jsonArrayText = (value) => {
  if (value == null) return '[]';
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  return JSON.stringify(value.map((entry) => String(entry)));
};

const jsonObjectText = (value) => {
  if (value == null) return '{}';
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return JSON.stringify(value);
};

const safeObjectKey = (value, field) => {
  if (value == null || value === '') return null;
  const key = String(value);
  if (key.length > 1024 || key.startsWith('/') || key.includes('..') || key.includes('\\')) {
    throw new Error(`${field} is not allowed.`);
  }
  return key;
};

export function normalizeTrackCreate(body = {}) {
  const status = body.status || 'processing';
  if (!STATUS.has(status)) throw new Error('Track status is invalid.');
  return {
    id: requireUuid(body.id),
    name: requireText(body.name, 'name', 500),
    artist: optionalText(body.artist, 500) || 'OGBeatz',
    duration: integerValue(body.duration),
    bpm: integerValue(body.bpm),
    key_signature: optionalText(body.key_signature, 100) || '',
    file_url: optionalUrl(body.file_url, 'file_url'),
    file_key: safeObjectKey(body.file_key, 'file_key'),
    image_url: optionalUrl(body.image_url, 'image_url'),
    image_key: safeObjectKey(body.image_key, 'image_key'),
    size: integerValue(body.size),
    type: optionalText(body.type, 255) || 'audio/mpeg',
    plays: integerValue(body.plays),
    likes: integerValue(body.likes),
    tagsJson: jsonArrayText(body.tags),
    lyrics: optionalText(body.lyrics, 200000),
    status,
  };
}

export function normalizeShareCreate(body = {}) {
  const trackId = optionalUuid(body.track_id, 'track_id');
  const playlistId = optionalUuid(body.playlist_id, 'playlist_id');
  if (Boolean(trackId) === Boolean(playlistId)) throw new Error('Share link must target exactly one track or playlist.');
  return {
    id: requireUuid(body.id),
    token: requireText(body.token, 'token', 512),
    track_id: trackId,
    playlist_id: playlistId,
    client_id: optionalUuid(body.client_id, 'client_id'),
    recipient_email: optionalText(body.recipient_email, 500),
    download_enabled: body.download_enabled !== false,
    expires_at: optionalText(body.expires_at, 100),
  };
}

export function normalizePatch(entity, body = {}) {
  const allowed = PATCH_FIELDS[entity];
  if (!allowed) throw new Error(`Unknown patch entity: ${entity}`);
  const entries = Object.entries(body);
  if (entries.length === 0) throw new Error('At least one patch field is required.');

  const values = {};
  for (const [field, rawValue] of entries) {
    if (!allowed.has(field)) throw new Error(`${field} is not allowed for ${entity}.`);
    if (field === 'tags' || field === 'track_ids') values[field] = jsonArrayText(rawValue);
    else if (field.endsWith('_key')) values[field] = safeObjectKey(rawValue, field);
    else if (field.endsWith('_url')) values[field] = optionalUrl(rawValue, field);
    else if (['duration', 'bpm', 'size', 'plays', 'likes'].includes(field)) values[field] = integerValue(rawValue);
    else if (field === 'status') {
      const set = entity === 'clients' ? CLIENT_STATUS : STATUS;
      if (!set.has(rawValue)) throw new Error(`${field} is invalid.`);
      values[field] = rawValue;
    } else values[field] = rawValue == null ? null : String(rawValue);
  }
  return { entity, fields: Object.keys(values), values };
}

export function normalizeEntityCreate(entity, body = {}) {
  switch (entity) {
    case 'tracks': return normalizeTrackCreate(body);
    case 'playlists': return {
      id: requireUuid(body.id),
      name: requireText(body.name, 'name', 500),
      description: optionalText(body.description, 10000) || '',
      track_ids: jsonArrayText(body.track_ids),
      start_color: optionalText(body.start_color, 50) || '#f97316',
      end_color: optionalText(body.end_color, 50) || '#ea580c',
      image_url: optionalUrl(body.image_url, 'image_url'),
      image_key: safeObjectKey(body.image_key, 'image_key'),
    };
    case 'clients': {
      const status = body.status || 'offline';
      if (!CLIENT_STATUS.has(status)) throw new Error('Client status is invalid.');
      return {
        id: requireUuid(body.id),
        name: requireText(body.name, 'name', 500),
        email: requireText(body.email, 'email', 500),
        phone: optionalText(body.phone, 100),
        avatar_url: optionalUrl(body.avatar_url, 'avatar_url'),
        avatar_key: safeObjectKey(body.avatar_key, 'avatar_key'),
        company: optionalText(body.company, 500),
        status,
        last_active: optionalText(body.last_active, 100),
        tags: jsonArrayText(body.tags),
      };
    }
    case 'share_links': return normalizeShareCreate(body);
    case 'activities': return {
      id: requireUuid(body.id),
      type: requireText(body.type, 'type', 100),
      track_id: optionalUuid(body.track_id, 'track_id'),
      playlist_id: optionalUuid(body.playlist_id, 'playlist_id'),
      client_id: optionalUuid(body.client_id, 'client_id'),
      user: optionalText(body.user, 500) || 'Anonymous',
      action: optionalText(body.action, 1000) || '',
      target: optionalText(body.target, 1000),
      details: optionalText(body.details, 10000),
    };
    case 'messages': {
      const direction = body.direction || 'outbound';
      if (!DIRECTION.has(direction)) throw new Error('Message direction is invalid.');
      return {
        id: requireUuid(body.id),
        client_id: optionalUuid(body.client_id, 'client_id'),
        recipient_id: optionalText(body.recipient_id, 500),
        content: requireText(body.content, 'content', 20000),
        image_url: optionalUrl(body.image_url, 'image_url'),
        image_key: safeObjectKey(body.image_key, 'image_key'),
        direction,
        is_read: Boolean(body.is_read),
      };
    }
    case 'promo_videos': {
      const status = body.status || 'processing';
      if (!STATUS.has(status)) throw new Error('Promo video status is invalid.');
      const videoUrl = optionalUrl(body.video_url, 'video_url');
      const videoKey = safeObjectKey(body.video_key, 'video_key');
      if (!videoUrl && !videoKey) throw new Error('Promo video requires video_url or video_key.');
      return {
        id: requireUuid(body.id),
        track_id: optionalUuid(body.track_id, 'track_id'),
        playlist_id: optionalUuid(body.playlist_id, 'playlist_id'),
        video_url: videoUrl,
        video_key: videoKey,
        thumbnail_url: optionalUrl(body.thumbnail_url, 'thumbnail_url'),
        thumbnail_key: safeObjectKey(body.thumbnail_key, 'thumbnail_key'),
        style: requireText(body.style, 'style', 500),
        status,
        name: optionalText(body.name, 1000),
        title: optionalText(body.title, 1000),
      };
    }
    case 'profiles': return {
      id: requireUuid(body.id),
      name: optionalText(body.name, 500) || '',
      artist_name: optionalText(body.artist_name, 500) || '',
      email: optionalText(body.email, 500) || '',
      avatar_url: optionalUrl(body.avatar_url, 'avatar_url'),
      avatar_key: safeObjectKey(body.avatar_key, 'avatar_key'),
      bio: optionalText(body.bio, 20000) || '',
      social_links: jsonObjectText(body.social_links),
    };
    default: throw new Error(`Unknown entity: ${entity}`);
  }
}

export function normalizePublicEvent(body = {}) {
  const type = String(body.type || '').trim();
  if (!new Set(['play', 'thumbs_up', 'thumbs_down', 'comment']).has(type)) throw new Error('Public share event is invalid.');
  const content = body.content == null ? null : String(body.content).trim();
  if (type === 'comment' && (!content || content.length > 4000)) throw new Error('Comment content is required and must be 4000 characters or fewer.');
  return { type, track_id: optionalUuid(body.track_id, 'track_id'), content };
}
