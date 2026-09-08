import assert from 'node:assert/strict';
import test from 'node:test';

import { pollAudioToolsJob } from './audioTools.ts';

test('polling reconnects after a transient Failed to fetch error', async () => {
  let attempts = 0;
  const progress: string[] = [];
  let nowValue = 0;

  const result = await pollAudioToolsJob(
    'call-123',
    (status) => progress.push(status),
    1_000,
    {
      baseUrl: 'https://audio.example.test',
      fetchImpl: async (input: string | URL | Request) => {
        attempts += 1;
        if (attempts === 1) {
          throw new TypeError('Failed to fetch');
        }

        assert.equal(String(input), 'https://audio.example.test/jobs/call-123');
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'completed', lyrics: '[00:00.00] Test lyric' }),
          text: async () => '',
        } as Response;
      },
      sleep: async () => {},
      now: () => nowValue++,
      retryDelayMs: 0,
    },
  );

  assert.equal(attempts, 2);
  assert.equal(result.status, 'completed');
  assert.equal(result.lyrics, '[00:00.00] Test lyric');
  assert.ok(progress.some((status) => /reconnect/i.test(status)));
});
