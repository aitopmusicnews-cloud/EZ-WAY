from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"expected patch anchor missing in {path}: {old[:90]!r}")
    target.write_text(text.replace(old, new, 1))


# Frontend API contract: persist normalized anchors and include them in generation/update payloads.
replace_once(
    "src/services/albumCoverStudio.ts",
    "  color: string;\n}\n\nexport interface AlbumCoverReleaseTextSettings",
    "  color: string;\n  x?: number;\n  y?: number;\n}\n\nexport interface AlbumCoverReleaseTextSettings",
)
replace_once(
    "src/services/albumCoverStudio.ts",
    "    form.set('title_color', release.title.color);\n    form.set('artist_position', release.artist.position);",
    "    form.set('title_color', release.title.color);\n    if (release.title.x != null) form.set('title_x', String(release.title.x));\n    if (release.title.y != null) form.set('title_y', String(release.title.y));\n    form.set('artist_position', release.artist.position);",
)
replace_once(
    "src/services/albumCoverStudio.ts",
    "    form.set('artist_color', release.artist.color);\n    form.set('advisory_position', release.advisoryPosition);",
    "    form.set('artist_color', release.artist.color);\n    if (release.artist.x != null) form.set('artist_x', String(release.artist.x));\n    if (release.artist.y != null) form.set('artist_y', String(release.artist.y));\n    form.set('advisory_position', release.advisoryPosition);",
)
replace_once(
    "src/services/albumCoverStudio.ts",
    "        color: settings.title.color,\n      },\n      artist:",
    "        color: settings.title.color,\n        x: settings.title.x,\n        y: settings.title.y,\n      },\n      artist:",
)
replace_once(
    "src/services/albumCoverStudio.ts",
    "        color: settings.artist.color,\n      },\n      advisory:",
    "        color: settings.artist.color,\n        x: settings.artist.x,\n        y: settings.artist.y,\n      },\n      advisory:",
)

# Backend generation form accepts anchors as well as PATCH /release-text.
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "    title_color: str,\n    artist_position: str,",
    "    title_color: str,\n    title_x: float | None,\n    title_y: float | None,\n    artist_position: str,",
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "    artist_color: str,\n    advisory_position: str,",
    "    artist_color: str,\n    artist_x: float | None,\n    artist_y: float | None,\n    advisory_position: str,",
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    '                    "color": title_color,\n                },',
    '                    "color": title_color,\n                    "x": title_x,\n                    "y": title_y,\n                },',
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    '                    "color": artist_color,\n                },',
    '                    "color": artist_color,\n                    "x": artist_x,\n                    "y": artist_y,\n                },',
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    '    title_color: str = Form(default="#F5F1E8"),\n    artist_position:',
    '    title_color: str = Form(default="#F5F1E8"),\n    title_x: float | None = Form(default=None, ge=0.0, le=1.0),\n    title_y: float | None = Form(default=None, ge=0.0, le=1.0),\n    artist_position:',
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    '    artist_color: str = Form(default="#F5F1E8"),\n    advisory_position:',
    '    artist_color: str = Form(default="#F5F1E8"),\n    artist_x: float | None = Form(default=None, ge=0.0, le=1.0),\n    artist_y: float | None = Form(default=None, ge=0.0, le=1.0),\n    advisory_position:',
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "        title_color=title_color,\n        artist_position=artist_position,",
    "        title_color=title_color,\n        title_x=title_x,\n        title_y=title_y,\n        artist_position=artist_position,",
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "        artist_color=artist_color,\n        advisory_position=advisory_position,",
    "        artist_color=artist_color,\n        artist_x=artist_x,\n        artist_y=artist_y,\n        advisory_position=advisory_position,",
)

# Transparent preview images work both as picker tiles and lightweight on-cover samples.
replace_once(
    "album_cover_backend/app/font_preview.py",
    '    image = Image.new("RGBA", (width, height), (18, 18, 18, 255))',
    '    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))',
)

