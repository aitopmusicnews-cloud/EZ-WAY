from pathlib import Path
import re


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing pattern in {path}: {old[:100]!r}")
    text = text.replace(old, new, count)
    p.write_text(text)


# Keep the concept name visible in the FLUX production brief for audit/debugging.
replace(
    "album_cover_backend/app/render_prompts.py",
    '    parts.extend(\n        [\n            f"SUBJECT: {concept.get(\'subject\', \'\')}. ACTION/SYMBOL: {concept.get(\'action_or_symbol\', \'\')}.",',
    '    parts.extend(\n        [\n            f"CONCEPT: {concept.get(\'name\', \'Untitled\')}.",\n            f"SUBJECT: {concept.get(\'subject\', \'\')}. ACTION/SYMBOL: {concept.get(\'action_or_symbol\', \'\')}.",',
)

# Preserve creative controls in the variation-set audit payload so the renderer gets them front-loaded.
replace(
    "album_cover_backend/app/cloudflare_generation_service.py",
    '                "concept_scores": scores,\n                "finished_cover_ranking": False,',
    '                "concept_scores": scores,\n                "creative_controls": controls,\n                "finished_cover_ranking": False,',
)
replace(
    "album_cover_backend/app/cloudflare_generation_service.py",
    '            "finished_cover_ranking": False,\n            "degraded": True,',
    '            "finished_cover_ranking": False,\n            "creative_controls": {},\n            "degraded": True,',
)

# Update obsolete tests to the approved Cloudflare/user-choice contract.
p = Path("album_cover_backend/tests/test_pipeline.py")
text = p.read_text()
text = text.replace(
'''def test_release_metadata_is_stored_and_composited(app_factory):
    client, *_ = app_factory()
''',
'''def test_release_metadata_is_stored_and_composited(app_factory):
    client, _, _, images = app_factory()
''')
text = text.replace(
'''    prompt = body["variation_sets"][0]["prompt"]
    assert "Do not draw words or lettering" in prompt
    assert "lower corner" in prompt
''',
'''    production_prompt = images.prompts[0]
    assert "NO TITLE" in production_prompt
    assert "NO ARTIST LETTERING" in production_prompt
    assert "NO PARENTAL ADVISORY" in production_prompt
''')
text = re.sub(
    r'def test_settings_default_creative_director_is_gemini\(monkeypatch, tmp_path\):.*?\n\ndef test_health_reports_provider_configuration_without_exposing_keys',
'''def test_settings_default_creative_director_is_cloudflare(tmp_path):
    from app.cloudflare_creative_director import CloudflareGemmaCreativeDirector
    from app.config import Settings
    from app.main import AppDependencies, create_app
    from conftest import FakeAudioAnalyzer, FakeImageClient, FakeLyricsAnalyzer

    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'cloudflare-default.db'}",
        storage_root=tmp_path / "cloudflare-default-storage",
        frontend_root=tmp_path / "missing-frontend",
        cloudflare_account_id="acct",
        cloudflare_api_token="token",
    )
    app = create_app(
        settings,
        AppDependencies(
            audio_analyzer=FakeAudioAnalyzer(),
            lyrics_analyzer=FakeLyricsAnalyzer(),
            image_client=FakeImageClient(),
        ),
    )
    assert isinstance(app.state.generation_service.creative_director, CloudflareGemmaCreativeDirector)
    assert app.state.generation_service.creative_director.account_id == "acct"
    assert app.state.generation_service.creative_director.model == "@cf/google/gemma-4-26b-a4b-it"


def test_health_reports_provider_configuration_without_exposing_keys''',
    text,
    flags=re.S,
)
p.write_text(text)

