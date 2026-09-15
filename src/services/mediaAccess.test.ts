import assert from 'node:assert/strict';
import test from 'node:test';
import { createMediaAccessResolver } from './mediaAccess.ts';

test('refreshes a stable AWS media key without replacing durable identity', async () => {
  const calls: Array<{ objectKey?: string | null; url?: string | null }> = [];
  const resolver = createMediaAccessResolver(async (input) => {
    calls.push(input);
    return { url: 'https://signed.example/fresh', objectKey: input.objectKey || null };
  });

  const result = await resolver({
    objectKey: 'tracks/123/master.wav',
    url: 'https://signed.example/expired',
  });

  assert.deepEqual(calls, [{
    objectKey: 'tracks/123/master.wav',
    url: 'https://signed.example/expired',
  }]);
  assert.equal(result.url, 'https://signed.example/fresh');
  assert.equal(result.objectKey, 'tracks/123/master.wav');
});