# Album Cover Studio UI.
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "import React, { useEffect, useMemo, useState } from 'react';",
    "import React, { useEffect, useMemo, useRef, useState } from 'react';",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "import { loadTrackAudioFile } from '../services/albumCoverCore';\nimport {",
    "import { loadTrackAudioFile } from '../services/albumCoverCore';\nimport { albumCoverAnchorStyle, albumCoverFontPreviewUrl, albumCoverPointerAnchor, defaultAlbumCoverAnchor, type AlbumCoverAnchor } from '../services/albumCoverTextEditor';\nimport {",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "  const [titleColor, setTitleColor] = useState('#F5F1E8');\n  const [artistPosition,",
    "  const [titleColor, setTitleColor] = useState('#F5F1E8');\n  const [titleAnchor, setTitleAnchor] = useState<AlbumCoverAnchor>(() => defaultAlbumCoverAnchor('top-center'));\n  const [artistPosition,",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "  const [artistColor, setArtistColor] = useState('#F5F1E8');\n  const [referenceImage,",
    "  const [artistColor, setArtistColor] = useState('#F5F1E8');\n  const [artistAnchor, setArtistAnchor] = useState<AlbumCoverAnchor>(() => defaultAlbumCoverAnchor('bottom-center'));\n  const [fontPickerRole, setFontPickerRole] = useState<'title' | 'artist'>('title');\n  const coverEditorRef = useRef<HTMLDivElement | null>(null);\n  const [referenceImage,",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "    title: { position: titlePosition, size: titleSize, fontStyle: titleFontStyle, case: 'original', treatment: 'light', color: titleColor },\n    artist: { position: artistPosition, size: artistSize, fontStyle: artistFontStyle, case: 'original', treatment: 'light', color: artistColor },",
    "    title: { position: titlePosition, size: titleSize, fontStyle: titleFontStyle, case: 'original', treatment: 'light', color: titleColor, x: titleAnchor.x, y: titleAnchor.y },\n    artist: { position: artistPosition, size: artistSize, fontStyle: artistFontStyle, case: 'original', treatment: 'light', color: artistColor, x: artistAnchor.x, y: artistAnchor.y },",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "  }), [showTitle, showArtist, parentalAdvisory, titlePosition, titleSize, titleFontStyle, titleColor, artistPosition, artistSize, artistFontStyle, artistColor]);",
    "  }), [showTitle, showArtist, parentalAdvisory, titlePosition, titleSize, titleFontStyle, titleColor, titleAnchor, artistPosition, artistSize, artistFontStyle, artistColor, artistAnchor]);",
)

anchor_marker = "  const creativeControls = useMemo<AlbumCoverCreativeControls>(() => ({"
anchor_code = """  const updateAnchorFromPointer = (role: 'title' | 'artist', event: React.PointerEvent<HTMLElement>) => {
    const rect = coverEditorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const anchor = albumCoverPointerAnchor(event, rect);
    if (role === 'title') setTitleAnchor(anchor);
    else setArtistAnchor(anchor);
  };

  const startTextDrag = (role: 'title' | 'artist', event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateAnchorFromPointer(role, event);
  };

  const moveTextDrag = (role: 'title' | 'artist', event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateAnchorFromPointer(role, event);
  };

  useEffect(() => {
    const saved = generation?.release_text as any;
    if (!saved) return;
    const title = saved.title || {};
    const artist = saved.artist || {};
    const savedTitlePosition = title.position || titlePosition;
    const savedArtistPosition = artist.position || artistPosition;
    if (title.position) setTitlePosition(title.position);
    if (artist.position) setArtistPosition(artist.position);
    if (title.font_style) setTitleFontStyle(title.font_style);
    if (artist.font_style) setArtistFontStyle(artist.font_style);
    if (Number.isFinite(Number(title.size))) setTitleSize(Number(title.size));
    if (Number.isFinite(Number(artist.size))) setArtistSize(Number(artist.size));
    if (/^#[0-9A-Fa-f]{6}$/.test(String(title.color || ''))) setTitleColor(title.color);
    if (/^#[0-9A-Fa-f]{6}$/.test(String(artist.color || ''))) setArtistColor(artist.color);
    setTitleAnchor(Number.isFinite(Number(title.x)) && Number.isFinite(Number(title.y)) ? { x: Number(title.x), y: Number(title.y) } : defaultAlbumCoverAnchor(savedTitlePosition));
    setArtistAnchor(Number.isFinite(Number(artist.x)) && Number.isFinite(Number(artist.y)) ? { x: Number(artist.x), y: Number(artist.y) } : defaultAlbumCoverAnchor(savedArtistPosition));
  // Sync controls when a saved/recomposited generation is loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation?.id, generation?.updated_at]);

""" + anchor_marker
replace_once("src/components/AlbumCoverStudio.tsx", anchor_marker, anchor_code)