# Frontend service: six covers, release text controls, reference upload, selected-cover improve.
p = Path("src/services/albumCoverStudio.ts")
text = p.read_text()
text = text.replace("export type AlbumCoverVariationCount = 3 | 4 | 5;", "export type AlbumCoverVariationCount = 3 | 4 | 5 | 6;")
text = text.replace(
"export type AlbumCoverCreativeStrength = 'loose' | 'balanced' | 'strict';\n",
"""export type AlbumCoverCreativeStrength = 'loose' | 'balanced' | 'strict';
export type AlbumCoverReferenceType = 'artist' | 'character' | 'style';
export type AlbumCoverTextPosition = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type AlbumCoverFontStyle = 'editorial' | 'serif' | 'sans' | 'sans-bold' | 'script' | 'marker' | 'vintage';

export interface AlbumCoverTextLayerStyle {
  position: AlbumCoverTextPosition;
  size: number;
  fontStyle: AlbumCoverFontStyle;
  case: 'original' | 'upper' | 'lower';
  treatment: 'light' | 'dark' | 'outline';
  color: string;
}

export interface AlbumCoverReleaseTextSettings {
  showTitle: boolean;
  showArtist: boolean;
  parentalAdvisory: boolean;
  title: AlbumCoverTextLayerStyle;
  artist: AlbumCoverTextLayerStyle;
  advisoryPosition: 'bottom-left' | 'bottom-right';
  advisorySize: 'small' | 'medium' | 'large';
}
""")
text = text.replace(
"  creativeControls?: AlbumCoverCreativeControls;\n  collectionId: string;",
"  creativeControls?: AlbumCoverCreativeControls;\n  releaseText?: AlbumCoverReleaseTextSettings;\n  referenceImage?: File | null;\n  referenceType?: AlbumCoverReferenceType;\n  collectionId: string;"
)
text = text.replace(
"  parental_advisory: boolean;\n  analysis?: Record<string, any> | null;",
"  parental_advisory: boolean;\n  release_text?: Record<string, any> | null;\n  song_thesis?: Record<string, any> | null;\n  creative_direction_status?: string | null;\n  artist_reference?: Record<string, any> | null;\n  analysis?: Record<string, any> | null;"
)
text = text.replace("    variationCount: 3,", "    variationCount: 6,")
text = text.replace("  form.set('variation_count', String(source.variationCount || 4));", "  form.set('variation_count', String(source.variationCount || 6));")
insert_after = "  Object.entries(controls).forEach(([key, value]) => form.set(key, value));\n"
release_block = """  const release = source.releaseText;
  if (release) {
    form.set('show_title', String(release.showTitle));
    form.set('show_artist', String(release.showArtist));
    form.set('parental_advisory', String(release.parentalAdvisory));
    form.set('title_position', release.title.position);
    form.set('title_size', String(release.title.size));
    form.set('title_font_style', release.title.fontStyle);
    form.set('title_case', release.title.case);
    form.set('title_treatment', release.title.treatment);
    form.set('title_color', release.title.color);
    form.set('artist_position', release.artist.position);
    form.set('artist_size', String(release.artist.size));
    form.set('artist_font_style', release.artist.fontStyle);
    form.set('artist_case', release.artist.case);
    form.set('artist_treatment', release.artist.treatment);
    form.set('artist_color', release.artist.color);
    form.set('advisory_position', release.advisoryPosition);
    form.set('advisory_size', release.advisorySize);
  }
  if (source.referenceImage) {
    form.set('reference_image', source.referenceImage);
    form.set('reference_type', source.referenceType || 'artist');
  }
"""
if release_block not in text:
    text = text.replace(insert_after, insert_after + release_block)
text = text.replace(
'''export const generateBetterAlbumCovers = async (
  generationId: string,
  moodPath: Exclude<AlbumCoverMoodPath, 'auto'>,
  variationCount: AlbumCoverVariationCount,
  creativeControls: AlbumCoverCreativeControls = {},
): Promise<AlbumCoverGeneration> => (''',
'''export const generateBetterAlbumCovers = async (
  generationId: string,
  sourceVariationId: string,
  moodPath: Exclude<AlbumCoverMoodPath, 'auto'>,
  variationCount: AlbumCoverVariationCount,
  creativeControls: AlbumCoverCreativeControls = {},
): Promise<AlbumCoverGeneration> => (''')
text = text.replace(
'''    body: JSON.stringify({
      mood_path: moodPath,
      variation_count: variationCount,
      run_async: true,
      ...creativeControlPayload(creativeControls),
    }),
  }))
);

export const retryAlbumCoverGeneration''',
'''    body: JSON.stringify({
      source_variation_id: sourceVariationId,
      mood_path: moodPath,
      variation_count: variationCount,
      run_async: true,
      ...creativeControlPayload(creativeControls),
    }),
  }))
);

export const updateAlbumCoverReleaseText = async (
  generationId: string,
  settings: AlbumCoverReleaseTextSettings,
): Promise<AlbumCoverGeneration> => (
  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/generations/${encodeURIComponent(generationId)}/release-text`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      show_title: settings.showTitle,
      show_artist: settings.showArtist,
      parental_advisory: settings.parentalAdvisory,
      title: {
        position: settings.title.position,
        size: settings.title.size,
        font_style: settings.title.fontStyle,
        case: settings.title.case,
        treatment: settings.title.treatment,
        color: settings.title.color,
      },
      artist: {
        position: settings.artist.position,
        size: settings.artist.size,
        font_style: settings.artist.fontStyle,
        case: settings.artist.case,
        treatment: settings.artist.treatment,
        color: settings.artist.color,
      },
      advisory: { position: settings.advisoryPosition, size: settings.advisorySize },
    }),
  }))
);

export const retryAlbumCoverGeneration''',
1)
p.write_text(text)

