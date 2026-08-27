const SUPPORTED_ACTIONS = new Set(['analysis', 'lyrics', 'stems']);
const SUPPORTED_STEM_MODES = new Set(['vocals_instrumental', 'full']);

const cleanString = (value) => String(value ?? '').trim();

export function normalizeJobRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('A JSON job request is required.');
  }

  const action = cleanString(payload.action);
  if (!SUPPORTED_ACTIONS.has(action)) {
    throw new Error('action must be analysis, lyrics, or stems.');
  }

  const fileUrl = cleanString(payload.file_url);
  if (!fileUrl.startsWith('https://')) {
    throw new Error('An HTTPS cloud audio URL is required.');
  }

  const trackId = cleanString(payload.track_id);
  if (!trackId) {
    throw new Error('track_id is required.');
  }

  const normalized = {
    action,
    file_url: fileUrl,
    track_id: trackId,
    track_name: cleanString(payload.track_name) || 'track',
  };

  const sourceFingerprint = cleanString(payload.source_fingerprint);
  if (sourceFingerprint) normalized.source_fingerprint = sourceFingerprint;

  if (action === 'stems') {
    const mode = cleanString(payload.mode) || 'vocals_instrumental';
    if (!SUPPORTED_STEM_MODES.has(mode)) {
      throw new Error('mode must be vocals_instrumental or full.');
    }
    normalized.mode = mode;
  }

  return normalized;
}

export function pollHttpStatus(status) {
  return status === 'accepted' || status === 'running' ? 202 : 200;
}

const PUBLIC_FIELDS = [
  'call_id',
  'job_id',
  'status',
  'action',
  'mode',
  'track_id',
  'profile',
  'lyrics',
  'files',
  'bundle_url',
  'language',
  'language_probability',
  'error',
  'created_at',
  'updated_at',
];

export function publicJobResponse(item) {
  const output = {};
  for (const field of PUBLIC_FIELDS) {
    if (item?.[field] !== undefined) output[field] = item[field];
  }
  return output;
}
