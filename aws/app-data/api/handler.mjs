import { randomUUID } from 'node:crypto';
import { execute, executeTransaction } from './db.mjs';
import { normalizeEntityCreate, normalizePatch, normalizePublicEvent } from './contract.mjs';
import {
  resolveMediaUrls, rowToActivity, rowToClient, rowToMessage, rowToPlaylist,
  rowToProfile, rowToPromoVideo, rowToShareLink, rowToTrack,
} from './rows.mjs';
import { presignRead, presignUpload } from './storage.mjs';

const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || 'https://ezwaypro.theartistcut.com')
  .split(',').map((value) => value.trim()).filter(Boolean);
const requestOrigin = (event) => String(event?.headers?.origin || event?.headers?.Origin || '').trim();
const corsOrigin = (event) => {
  const origin = requestOrigin(event);
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0] || 'https://ezwaypro.theartistcut.com';
};
const response = (event, statusCode, body = null) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': corsOrigin(event),
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    vary: 'Origin',
  },
  body: body === null ? '' : JSON.stringify(body),
});
const parseBody = (event) => {
  if (!event?.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return JSON.parse(raw);
};
const params = (object) => Object.entries(object).map(([name, value]) => ({ name, value }));
const one = (rows) => Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

const mapRow = (entity, row) => {
  if (!row) return null;
  switch (entity) {
    case 'tracks': return rowToTrack(row);
    case 'playlists': return rowToPlaylist(row);
    case 'clients': return rowToClient(row);
    case 'share_links': return rowToShareLink(row);
    case 'activities': return rowToActivity(row);
    case 'messages': return rowToMessage(row);
    case 'promo_videos': return rowToPromoVideo(row);
    case 'profiles': return rowToProfile(row);
    default: return row;
  }
};
const mapAndResolve = async (entity, row) => resolveMediaUrls(entity, mapRow(entity, row), presignRead);
const mapManyAndResolve = async (entity, rows) => Promise.all(rows.map((row) => mapAndResolve(entity, row)));

async function createEntity(entity, body) {
  const item = normalizeEntityCreate(entity, body);
  let rows;
  switch (entity) {
    case 'tracks':
      rows = await execute(`
        INSERT INTO tracks (
          id, name, artist, duration, bpm, key_signature, file_url, file_key, image_url, image_key,
          size, type, plays, likes, tags, lyrics, status
        ) VALUES (
          CAST(:id AS uuid), :name, :artist, :duration, :bpm, :key_signature,
          :file_url, :file_key, :image_url, :image_key, :size, :type, :plays, :likes,
          CAST(:tagsJson AS jsonb), :lyrics, :status
        ) RETURNING *
      `, params(item));
      break;
    case 'playlists':
      rows = await execute(`
        INSERT INTO playlists (id, name, description, track_ids, start_color, end_color, image_url, image_key)
        VALUES (CAST(:id AS uuid), :name, :description, CAST(:track_ids AS jsonb), :start_color, :end_color, :image_url, :image_key)
        RETURNING *
      `, params(item));
      break;
    case 'clients':
      rows = await execute(`
        INSERT INTO clients (id, name, email, phone, avatar_url, avatar_key, company, status, last_active, tags)
        VALUES (
          CAST(:id AS uuid), :name, :email, :phone, :avatar_url, :avatar_key, :company, :status,
          COALESCE(CAST(:last_active AS timestamptz), NOW()), CAST(:tags AS jsonb)
        ) RETURNING *
      `, params(item));
      break;
    case 'share_links':
      rows = await execute(`
        INSERT INTO share_links (id, token, track_id, playlist_id, client_id, recipient_email, download_enabled, expires_at)
        VALUES (
          CAST(:id AS uuid), :token, CAST(:track_id AS uuid), CAST(:playlist_id AS uuid),
          CAST(:client_id AS uuid), :recipient_email, :download_enabled, CAST(:expires_at AS timestamptz)
        ) RETURNING *
      `, params(item));
      break;
    case 'activities':
      rows = await execute(`
        INSERT INTO activities (id, type, track_id, playlist_id, client_id, "user", action, target, details)
        VALUES (
          CAST(:id AS uuid), :type, CAST(:track_id AS uuid), CAST(:playlist_id AS uuid),
          CAST(:client_id AS uuid), :user, :action, :target, :details
        ) RETURNING *
      `, params(item));
      break;
    case 'messages':
      rows = await execute(`
        INSERT INTO messages (id, client_id, recipient_id, content, image_url, image_key, direction, is_read)
        VALUES (
          CAST(:id AS uuid), CAST(:client_id AS uuid), :recipient_id, :content,
          :image_url, :image_key, :direction, :is_read
        ) RETURNING *
      `, params(item));
      break;
    case 'promo_videos':
      rows = await execute(`
        INSERT INTO promo_videos (
          id, track_id, playlist_id, video_url, video_key, thumbnail_url, thumbnail_key, style, status, name, title
        ) VALUES (
          CAST(:id AS uuid), CAST(:track_id AS uuid), CAST(:playlist_id AS uuid),
          :video_url, :video_key, :thumbnail_url, :thumbnail_key, :style, :status, :name, :title
        ) RETURNING *
      `, params(item));
      break;
    default: throw new Error(`Unsupported create entity: ${entity}`);
  }
  return mapAndResolve(entity, one(rows));
}

async function putProfile(body) {
  const item = normalizeEntityCreate('profiles', body);
  const rows = await execute(`
    INSERT INTO profiles (id, name, artist_name, email, avatar_url, avatar_key, bio, social_links)
    VALUES (CAST(:id AS uuid), :name, :artist_name, :email, :avatar_url, :avatar_key, :bio, CAST(:social_links AS jsonb))
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      artist_name = EXCLUDED.artist_name,
      email = EXCLUDED.email,
      avatar_url = EXCLUDED.avatar_url,
      avatar_key = EXCLUDED.avatar_key,
      bio = EXCLUDED.bio,
      social_links = EXCLUDED.social_links
    RETURNING *
  `, params(item));
  return mapAndResolve('profiles', one(rows));
}

const JSON_PATCH_FIELDS = new Set(['tags', 'track_ids']);
const TIMESTAMP_PATCH_FIELDS = new Set(['last_active']);
async function patchEntity(entity, id, body) {
  const patch = normalizePatch(entity, body);
  const setSql = patch.fields.map((field) => {
    if (JSON_PATCH_FIELDS.has(field)) return `${field} = CAST(:${field} AS jsonb)`;
    if (TIMESTAMP_PATCH_FIELDS.has(field)) return `${field} = CAST(:${field} AS timestamptz)`;
    return `${field} = :${field}`;
  }).join(', ');
  const rows = await execute(
    `UPDATE ${entity} SET ${setSql} WHERE id = CAST(:id AS uuid) RETURNING *`,
    params({ ...patch.values, id }),
  );
  return mapAndResolve(entity, one(rows));
}
async function deleteEntity(entity, id) {
  const rows = await execute(`DELETE FROM ${entity} WHERE id = CAST(:id AS uuid) RETURNING id`, [{ name: 'id', value: id }]);
  return Boolean(one(rows));
}

async function bootstrap() {
  const [tracks, playlists, clients, activities, shareLinks, messages, promoVideos, profiles] = await Promise.all([
    execute('SELECT * FROM tracks ORDER BY created_at DESC'),
    execute('SELECT * FROM playlists ORDER BY created_at DESC'),
    execute('SELECT * FROM clients ORDER BY created_at DESC'),
    execute('SELECT * FROM activities ORDER BY timestamp DESC'),
    execute('SELECT * FROM share_links ORDER BY created_at DESC'),
    execute('SELECT * FROM messages ORDER BY timestamp ASC'),
    execute('SELECT * FROM promo_videos ORDER BY created_at DESC'),
    execute('SELECT * FROM profiles ORDER BY created_at ASC LIMIT 1'),
  ]);
  const [mappedTracks, mappedPlaylists, mappedClients, mappedMessages, mappedPromoVideos, mappedProfiles] = await Promise.all([
    mapManyAndResolve('tracks', tracks), mapManyAndResolve('playlists', playlists), mapManyAndResolve('clients', clients),
    mapManyAndResolve('messages', messages), mapManyAndResolve('promo_videos', promoVideos), mapManyAndResolve('profiles', profiles),
  ]);
  return {
    tracks: mappedTracks,
    playlists: mappedPlaylists,
    clients: mappedClients,
    activities: activities.map(rowToActivity),
    share_links: shareLinks.map(rowToShareLink),
    messages: mappedMessages,
    promo_videos: mappedPromoVideos,
    profile: mappedProfiles[0] || null,
  };
}

async function diagnostics() {
  const tables = ['tracks', 'playlists', 'clients', 'share_links', 'activities', 'messages', 'promo_videos', 'promo_packs', 'profiles', 'todos'];
  const counts = {};
  for (const table of tables) {
    const rows = await execute(`SELECT COUNT(*)::int AS count FROM ${table}`);
    counts[table] = Number(one(rows)?.count || 0);
  }
  return { tables: counts };
}

async function loadShare(token) {
  const row = one(await execute('SELECT * FROM share_links WHERE token = :token LIMIT 1', [{ name: 'token', value: token }]));
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

async function resolvePublicShare(token) {
  const shareRow = await loadShare(token);
  if (!shareRow) return null;
  const incremented = one(await execute(
    'UPDATE share_links SET access_count = access_count + 1 WHERE id = CAST(:id AS uuid) RETURNING *',
    [{ name: 'id', value: shareRow.id }],
  ));
  const link = rowToShareLink(incremented || shareRow);
  let track = null;
  let playlist = null;
  let tracks = [];
  if (shareRow.track_id) {
    track = await mapAndResolve('tracks', one(await execute(
      'SELECT * FROM tracks WHERE id = CAST(:id AS uuid) LIMIT 1', [{ name: 'id', value: shareRow.track_id }],
    )));
  } else if (shareRow.playlist_id) {
    playlist = await mapAndResolve('playlists', one(await execute(
      'SELECT * FROM playlists WHERE id = CAST(:id AS uuid) LIMIT 1', [{ name: 'id', value: shareRow.playlist_id }],
    )));
    if (playlist?.track_ids?.length) {
      const rows = await execute(`
        SELECT * FROM tracks
        WHERE id IN (
          SELECT CAST(value AS uuid)
          FROM jsonb_array_elements_text(CAST(:track_ids AS jsonb)) AS value
        )
      `, [{ name: 'track_ids', value: JSON.stringify(playlist.track_ids) }]);
      const mapped = await mapManyAndResolve('tracks', rows);
      const byId = new Map(mapped.map((item) => [item.id, item]));
      tracks = playlist.track_ids.map((id) => byId.get(id)).filter(Boolean);
    }
  }
  let messages = [];
  if (shareRow.client_id) {
    const rows = await execute(
      "SELECT * FROM messages WHERE client_id = CAST(:client_id AS uuid) AND direction = 'inbound' ORDER BY timestamp ASC",
      [{ name: 'client_id', value: shareRow.client_id }],
    );
    messages = await mapManyAndResolve('messages', rows);
  }
  return { link, track, playlist, tracks, messages };
}

async function postPublicEvent(token, body) {
  const share = await loadShare(token);
  if (!share) return false;
  const event = normalizePublicEvent(body);
  let playlist = null;
  const trackId = event.track_id || share.track_id || null;
  if (share.playlist_id) {
    playlist = rowToPlaylist(one(await execute(
      'SELECT * FROM playlists WHERE id = CAST(:id AS uuid) LIMIT 1', [{ name: 'id', value: share.playlist_id }],
    )));
    if (!trackId || !playlist.track_ids.includes(trackId)) throw new Error('Public share event track is not allowed.');
  } else if (trackId !== share.track_id) {
    throw new Error('Public share event track is not allowed.');
  }
  const track = trackId ? one(await execute(
    'SELECT id, name FROM tracks WHERE id = CAST(:id AS uuid) LIMIT 1', [{ name: 'id', value: trackId }],
  )) : null;
  if (!track) throw new Error('Public share event track is invalid.');

  const userLabel = share.recipient_email ? `Industry Client (${share.recipient_email})` : 'Industry Client';
  const baseActivity = {
    id: randomUUID(), track_id: trackId, playlist_id: share.playlist_id || null,
    client_id: share.client_id || null, user: userLabel, target: track.name || 'Asset',
  };
  const statements = [];
  if (event.type === 'play') {
    statements.push({
      sql: 'UPDATE tracks SET plays = plays + 1 WHERE id = CAST(:track_id AS uuid)',
      params: [{ name: 'track_id', value: trackId }],
    });
    statements.push({
      sql: `INSERT INTO activities (id, type, track_id, playlist_id, client_id, "user", action, target)
            VALUES (CAST(:id AS uuid), 'play', CAST(:track_id AS uuid), CAST(:playlist_id AS uuid), CAST(:client_id AS uuid), :user, 'streamed track reference', :target)`,
      params: params(baseActivity),
    });
  } else if (event.type === 'thumbs_up' || event.type === 'thumbs_down') {
    const approved = event.type === 'thumbs_up';
    if (approved) {
      statements.push({
        sql: 'UPDATE tracks SET likes = likes + 1 WHERE id = CAST(:track_id AS uuid)',
        params: [{ name: 'track_id', value: trackId }],
      });
    }
    statements.push({
      sql: `INSERT INTO activities (id, type, track_id, playlist_id, client_id, "user", action, target, details)
            VALUES (CAST(:id AS uuid), :type, CAST(:track_id AS uuid), CAST(:playlist_id AS uuid), CAST(:client_id AS uuid), :user, :action, :target, :details)`,
      params: params({
        ...baseActivity, type: approved ? 'social' : 'system', action: approved ? 'thumbs_up' : 'thumbs_down',
        details: approved ? 'High-priority approval.' : 'Requested revision cycle.',
      }),
    });
    if (share.client_id) {
      statements.push({
        sql: `INSERT INTO messages (id, client_id, recipient_id, content, direction, is_read)
              VALUES (CAST(:id AS uuid), CAST(:client_id AS uuid), 'owner', :content, 'inbound', false)`,
        params: params({
          id: randomUUID(), client_id: share.client_id,
          content: approved
            ? `[Mix Approval]: Approved the mix for reference "${track.name || 'Asset'}"!`
            : `[Revision Request]: Flagged "${track.name || 'Asset'}" for revision adjustments.`,
        }),
      });
    }
  } else if (event.type === 'comment') {
    statements.push({
      sql: `INSERT INTO activities (id, type, track_id, playlist_id, client_id, "user", action, target, details)
            VALUES (CAST(:id AS uuid), 'message', CAST(:track_id AS uuid), CAST(:playlist_id AS uuid), CAST(:client_id AS uuid), :user, 'commented on', :target, :details)`,
      params: params({ ...baseActivity, details: event.content }),
    });
    if (share.client_id) {
      statements.push({
        sql: `INSERT INTO messages (id, client_id, recipient_id, content, direction, is_read)
              VALUES (CAST(:id AS uuid), CAST(:client_id AS uuid), 'owner', :content, 'inbound', false)`,
        params: params({ id: randomUUID(), client_id: share.client_id, content: `[Feedback on ${track.name || 'Asset'}]: ${event.content}` }),
      });
    }
  }
  await executeTransaction(statements);
  return true;
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || event?.httpMethod || '';
  const rawPath = String(event?.rawPath || event?.path || '');
  const pathParameters = event?.pathParameters || {};
  if (method === 'OPTIONS') return response(event, 204);
  if (method === 'GET' && rawPath === '/health') return response(event, 200, { status: 'ok', provider: 'aws' });
  try {
    if (method === 'GET' && rawPath === '/bootstrap') return response(event, 200, await bootstrap());
    if (method === 'GET' && rawPath === '/diagnostics') return response(event, 200, await diagnostics());
    if (method === 'GET' && rawPath.startsWith('/public/share/')) {
      const token = String(pathParameters.token || rawPath.slice('/public/share/'.length)).split('/')[0].trim();
      const payload = await resolvePublicShare(token);
      if (!payload) return response(event, 404, { error: 'Share link not found or expired.' });
      return response(event, 200, payload);
    }
    if (method === 'POST' && rawPath.match(/^\/public\/share\/[^/]+\/events$/)) {
      const token = String(pathParameters.token || rawPath.split('/')[3] || '').trim();
      if (!(await postPublicEvent(token, parseBody(event)))) return response(event, 404, { error: 'Share link not found or expired.' });
      return response(event, 204);
    }
    const createRoutes = new Map([
      ['/tracks', 'tracks'], ['/playlists', 'playlists'], ['/clients', 'clients'],
      ['/share-links', 'share_links'], ['/activities', 'activities'], ['/messages', 'messages'], ['/promo-videos', 'promo_videos'],
    ]);
    if (method === 'POST' && createRoutes.has(rawPath)) {
      const entity = createRoutes.get(rawPath);
      return response(event, 201, await createEntity(entity, parseBody(event)));
    }
    if (method === 'PUT' && rawPath === '/profile') return response(event, 200, await putProfile(parseBody(event)));
    if (method === 'POST' && rawPath === '/uploads/presign') return response(event, 200, await presignUpload(parseBody(event)));
    const patchMatch = rawPath.match(/^\/(tracks|playlists|clients)\/([^/]+)$/);
    if (method === 'PATCH' && patchMatch) {
      const [, entity, pathId] = patchMatch;
      const id = String(pathParameters.id || pathId).trim();
      const updated = await patchEntity(entity, id, parseBody(event));
      if (!updated) return response(event, 404, { error: 'Record not found.' });
      return response(event, 200, updated);
    }
    const deleteMatch = rawPath.match(/^\/(tracks|playlists|clients|share-links|promo-videos)\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      const [, routeEntity, pathId] = deleteMatch;
      const entity = routeEntity === 'share-links' ? 'share_links' : routeEntity === 'promo-videos' ? 'promo_videos' : routeEntity;
      const id = String(pathParameters.id || pathId).trim();
      if (!(await deleteEntity(entity, id))) return response(event, 404, { error: 'Record not found.' });
      return response(event, 204);
    }
    return response(event, 404, { error: 'Route not found.' });
  } catch (error) {
    if (error instanceof SyntaxError) return response(event, 400, { error: 'Request body must be valid JSON.' });
    if (/required|invalid|not allowed|must|expected|unknown|exactly one/i.test(String(error?.message || ''))) {
      return response(event, 400, { error: error?.message || 'Invalid request.' });
    }
    console.error('[EzwayDataApi] Request failed', error);
    return response(event, 500, { error: 'EZ-WAY data request failed.' });
  }
};
