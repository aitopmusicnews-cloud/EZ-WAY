import { describe, expect, it } from 'vitest';
import { ALBUM_COVER_FONTS, buildAlbumCoverTitleUpdate } from './albumCoverTitleFont';

describe('album cover title + font helpers', () => {
  it('trims an edited title and produces a track update payload', () => {
    expect(buildAlbumCoverTitleUpdate('  Midnight Drive  ')).toEqual({ name: 'Midnight Drive' });
  });

  it('rejects an empty edited title', () => {
    expect(() => buildAlbumCoverTitleUpdate('   ')).toThrow('Track title is required');
  });

  it('exposes a curated font library with stable ids and preview families', () => {
    expect(ALBUM_COVER_FONTS.map(font => font.id)).toEqual([
      'modern_sans',
      'bold_display',
      'editorial_italic',
      'slanted_serif',
      'luxury_script',
      'marker_signature',
      'vintage_arc',
      'street_script',
    ]);
    expect(ALBUM_COVER_FONTS.every(font => Boolean(font.previewFamily))).toBe(true);
  });
});
