import type { AlbumCoverTextPosition } from './albumCoverStudio';

export interface AlbumCoverAnchor {
  x: number;
  y: number;
}

export interface AlbumCoverPointerLike {
  clientX: number;
  clientY: number;
}

export interface AlbumCoverRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const roundAnchor = (value: number): number => Math.round(clamp01(value) * 10000) / 10000;

export const albumCoverPointerAnchor = (
  pointer: AlbumCoverPointerLike,
  rect: AlbumCoverRectLike,
): AlbumCoverAnchor => {
  if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0.5, y: 0.5 };
  return {
    x: roundAnchor((pointer.clientX - rect.left) / rect.width),
    y: roundAnchor((pointer.clientY - rect.top) / rect.height),
  };
};

const LEGACY_ANCHORS: Record<AlbumCoverTextPosition, AlbumCoverAnchor> = {
  'top-left': { x: 0.14, y: 0.12 },
  'top-center': { x: 0.5, y: 0.12 },
  'top-right': { x: 0.86, y: 0.12 },
  'center-left': { x: 0.14, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  'center-right': { x: 0.86, y: 0.5 },
  'bottom-left': { x: 0.14, y: 0.88 },
  'bottom-center': { x: 0.5, y: 0.88 },
  'bottom-right': { x: 0.86, y: 0.88 },
};

export const defaultAlbumCoverAnchor = (position: AlbumCoverTextPosition): AlbumCoverAnchor => (
  LEGACY_ANCHORS[position] || LEGACY_ANCHORS.center
);

export const albumCoverFontPreviewUrl = (
  apiBase: string,
  input: { fontStyle: string; text: string; size: number; color: string },
): string => {
  const base = String(apiBase || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  const root = base.endsWith('/api') ? base : `${base}/api`;
  const params = new URLSearchParams({
    text: String(input.text || '').slice(0, 80),
    size: String(Math.max(24, Math.min(120, Math.round(Number(input.size) || 48)))),
    color: /^#[0-9A-Fa-f]{6}$/.test(input.color) ? input.color : '#F5F1E8',
  });
  return `${root}/fonts/${encodeURIComponent(input.fontStyle)}/preview?${params.toString()}`;
};

export const albumCoverAnchorStyle = (anchor: AlbumCoverAnchor): { left: string; top: string } => ({
  left: `${roundAnchor(anchor.x) * 100}%`,
  top: `${roundAnchor(anchor.y) * 100}%`,
});