old_font_grid = """              <div className=\"grid sm:grid-cols-2 gap-3\">
                <label className=\"text-[10px] font-black uppercase text-zinc-500 space-y-1\"><span>Title position</span><select value={titlePosition} onChange={(e) => setTitlePosition(e.target.value as typeof titlePosition)} className=\"w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white\"><option value=\"top-left\">Top left</option><option value=\"top-center\">Top center</option><option value=\"top-right\">Top right</option><option value=\"center\">Center</option><option value=\"bottom-left\">Bottom left</option><option value=\"bottom-center\">Bottom center</option><option value=\"bottom-right\">Bottom right</option></select></label>
                <label className=\"text-[10px] font-black uppercase text-zinc-500 space-y-1\"><span>Title style</span><select value={titleFontStyle} onChange={(e) => setTitleFontStyle(e.target.value as typeof titleFontStyle)} className=\"w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white\"><optgroup label=\"Built-in\">{ALBUM_COVER_FONT_OPTIONS.filter((font) => font.group === 'Built-in').map((font) => <option key={`title-${font.value}`} value={font.value}>{font.label}</option>)}</optgroup><optgroup label=\"Custom Fonts\">{ALBUM_COVER_FONT_OPTIONS.filter((font) => font.group === 'Custom').map((font) => <option key={`title-${font.value}`} value={font.value}>{font.label}</option>)}</optgroup></select></label>
                <label className=\"text-[10px] font-black uppercase text-zinc-500 space-y-1\"><span>Artist position</span><select value={artistPosition} onChange={(e) => setArtistPosition(e.target.value as typeof artistPosition)} className=\"w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white\"><option value=\"top-left\">Top left</option><option value=\"top-center\">Top center</option><option value=\"top-right\">Top right</option><option value=\"center\">Center</option><option value=\"bottom-left\">Bottom left</option><option value=\"bottom-center\">Bottom center</option><option value=\"bottom-right\">Bottom right</option></select></label>
                <label className=\"text-[10px] font-black uppercase text-zinc-500 space-y-1\"><span>Artist style</span><select value={artistFontStyle} onChange={(e) => setArtistFontStyle(e.target.value as typeof artistFontStyle)} className=\"w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white\"><optgroup label=\"Built-in\">{ALBUM_COVER_FONT_OPTIONS.filter((font) => font.group === 'Built-in').map((font) => <option key={`artist-${font.value}`} value={font.value}>{font.label}</option>)}</optgroup><optgroup label=\"Custom Fonts\">{ALBUM_COVER_FONT_OPTIONS.filter((font) => font.group === 'Custom').map((font) => <option key={`artist-${font.value}`} value={font.value}>{font.label}</option>)}</optgroup></select></label>
              </div>"""