# Frontend component targeted UI/wiring changes.
p = Path("src/components/AlbumCoverStudio.tsx")
text = p.read_text()
text = text.replace("  generateBetterAlbumCovers,\n", "  generateBetterAlbumCovers,\n  updateAlbumCoverReleaseText,\n")
text = text.replace("  type AlbumCoverMetrics,\n", "  type AlbumCoverMetrics,\n  type AlbumCoverReleaseTextSettings,\n  type AlbumCoverReferenceType,\n")
text = text.replace("  const [variationCount, setVariationCount] = useState<AlbumCoverVariationCount>(4);", "  const [variationCount] = useState<AlbumCoverVariationCount>(6);")
state_anchor = "  const [parentalAdvisory, setParentalAdvisory] = useState(false);\n"
new_states = """  const [showTitle, setShowTitle] = useState(true);
  const [showArtist, setShowArtist] = useState(true);
  const [titlePosition, setTitlePosition] = useState<AlbumCoverReleaseTextSettings['title']['position']>('top-center');
  const [titleSize, setTitleSize] = useState(104);
  const [titleFontStyle, setTitleFontStyle] = useState<AlbumCoverReleaseTextSettings['title']['fontStyle']>('editorial');
  const [titleColor, setTitleColor] = useState('#F5F1E8');
  const [artistPosition, setArtistPosition] = useState<AlbumCoverReleaseTextSettings['artist']['position']>('bottom-center');
  const [artistSize, setArtistSize] = useState(42);
  const [artistFontStyle, setArtistFontStyle] = useState<AlbumCoverReleaseTextSettings['artist']['fontStyle']>('serif');
  const [artistColor, setArtistColor] = useState('#F5F1E8');
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceType, setReferenceType] = useState<AlbumCoverReferenceType>('artist');
"""
if new_states not in text:
    text = text.replace(state_anchor, state_anchor + new_states)
creative_anchor = "  const creativeControls = useMemo<AlbumCoverCreativeControls>(() => ({\n"
release_memo = """  const releaseText = useMemo<AlbumCoverReleaseTextSettings>(() => ({
    showTitle,
    showArtist,
    parentalAdvisory,
    title: { position: titlePosition, size: titleSize, fontStyle: titleFontStyle, case: 'original', treatment: 'light', color: titleColor },
    artist: { position: artistPosition, size: artistSize, fontStyle: artistFontStyle, case: 'original', treatment: 'light', color: artistColor },
    advisoryPosition: 'bottom-right',
    advisorySize: 'small',
  }), [showTitle, showArtist, parentalAdvisory, titlePosition, titleSize, titleFontStyle, titleColor, artistPosition, artistSize, artistFontStyle, artistColor]);

"""
if release_memo not in text:
    text = text.replace(creative_anchor, release_memo + creative_anchor)
text = text.replace(
'''        parentalAdvisory,
        variationCount,
        creativeControls,
''',
'''        parentalAdvisory,
        variationCount,
        creativeControls,
        releaseText,
        referenceImage,
        referenceType,
''')
text = text.replace(
'''  const handleGenerateBetter = async () => {
    if (!generation || !latestSet || busy) return;''',
'''  const handleGenerateBetter = async () => {
    if (!generation || !latestSet || !selectedVariation || busy) return;''')
text = text.replace(
'''      const queued = await generateBetterAlbumCovers(
        generation.id,
        moodPathFromSet(latestSet.mood_path),''',
'''      const queued = await generateBetterAlbumCovers(
        generation.id,
        selectedVariation.id,
        moodPathFromSet(latestSet.mood_path),''')
# Add recompose handler before retry.
marker = "  const handleRetry = async () => {\n"
handler = """  const handleApplyTextChanges = async () => {
    if (!generation || busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await updateAlbumCoverReleaseText(generation.id, releaseText);
      setGeneration(updated);
      setStatusText('Title, artist, and advisory updated without rerunning FLUX.');
      addToast('Release text updated without regenerating the artwork.', 'success');
    } catch (caught: any) {
      const message = caught?.message || 'Release text update failed.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

"""
if handler not in text:
    text = text.replace(marker, handler + marker)
