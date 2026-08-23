import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALBUM_COVER_FONTS, buildAlbumCoverTitleUpdate } from './albumCoverTitleFont';

describe('album cover title + font helpers', () => {
  it('trims an edited title and produces a track update payload', () => {
    assert.deepEqual(buildAlbumCoverTitleUpdate('  Midnight Drive  '), { name: 'Midnight Drive' });
  });

  it('rejects an empty edited title', () => {
    assert.throws(() => buildAlbumCoverTitleUpdate('   '), /Track title is required/);
  });

  it('exposes a curated font library with stable ids and preview families', () => {
    assert.deepEqual(ALBUM_COVER_FONTS.map((font) => font.id), [
      'modern_sans',
      'bold_display',
      'editorial_italic',
      'slanted_serif',
      'luxury_script',
      'marker_signature',
      'vintage_arc',
      'street_script',
    ]);
    assert.equal(ALBUM_COVER_FONTS.every((font) => Boolean(font.previewFamily)), true);
  });
});