new_font_grid = """              <div className=\"grid sm:grid-cols-2 gap-3\">
                <label className=\"text-[10px] font-black uppercase text-zinc-500 space-y-1\"><span>Title position preset</span><select value={titlePosition} onChange={(e) => { const next = e.target.value as typeof titlePosition; setTitlePosition(next); setTitleAnchor(defaultAlbumCoverAnchor(next)); }} className=\"w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white\"><option value=\"top-left\">Top left</option><option value=\"top-center\">Top center</option><option value=\"top-right\">Top right</option><option value=\"center\">Center</option><option value=\"bottom-left\">Bottom left</option><option value=\"bottom-center\">Bottom center</option><option value=\"bottom-right\">Bottom right</option></select></label>
                <button type=\"button\" onClick={() => setFontPickerRole('title')} className={`text-left rounded-xl border px-3 py-2 ${fontPickerRole === 'title' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800 bg-zinc-950'}`}><span className=\"block text-[10px] font-black uppercase text-zinc-500\">Title font</span><span className=\"block mt-1 text-xs font-bold\">{ALBUM_COVER_FONT_OPTIONS.find((font) => font.value === titleFontStyle)?.label || titleFontStyle}</span></button>
                <label className=\"text-[10px] font-black uppercase text-zinc-500 space-y-1\"><span>Artist position preset</span><select value={artistPosition} onChange={(e) => { const next = e.target.value as typeof artistPosition; setArtistPosition(next); setArtistAnchor(defaultAlbumCoverAnchor(next)); }} className=\"w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white\"><option value=\"top-left\">Top left</option><option value=\"top-center\">Top center</option><option value=\"top-right\">Top right</option><option value=\"center\">Center</option><option value=\"bottom-left\">Bottom left</option><option value=\"bottom-center\">Bottom center</option><option value=\"bottom-right\">Bottom right</option></select></label>
                <button type=\"button\" onClick={() => setFontPickerRole('artist')} className={`text-left rounded-xl border px-3 py-2 ${fontPickerRole === 'artist' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800 bg-zinc-950'}`}><span className=\"block text-[10px] font-black uppercase text-zinc-500\">Artist font</span><span className=\"block mt-1 text-xs font-bold\">{ALBUM_COVER_FONT_OPTIONS.find((font) => font.value === artistFontStyle)?.label || artistFontStyle}</span></button>
              </div>
              <FontPicker
                role={fontPickerRole}
                value={fontPickerRole === 'title' ? titleFontStyle : artistFontStyle}
                text={fontPickerRole === 'title' ? (titleInput || 'Album Title') : (artistInput || 'Artist Name')}
                size={fontPickerRole === 'title' ? titleSize : artistSize}
                color={fontPickerRole === 'title' ? titleColor : artistColor}
                onChange={(font) => fontPickerRole === 'title' ? setTitleFontStyle(font as typeof titleFontStyle) : setArtistFontStyle(font as typeof artistFontStyle)}
              />"""
replace_once("src/components/AlbumCoverStudio.tsx", old_font_grid, new_font_grid)

