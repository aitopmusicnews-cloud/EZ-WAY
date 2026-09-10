from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"expected patch target missing in {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "album_cover_backend/app/release_compositor.py",
    "from .storage import LocalStorage, WORKING_IMAGE_SIZE\n",
    "from .custom_fonts import resolve_custom_font_path\nfrom .storage import LocalStorage, WORKING_IMAGE_SIZE\n",
)

replace_once(
    "album_cover_backend/app/release_compositor.py",
    'def _font(style: Any, size: int) -> ImageFont.ImageFont:\n    name = str(style or "editorial").lower()\n',
    'def _font(style: Any, size: int) -> ImageFont.ImageFont:\n    name = str(style or "editorial").lower()\n    custom_path = resolve_custom_font_path(name)\n    if custom_path is not None:\n        try:\n            return ImageFont.truetype(str(custom_path), size=size)\n        except OSError:\n            # Missing/corrupt server asset must not break a cover; use the built-in fallback.\n            pass\n',
)

service_path = "src/services/albumCoverStudio.ts"
old_type = "export type AlbumCoverFontStyle = 'editorial' | 'serif' | 'sans' | 'sans-bold' | 'script' | 'marker' | 'vintage';"
new_type = """export const ALBUM_COVER_FONT_OPTIONS = [
  { value: 'editorial', label: 'Editorial', group: 'Built-in' },
  { value: 'serif', label: 'Serif', group: 'Built-in' },
  { value: 'sans', label: 'Sans', group: 'Built-in' },
  { value: 'sans-bold', label: 'Bold Sans', group: 'Built-in' },
  { value: 'script', label: 'Script', group: 'Built-in' },
  { value: 'marker', label: 'Marker', group: 'Built-in' },
  { value: 'vintage', label: 'Vintage', group: 'Built-in' },
  { value: 'armadillo', label: 'Armadillo', group: 'Custom' },
  { value: 'charles-wright-singapore', label: 'Charles Wright Singapore', group: 'Custom' },
  { value: 'oxidaren', label: 'Oxidaren', group: 'Custom' },
  { value: 'scapholene', label: 'Scapholene', group: 'Custom' },
  { value: 'serati', label: 'Serati', group: 'Custom' },
  { value: 'trigram', label: 'Trigram', group: 'Custom' },
  { value: 'achtung-bravo', label: 'Achtung Bravo', group: 'Custom' },
  { value: 'asterisk-mono', label: 'Asterisk Mono', group: 'Custom' },
  { value: 'chainsaw-carnage', label: 'Chainsaw Carnage', group: 'Custom' },
  { value: 'digit-tech', label: 'Digit Tech', group: 'Custom' },
  { value: 'dystopian-canticle', label: 'Dystopian Canticle', group: 'Custom' },
  { value: 'eightgon', label: 'Eightgon', group: 'Custom' },
  { value: 'goodlookingfont', label: 'GoodLookingFont', group: 'Custom' },
  { value: 'help-me', label: 'Help Me', group: 'Custom' },
  { value: 'jogrunge', label: 'JOGRUNGE', group: 'Custom' },
  { value: 'london-psycho', label: 'London Psycho', group: 'Custom' },
  { value: 'lumierepolis', label: 'Lumierepolis', group: 'Custom' },
  { value: 'midnight-letters', label: 'Midnight Letters', group: 'Custom' },
  { value: 'moonlit-flow', label: 'Moonlit Flow', group: 'Custom' },
  { value: 'powderworks', label: 'Powderworks', group: 'Custom' },
] as const;
export type AlbumCoverFontStyle = (typeof ALBUM_COVER_FONT_OPTIONS)[number]['value'];"""
replace_once(service_path, old_type, new_type)

component_path = "src/components/AlbumCoverStudio.tsx"
replace_once(
    component_path,
    "  absoluteAlbumCoverUrl,\n",
    "  ALBUM_COVER_FONT_OPTIONS,\n  absoluteAlbumCoverUrl,\n",
)

old_title = '<label className="text-[10px] font-black uppercase text-zinc-500 space-y-1"><span>Title style</span><select value={titleFontStyle} onChange={(e) => setTitleFontStyle(e.target.value as typeof titleFontStyle)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white"><option value="editorial">Editorial</option><option value="serif">Serif</option><option value="sans-bold">Bold Sans</option><option value="script">Script</option><option value="marker">Marker</option><option value="vintage">Vintage</option></select></label>'
new_title = '''<label className="text-[10px] font-black uppercase text-zinc-500 space-y-1"><span>Title style</span><select value={titleFontStyle} onChange={(e) => setTitleFontStyle(e.target.value as typeof titleFontStyle)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white"><optgroup label="Built-in">{ALBUM_COVER_FONT_OPTIONS.filter((font) => font.group === 'Built-in').map((font) => <option key={`title-${font.value}`} value={font.value}>{font.label}</option>)}</optgroup><optgroup label="Custom Fonts">{ALBUM_COVER_FONT_OPTIONS.filter((font) => font.group === 'Custom').map((font) => <option key={`title-${font.value}`} value={font.value}>{font.label}</option>)}</optgroup></select></label>'''
replace_once(component_path, old_title, new_title)

old_artist = '<label className="text-[10px] font-black uppercase text-zinc-500 space-y-1"><span>Artist style</span><select value={artistFontStyle} onChange={(e) => setArtistFontStyle(e.target.value as typeof artistFontStyle)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white"><option value="serif">Serif</option><option value="editorial">Editorial</option><option value="sans-bold">Bold Sans</option><option value="script">Script</option><option value="marker">Marker</option><option value="vintage">Vintage</option></select></label>'
new_artist = '''<label className="text-[10px] font-black uppercase text-zinc-500 space-y-1"><span>Artist style</span><select value={artistFontStyle} onChange={(e) => setArtistFontStyle(e.target.value as typeof artistFontStyle)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white"><optgroup label="Built-in">{ALBUM_COVER_FONT_OPTIONS.filter((font) => font.group === 'Built-in').map((font) => <option key={`artist-${font.value}`} value={font.value}>{font.label}</option>)}</optgroup><optgroup label="Custom Fonts">{ALBUM_COVER_FONT_OPTIONS.filter((font) => font.group === 'Custom').map((font) => <option key={`artist-${font.value}`} value={font.value}>{font.label}</option>)}</optgroup></select></label>'''
replace_once(component_path, old_artist, new_artist)
