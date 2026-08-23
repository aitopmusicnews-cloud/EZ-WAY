export interface AlbumCoverFontOption {
  id: string;
  label: string;
  category: string;
  previewFamily: string;
}

export const ALBUM_COVER_FONTS: AlbumCoverFontOption[] = [
  { id: 'modern_sans', label: 'Modern Sans', category: 'Modern', previewFamily: 'Arial, Helvetica, sans-serif' },
  { id: 'bold_display', label: 'Bold Display', category: 'Display', previewFamily: 'Impact, Haettenschweiler, sans-serif' },
  { id: 'editorial_italic', label: 'Editorial Italic', category: 'Editorial', previewFamily: 'Georgia, Times New Roman, serif' },
  { id: 'slanted_serif', label: 'Slanted Serif', category: 'Serif', previewFamily: 'Georgia, Times New Roman, serif' },
  { id: 'luxury_script', label: 'Luxury Script', category: 'Script', previewFamily: 'cursive' },
  { id: 'marker_signature', label: 'Marker / Handwritten', category: 'Handwritten', previewFamily: 'Comic Sans MS, cursive' },
  { id: 'vintage_arc', label: 'Vintage Arc', category: 'Vintage', previewFamily: 'Georgia, Times New Roman, serif' },
  { id: 'street_script', label: 'Street Script', category: 'Street', previewFamily: 'cursive' },
];

export const buildAlbumCoverTitleUpdate = (value: string): { name: string } => {
  const name = String(value || '').trim();
  if (!name) throw new Error('Track title is required');
  return { name };
};