insert_before_advisory = "              <label className=\"flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 cursor-pointer\"><input type=\"checkbox\" checked={parentalAdvisory}"
editor = """              {generation && selectedVariation && (
                <div className=\"rounded-2xl border border-orange-500/20 bg-zinc-950 p-3 space-y-3\">
                  <div><p className=\"text-xs font-black\">Drag typography on cover</p><p className=\"text-[10px] text-zinc-500 mt-1\">Drag title or artist with mouse, touch, or pen. Apply saves exact normalized X/Y positions without rerunning FLUX.</p></div>
                  <div ref={coverEditorRef} className=\"relative aspect-square overflow-hidden rounded-xl bg-zinc-900 touch-none select-none\">
                    <img src={absoluteAlbumCoverUrl(selectedVariation.image_url)} alt=\"Typography positioning preview\" draggable={false} className=\"absolute inset-0 h-full w-full object-cover pointer-events-none\" />
                    {showTitle && titleInput.trim() && <button type=\"button\" onPointerDown={(event) => startTextDrag('title', event)} onPointerMove={(event) => moveTextDrag('title', event)} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} style={{ ...albumCoverAnchorStyle(titleAnchor), transform: 'translate(-50%, -50%)', color: titleColor, fontSize: `${Math.max(16, titleSize * 0.22)}px`, lineHeight: 1.05 }} className=\"absolute max-w-[88%] cursor-move rounded-md border border-orange-400/70 bg-black/25 px-2 py-1 text-center font-black shadow-lg backdrop-blur-[1px]\">{titleInput}</button>}
                    {showArtist && artistInput.trim() && <button type=\"button\" onPointerDown={(event) => startTextDrag('artist', event)} onPointerMove={(event) => moveTextDrag('artist', event)} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} style={{ ...albumCoverAnchorStyle(artistAnchor), transform: 'translate(-50%, -50%)', color: artistColor, fontSize: `${Math.max(13, artistSize * 0.22)}px`, lineHeight: 1.05 }} className=\"absolute max-w-[88%] cursor-move rounded-md border border-white/60 bg-black/25 px-2 py-1 text-center font-bold shadow-lg backdrop-blur-[1px]\">{artistInput}</button>}
                  </div>
                  <div className=\"grid grid-cols-2 gap-2 text-[9px] text-zinc-500\"><span>Title: {Math.round(titleAnchor.x * 100)}%, {Math.round(titleAnchor.y * 100)}%</span><span>Artist: {Math.round(artistAnchor.x * 100)}%, {Math.round(artistAnchor.y * 100)}%</span></div>
                </div>
              )}

""" + insert_before_advisory
replace_once("src/components/AlbumCoverStudio.tsx", insert_before_advisory, editor)

font_picker_component = """
function FontPicker({ role, value, text, size, color, onChange }: { role: 'title' | 'artist'; value: string; text: string; size: number; color: string; onChange: (font: string) => void }) {
  return (
    <div className=\"rounded-2xl border border-zinc-800 bg-zinc-950 p-3\">
      <div className=\"flex items-center justify-between gap-3 mb-3\"><div><p className=\"text-[10px] font-black uppercase tracking-wider text-zinc-400\">{role} font previews</p><p className=\"text-[9px] text-zinc-600 mt-1\">Previewing your actual {role} text. Click a tile to choose.</p></div><span className=\"text-[9px] text-orange-300\">{ALBUM_COVER_FONT_OPTIONS.length} fonts</span></div>
      <div className=\"grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1\">
        {ALBUM_COVER_FONT_OPTIONS.map((font) => {
          const active = font.value === value;
          const previewUrl = albumCoverFontPreviewUrl(absoluteAlbumCoverUrl('/'), { fontStyle: font.value, text, size: Math.max(36, Math.min(88, size)), color });
          return <button key={`${role}-${font.value}`} type=\"button\" onClick={() => onChange(font.value)} className={`overflow-hidden rounded-xl border text-left transition ${active ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800 bg-black hover:border-zinc-600'}`}><div className=\"h-16 flex items-center justify-center bg-zinc-900/80 p-1\">{previewUrl ? <img src={previewUrl} alt={`${font.label} preview`} loading=\"lazy\" className=\"max-h-full max-w-full object-contain\" /> : <span className=\"text-xs\">{text}</span>}</div><div className=\"px-2 py-1.5\"><span className=\"block truncate text-[9px] font-black\">{font.label}</span><span className=\"text-[8px] text-zinc-600\">{font.group === 'Custom' ? 'Custom Font' : 'Built-in'}</span></div></button>;
        })}
      </div>
    </div>
  );
}

"""
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "function Metric({ label, value, note = '' }:",
    font_picker_component + "function Metric({ label, value, note = '' }:",
)

print("visual typography patch applied")
