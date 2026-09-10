import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  albumCoverPointerAnchor,
  albumCoverFontPreviewUrl,
  defaultAlbumCoverAnchor,
} from './albumCoverTextEditor.ts';

describe('album cover visual typography helpers', () => {
  it('converts pointer coordinates to a clamped normalized cover anchor', () => {
    assert.deepEqual(
      albumCoverPointerAnchor({ clientX: 150, clientY: 250 }, { left: 100, top: 200, width: 200, height: 200 }),
      { x: 0.25, y: 0.25 },
    );
    assert.deepEqual(
      albumCoverPointerAnchor({ clientX: 50, clientY: 450 }, { left: 100, top: 200, width: 200, height: 200 }),
      { x: 0, y: 1 },
    );
  });

  it('maps legacy position presets to stable visual-editor anchors', () => {
    assert.deepEqual(defaultAlbumCoverAnchor('top-center'), { x: 0.5, y: 0.12 });
    assert.deepEqual(defaultAlbumCoverAnchor('bottom-right'), { x: 0.86, y: 0.88 });
    assert.deepEqual(defaultAlbumCoverAnchor('center'), { x: 0.5, y: 0.5 });
  });

  it('builds a server-rendered preview URL without exposing font files', () => {
    const url = albumCoverFontPreviewUrl('https://albumcover-api.theartistcut.com', {
      fontStyle: 'armadillo',
      text: 'Midnight Drive',
      size: 72,
      color: '#F5F1E8',
    });
    assert.equal(
      url,
      'https://albumcover-api.theartistcut.com/api/fonts/armadillo/preview?text=Midnight+Drive&size=72&color=%23F5F1E8',
    );
    assert.equal(url.includes('.ttf'), false);
    assert.equal(url.includes('.otf'), false);
  });
});
