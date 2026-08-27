import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeJobRequest,
  pollHttpStatus,
  publicJobResponse,
} from './jobContract.mjs';

test('AWS Audio Tools accepts the three existing actions', () => {
  for (const action of ['analysis', 'lyrics', 'stems']) {
    const job = normalizeJobRequest({
      action,
      file_url: 'https://example.com/song.wav',
      track_id: 'track-1',
    });
    assert.equal(job.action, action);
    assert.equal(job.file_url, 'https://example.com/song.wav');
  }
});

test('AWS Audio Tools rejects non-HTTPS audio and invalid actions', () => {
  assert.throws(
    () => normalizeJobRequest({ action: 'analysis', file_url: 'blob:local', track_id: 'track-1' }),
    /HTTPS cloud audio URL/,
  );
  assert.throws(
    () => normalizeJobRequest({ action: 'guess', file_url: 'https://example.com/song.wav', track_id: 'track-1' }),
    /analysis, lyrics, or stems/,
  );
});

test('stem mode is normalized and validated', () => {
  const defaultMode = normalizeJobRequest({
    action: 'stems',
    file_url: 'https://example.com/song.wav',
    track_id: 'track-1',
  });
  assert.equal(defaultMode.mode, 'vocals_instrumental');

  assert.throws(
    () => normalizeJobRequest({
      action: 'stems',
      mode: 'bad-mode',
      file_url: 'https://example.com/song.wav',
      track_id: 'track-1',
    }),
    /vocals_instrumental or full/,
  );
});

test('accepted and running jobs poll as 202 while terminal jobs poll as 200', () => {
  assert.equal(pollHttpStatus('accepted'), 202);
  assert.equal(pollHttpStatus('running'), 202);
  assert.equal(pollHttpStatus('completed'), 200);
  assert.equal(pollHttpStatus('failed'), 200);
});

test('public job response preserves the existing browser fields without storage internals', () => {
  const result = publicJobResponse({
    call_id: 'call-1',
    job_id: 'job-1',
    status: 'completed',
    action: 'analysis',
    track_id: 'track-1',
    profile: { bpm: 92 },
    queue_receipt: 'secret',
    internal_attempts: 2,
  });

  assert.deepEqual(result, {
    call_id: 'call-1',
    job_id: 'job-1',
    status: 'completed',
    action: 'analysis',
    track_id: 'track-1',
    profile: { bpm: 92 },
  });
});

test('Lambda API package metadata is valid for SAM npm pack', () => {
  const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  assert.equal(typeof packageJson.name, 'string');
  assert.ok(packageJson.name.length > 0);
  assert.match(packageJson.version ?? '', /^\d+\.\d+\.\d+$/);
});
