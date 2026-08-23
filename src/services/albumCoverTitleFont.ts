export interface AlbumCoverFontOption {
  id: string;
  label: string;
  category: string;
  previewFamily: string;
}

// These mirror the typography treatments supported by the Albumcover backend.
// The library is display-only in EZ-WAY; the backend still chooses a genre-aware
// treatment automatically for each generated cover.
export const ALBUM_COVER_FONTS: AlbumCoverFontOption[] = [
  { id: 'street_script', label: 'Street Script', category: 'Street', previewFamily: 'cursive' },
  { id: 'luxury_script', label: 'Luxury Script', category: 'Script', previewFamily: 'cursive' },
  { id: 'heritage_script', label: 'Heritage Script', category: 'Vintage Script', previewFamily: 'cursive' },
  { id: 'marker_signature', label: 'Marker / Handwritten', category: 'Handwritten', previewFamily: 'Comic Sans MS, cursive' },
  { id: 'vintage_arc', label: 'Vintage Arc', category: 'Vintage', previewFamily: 'Georgia, Times New Roman, serif' },
  { id: 'editorial_italic', label: 'Editorial Italic', category: 'Editorial', previewFamily: 'Georgia, Times New Roman, serif' },
  { id: 'slanted_serif', label: 'Slanted Serif', category: 'Serif', previewFamily: 'Georgia, Times New Roman, serif' },
];

export const buildAlbumCoverTitleUpdate = (value: string): { name: string } => {
  const name = String(value || '').trim();
  if (!name) throw new Error('Track title is required');
  return { name };
};