# Remove winner variables.
text = text.replace("  const winnerId = latestSet?.winner_variation_id;\n  const runnerUpId = latestSet?.runner_up_variation_id;\n  const hasWinner = Boolean(winnerId || variations.some((item) => item.selection_tier === 'winner'));\n", "")
text = text.replace("Creative planning: song intelligence + your controls · Image rendering: Cloudflare FLUX.1 Schnell · Final export: 3000×3000", "Creative Director: Cloudflare Gemma 4 · Artwork: FLUX.1 Schnell · Final cover choice: You · Export: 3000×3000")
# Replace old advisory block with release controls + reference upload.
old = '''            <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-black p-4 cursor-pointer">
              <input type="checkbox" checked={parentalAdvisory} onChange={(event) => setParentalAdvisory(event.target.checked)} className="w-5 h-5 accent-orange-500" />
              <span className="text-sm font-bold">Add Parental Advisory — Explicit Content label</span>
            </label>
            <p className="text-[10px] text-zinc-600 -mt-3">Title, artist, and advisory are added after AI generation so the final wording is exact rather than AI-garbled.</p>
'''
new = '''            <div className="rounded-3xl border border-zinc-800 bg-black p-4 space-y-4">
              <div><p className="text-sm font-black">Title + Artist</p><p className="text-[10px] text-zinc-600 mt-1">FLUX creates artwork only. EZ-WAY adds these layers exactly once afterward.</p></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={showTitle} onChange={(event) => setShowTitle(event.target.checked)} className="accent-orange-500" /> Show title</label>
                <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={showArtist} onChange={(event) => setShowArtist(event.target.checked)} className="accent-orange-500" /> Show artist</label>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-[10px] font-black uppercase text-zinc-500 space-y-1"><span>Title position</span><select value={titlePosition} onChange={(e) => setTitlePosition(e.target.value as typeof titlePosition)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white"><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option><option value="center">Center</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option></select></label>
                <label className="text-[10px] font-black uppercase text-zinc-500 space-y-1"><span>Title style</span><select value={titleFontStyle} onChange={(e) => setTitleFontStyle(e.target.value as typeof titleFontStyle)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white"><option value="editorial">Editorial</option><option value="serif">Serif</option><option value="sans-bold">Bold Sans</option><option value="script">Script</option><option value="marker">Marker</option><option value="vintage">Vintage</option></select></label>
                <label className="text-[10px] font-black uppercase text-zinc-500 space-y-1"><span>Artist position</span><select value={artistPosition} onChange={(e) => setArtistPosition(e.target.value as typeof artistPosition)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white"><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option><option value="center">Center</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option></select></label>
                <label className="text-[10px] font-black uppercase text-zinc-500 space-y-1"><span>Artist style</span><select value={artistFontStyle} onChange={(e) => setArtistFontStyle(e.target.value as typeof artistFontStyle)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white"><option value="serif">Serif</option><option value="editorial">Editorial</option><option value="sans-bold">Bold Sans</option><option value="script">Script</option><option value="marker">Marker</option><option value="vintage">Vintage</option></select></label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="text-[10px] font-black uppercase text-zinc-500">Title size<input type="number" min={24} max={180} value={titleSize} onChange={(e) => setTitleSize(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-white" /></label>
                <label className="text-[10px] font-black uppercase text-zinc-500">Title color<input type="color" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-zinc-800 bg-zinc-950 p-1" /></label>
                <label className="text-[10px] font-black uppercase text-zinc-500">Artist size<input type="number" min={24} max={180} value={artistSize} onChange={(e) => setArtistSize(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-white" /></label>
                <label className="text-[10px] font-black uppercase text-zinc-500">Artist color<input type="color" value={artistColor} onChange={(e) => setArtistColor(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-zinc-800 bg-zinc-950 p-1" /></label>
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 cursor-pointer"><input type="checkbox" checked={parentalAdvisory} onChange={(event) => setParentalAdvisory(event.target.checked)} className="w-5 h-5 accent-orange-500" /><span className="text-sm font-bold">Parental Advisory (manual — default Off)</span></label>
              {generation && <button type="button" onClick={handleApplyTextChanges} disabled={busy} className="w-full rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-2.5 text-[10px] font-black uppercase text-orange-300 disabled:opacity-50">Apply text changes — no rerender</button>}
            </div>

            <label className="block rounded-2xl border border-dashed border-zinc-800 bg-black p-4 cursor-pointer hover:border-orange-500/40">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">Artist / character reference</p><p className="text-[10px] text-zinc-600">Optional. Guides appearance and styling; exact facial identity may vary with FLUX.1 Schnell.</p></div><select value={referenceType} onChange={(e) => setReferenceType(e.target.value as AlbumCoverReferenceType)} onClick={(e) => e.stopPropagation()} className="rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-2 text-[10px] text-white"><option value="artist">Artist</option><option value="character">Character</option><option value="style">Style</option></select></div>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-xs text-zinc-500 file:mr-3 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" onChange={(e) => setReferenceImage(e.target.files?.[0] || null)} />
              {referenceImage && <p className="text-[10px] text-orange-300 mt-2">Reference: {referenceImage.name}</p>}
            </label>
'''
if old not in text:
    raise SystemExit('release controls UI pattern missing')
