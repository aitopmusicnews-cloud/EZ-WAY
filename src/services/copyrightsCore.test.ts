import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

let core: any = {};
let premium: any = {};
try {
  core = await import('./copyrightsCore.ts');
} catch {
  core = {};
}
try {
  premium = await import('./premiumFeatures.ts');
} catch {
  premium = {};
}

const track = {
  id: 'track-1',
  name: 'Midnight Drive',
  artist: 'The Artist Cut',
  bpm: 91,
  key_signature: 'F# Minor',
  duration: 183.2,
  tags: [
    'genre_category:R&B/Soul',
    'mood:Late Night',
    'vibe:Smooth',
    'instruments:808 Bass, Electric Piano',
  ],
  status: 'ready' as const,
  size: 12345678,
  type: 'audio/wav',
  file_url: 'https://cdn.example.com/audio/midnight-drive.wav?token=abc',
  image_url: null,
  plays: 0,
  likes: 0,
  created_at: '2026-08-21T19:30:00.000Z',
  lyrics: 'City lights, midnight ride',
};

const profile = {
  version: 'music-intelligence-v1',
  analyzed_at: '2026-08-22T00:00:00Z',
  bpm: 92,
  key: 'F# Minor',
  camelot_key: '11A',
  primary_genre: 'Alternative R&B',
  genre_confident: true,
  genres: [{ label: 'Alternative R&B', score: 0.82 }],
  moods: [{ label: 'Moody', score: 0.77 }],
  styles: [{ label: 'Trap Soul', score: 0.73 }],
  instruments: [{ label: '808 Bass', score: 0.81 }, { label: 'Electric Piano', score: 0.66 }],
  sections: [],
  chapters: [],
  keywords: ['alternative r&b', 'late night', 'atmospheric'],
  evidence: {},
  warnings: [],
};

test('buildCopyrightDraft maps a selected EZ-WAY track and Music Intelligence profile without inventing contributors', () => {
  assert.equal(typeof core.buildCopyrightDraft, 'function', 'buildCopyrightDraft should be implemented');
  if (typeof core.buildCopyrightDraft !== 'function') return;

  const draft = core.buildCopyrightDraft(track, profile);
  assert.equal(draft.trackId, 'track-1');
  assert.equal(draft.title, 'Midnight Drive');
  assert.equal(draft.artist, 'The Artist Cut');
  assert.equal(draft.coArtists, '');
  assert.equal(draft.genre, 'Alternative R&B');
  assert.equal(draft.lyrics, 'City lights, midnight ride');
  assert.equal(draft.dateCreated, '2026-08-21');
  assert.equal(draft.fileName, 'midnight-drive.wav');
  assert.equal(draft.fileSize, 12345678);
  assert.equal(draft.fileType, 'audio/wav');
  assert.match(draft.description, /Genre: Alternative R&B/);
  assert.match(draft.description, /Mood: Moody/);
  assert.match(draft.description, /Style: Trap Soul/);
  assert.match(draft.description, /BPM: 92/);
  assert.match(draft.description, /Key: F# Minor \(11A\)/);
  assert.match(draft.description, /Instruments: 808 Bass, Electric Piano/);
});

test('buildCopyrightDraft falls back to legacy track tags and leaves an invalid creation date blank', () => {
  assert.equal(typeof core.buildCopyrightDraft, 'function', 'buildCopyrightDraft should be implemented');
  if (typeof core.buildCopyrightDraft !== 'function') return;

  const draft = core.buildCopyrightDraft({
    ...track,
    created_at: 'not-a-date',
    file_url: null,
    type: 'audio/mpeg',
  }, null);

  assert.equal(draft.genre, 'R&B/Soul');
  assert.equal(draft.dateCreated, '');
  assert.equal(draft.fileName, 'Midnight-Drive.mp3');
  assert.match(draft.description, /Mood: Late Night/);
  assert.match(draft.description, /Style: Smooth/);
});

test('createCopyrightEvidence hashes the exact audio bytes and creates the expected evidence record', async () => {
  assert.equal(typeof core.createCopyrightEvidence, 'function', 'createCopyrightEvidence should be implemented');
  if (typeof core.createCopyrightEvidence !== 'function') return;

  const draft = core.buildCopyrightDraft(track, profile);
  const audioBytes = new Uint8Array([1, 2, 3, 4, 5]);
  const now = new Date('2026-08-22T20:00:00.000Z');
  const record = await core.createCopyrightEvidence(draft, new Blob([audioBytes]), {
    now,
    id: 'evidence-1',
    registrationNumber: 'EZ-2026-TEST000001',
  });

  const fileHash = createHash('sha256').update(audioBytes).digest('hex').toUpperCase();
  const fingerprint = createHash('sha256')
    .update(['Midnight Drive', 'The Artist Cut', now.toISOString(), fileHash].join('|'))
    .digest('hex')
    .toUpperCase();

  assert.equal(record.id, 'evidence-1');
  assert.equal(record.trackId, 'track-1');
  assert.equal(record.dateRegistered, now.toISOString());
  assert.equal(record.registrationNumber, 'EZ-2026-TEST000001');
  assert.equal(record.fileHash, fileHash);
  assert.equal(record.digitalFingerprint, fingerprint);
  assert.equal(record.status, 'registered');
  assert.equal(record.evidenceVersion, 'ezcopyright-v1');
});

test('premium feature boundary keeps Copyrights and EZ AI Albumcover Studio enabled for the single-user phase', () => {
  assert.equal(typeof premium.canUsePremiumFeature, 'function', 'canUsePremiumFeature should be implemented');
  if (typeof premium.canUsePremiumFeature !== 'function') return;

  assert.equal(premium.canUsePremiumFeature('copyrights'), true);
  assert.equal(premium.canUsePremiumFeature('albumcover-studio'), true);
});
