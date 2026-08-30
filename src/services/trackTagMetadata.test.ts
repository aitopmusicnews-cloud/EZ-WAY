import assert from 'node:assert/strict';
import test from 'node:test';

import { getTrackInfoFromTags } from './trackTagMetadata.ts';

test('getTrackInfoFromTags hides internal genre override metadata from visible tags', () => {
  const info = getTrackInfoFromTags([
    'genre_category:Trap',
    'genre_override:Trap',
    'analysis_version:music-intelligence-v1',
    'Master',
  ]);

  assert.equal(info.genreCategory, 'Trap');
  assert.deepEqual(info.cleanTags, ['Master']);
});