text = text.replace(old, new)
# Replace variation selector with fixed six-cover note.
text = text.replace(
'''            <label className="space-y-2 block text-xs font-bold text-zinc-400">
              <span>Variations</span>
              <select value={variationCount} onChange={(event) => setVariationCount(Number(event.target.value) as AlbumCoverVariationCount)} className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-white outline-none focus:border-orange-500">
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </label>
''',
'''            <div className="rounded-2xl border border-zinc-800 bg-black px-4 py-3"><p className="text-xs font-black">6 finished covers</p><p className="text-[10px] text-zinc-600 mt-1">3 distinct Creative Director concepts × 2 FLUX executions. No AI winner — you choose.</p></div>
''')
# Replace winner gated Generate Better with selected-cover gated button.
text = text.replace(
"                        {hasWinner && latestSet.critic_status !== 'failed' && <button onClick={handleGenerateBetter} disabled={busy} className=\"rounded-xl bg-orange-500 px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50\">Generate Better</button>}",
"                        <button onClick={handleGenerateBetter} disabled={busy || !selectedVariation} className=\"rounded-xl bg-orange-500 px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50\">{selectedVariation ? 'Generate Better from Selected' : 'Select a cover to improve'}</button>"
)
# Remove winner tier and badges/score emphasis.
text = text.replace("                        const tier = variation.selection_tier || (variation.id === winnerId ? 'winner' : variation.id === runnerUpId ? 'runner_up' : '');\n", "")
text = text.replace("                              {tier === 'winner' && <span className=\"absolute top-3 left-3 rounded-full bg-emerald-500 px-3 py-1.5 text-[10px] font-black text-black\">AI winner</span>}\n                              {tier === 'runner_up' && <span className=\"absolute top-3 left-3 rounded-full bg-amber-400 px-3 py-1.5 text-[10px] font-black text-black\">AI runner-up</span>}\n", "")
text = text.replace("<div className=\"flex items-start justify-between gap-3\"><div><p className=\"font-black\">{variation.concept_name || `Variation ${variation.position}`}</p><p className=\"text-[10px] text-zinc-600 mt-1\">{variation.width}×{variation.height} · final download 3000×3000</p></div>{variation.cover_score != null && <span className=\"text-sm font-black text-orange-400\">{asNumber(variation.cover_score, 1)}</span>}</div>", "<div><p className=\"font-black\">{variation.concept_name || `Cover ${variation.position}`}</p><p className=\"text-[10px] text-zinc-600 mt-1\">Cover {variation.position} · {variation.width}×{variation.height} · equal choice</p></div>")
# Remove market-positioning recommendation box from cards.
text = re.sub(r'\s*\{\(positioning\.lane \|\| positioning\.release_signal \|\| positioning\.target_audience\) && <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-3">.*?</div>\}', '', text)
text = text.replace("                        const positioning = variation.market_positioning || {};\n", "")
p.write_text(text)

# Add integration regression to existing lightweight source-inspection test file.
p = Path("src/services/albumCoverIntegration.test.ts")
text = p.read_text()
addition = r'''

test('Album Cover major-label director gives the user six equal covers and selected-cover refinement', () => {
  const service = fs.readFileSync(servicePath, 'utf8');
  const studio = fs.readFileSync(studioPath, 'utf8');
  assert.match(service, /AlbumCoverVariationCount = 3 \| 4 \| 5 \| 6/);
  assert.match(service, /reference_image/);
  assert.match(service, /source_variation_id/);
  assert.match(service, /release-text/);
  assert.match(studio, /6 finished covers/);
  assert.match(studio, /No AI winner/);
  assert.match(studio, /Generate Better from Selected/);
  assert.match(studio, /Artist \/ character reference/);
  assert.doesNotMatch(studio, /AI winner/);
  assert.doesNotMatch(studio, /AI runner-up/);
});
'''
if "major-label director gives the user six equal covers" not in text:
    text += addition
p.write_text(text)
