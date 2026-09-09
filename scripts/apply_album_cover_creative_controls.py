from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}\n--- pattern ---\n{old[:500]}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_all_checked(path: str, old: str, new: str, expected: int) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} matches, found {count}\n--- pattern ---\n{old[:500]}")
    target.write_text(text.replace(old, new), encoding="utf-8")


# ---------------------------------------------------------------------------
# Frontend API contract
# ---------------------------------------------------------------------------
replace_once(
    "src/services/albumCoverStudio.ts",
    "export type AlbumCoverVariationCount = 3 | 4 | 5;\n\nexport interface AlbumCoverSourceInput {",
    "export type AlbumCoverVariationCount = 3 | 4 | 5;\n"
    "export type AlbumCoverCreativeStrength = 'loose' | 'balanced' | 'strict';\n\n"
    "export interface AlbumCoverCreativeControls {\n"
    "  subjectHint?: string;\n"
    "  sceneHint?: string;\n"
    "  stylePreset?: 'auto' | 'photo' | 'cinematic' | 'illustration' | 'painting' | 'collage' | 'minimal';\n"
    "  compositionPreset?: 'auto' | 'close-up' | 'portrait' | 'wide' | 'centered' | 'off-center' | 'minimal';\n"
    "  colorMood?: string;\n"
    "  mustInclude?: string;\n"
    "  avoid?: string;\n"
    "  creativeStrength?: AlbumCoverCreativeStrength;\n"
    "}\n\n"
    "export interface AlbumCoverSourceInput {",
)
replace_once(
    "src/services/albumCoverStudio.ts",
    "  variationCount?: AlbumCoverVariationCount;\n  collectionId: string;",
    "  variationCount?: AlbumCoverVariationCount;\n  creativeControls?: AlbumCoverCreativeControls;\n  collectionId: string;",
)
replace_once(
    "src/services/albumCoverStudio.ts",
    "const parseJson = async <T>(response: Response): Promise<T> => {",
    "const creativeControlPayload = (controls: AlbumCoverCreativeControls = {}) => ({\n"
    "  subject_hint: String(controls.subjectHint || '').trim(),\n"
    "  scene_hint: String(controls.sceneHint || '').trim(),\n"
    "  style_preset: controls.stylePreset || 'auto',\n"
    "  composition_preset: controls.compositionPreset || 'auto',\n"
    "  color_mood: String(controls.colorMood || '').trim(),\n"
    "  must_include: String(controls.mustInclude || '').trim(),\n"
    "  avoid: String(controls.avoid || '').trim(),\n"
    "  creative_strength: controls.creativeStrength || 'balanced',\n"
    "});\n\n"
    "const parseJson = async <T>(response: Response): Promise<T> => {",
)
replace_once(
    "src/services/albumCoverStudio.ts",
    "  form.set('run_async', 'true');\n  if (source.audio) {",
    "  form.set('run_async', 'true');\n"
    "  const controls = creativeControlPayload(source.creativeControls);\n"
    "  Object.entries(controls).forEach(([key, value]) => form.set(key, value));\n"
    "  if (source.audio) {",
)
replace_once(
    "src/services/albumCoverStudio.ts",
    "export const runAlbumCoverPath = async (\n  generationId: string,\n  moodPath: Exclude<AlbumCoverMoodPath, 'auto'>,\n  variationCount: AlbumCoverVariationCount,\n  action: 'generate' | 'regenerate' = 'regenerate',\n): Promise<AlbumCoverGeneration> => (\n  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/generations/${encodeURIComponent(generationId)}/${action}`), {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },\n    body: JSON.stringify({ mood_path: moodPath, variation_count: variationCount, run_async: true }),\n  }))\n);",
    "export const runAlbumCoverPath = async (\n"
    "  generationId: string,\n"
    "  moodPath: Exclude<AlbumCoverMoodPath, 'auto'>,\n"
    "  variationCount: AlbumCoverVariationCount,\n"
    "  action: 'generate' | 'regenerate' = 'regenerate',\n"
    "  creativeControls: AlbumCoverCreativeControls = {},\n"
    "): Promise<AlbumCoverGeneration> => (\n"
    "  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/generations/${encodeURIComponent(generationId)}/${action}`), {\n"
    "    method: 'POST',\n"
    "    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },\n"
    "    body: JSON.stringify({\n"
    "      mood_path: moodPath,\n"
    "      variation_count: variationCount,\n"
    "      run_async: true,\n"
    "      ...creativeControlPayload(creativeControls),\n"
    "    }),\n"
    "  }))\n"
    ");",
)
replace_once(
    "src/services/albumCoverStudio.ts",
    "export const regenerateAlbumCovers = async (\n  generationId: string,\n  moodPath: Exclude<AlbumCoverMoodPath, 'auto'> = 'blend',\n  variationCount: AlbumCoverVariationCount = 4,\n): Promise<AlbumCoverGeneration> => runAlbumCoverPath(generationId, moodPath, variationCount, 'regenerate');",
    "export const regenerateAlbumCovers = async (\n"
    "  generationId: string,\n"
    "  moodPath: Exclude<AlbumCoverMoodPath, 'auto'> = 'blend',\n"
    "  variationCount: AlbumCoverVariationCount = 4,\n"
    "  creativeControls: AlbumCoverCreativeControls = {},\n"
    "): Promise<AlbumCoverGeneration> => runAlbumCoverPath(\n"
    "  generationId, moodPath, variationCount, 'regenerate', creativeControls,\n"
    ");",
)
replace_once(
    "src/services/albumCoverStudio.ts",
    "export const generateBetterAlbumCovers = async (\n  generationId: string,\n  moodPath: Exclude<AlbumCoverMoodPath, 'auto'>,\n  variationCount: AlbumCoverVariationCount,\n): Promise<AlbumCoverGeneration> => (\n  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/generations/${encodeURIComponent(generationId)}/improve`), {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },\n    body: JSON.stringify({ mood_path: moodPath, variation_count: variationCount, run_async: true }),\n  }))\n);",
    "export const generateBetterAlbumCovers = async (\n"
    "  generationId: string,\n"
    "  moodPath: Exclude<AlbumCoverMoodPath, 'auto'>,\n"
    "  variationCount: AlbumCoverVariationCount,\n"
    "  creativeControls: AlbumCoverCreativeControls = {},\n"
    "): Promise<AlbumCoverGeneration> => (\n"
    "  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/generations/${encodeURIComponent(generationId)}/improve`), {\n"
    "    method: 'POST',\n"
    "    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },\n"
    "    body: JSON.stringify({\n"
    "      mood_path: moodPath,\n"
    "      variation_count: variationCount,\n"
    "      run_async: true,\n"
    "      ...creativeControlPayload(creativeControls),\n"
    "    }),\n"
    "  }))\n"
    ");",
)

# ---------------------------------------------------------------------------
# React controls UI + wiring
# ---------------------------------------------------------------------------
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "  type AlbumCoverGeneration,\n  type AlbumCoverMetrics,",
    "  type AlbumCoverCreativeControls,\n  type AlbumCoverGeneration,\n  type AlbumCoverMetrics,",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "  const [variationCount, setVariationCount] = useState<AlbumCoverVariationCount>(4);\n  const [generation, setGeneration]",
    "  const [variationCount, setVariationCount] = useState<AlbumCoverVariationCount>(4);\n"
    "  const [subjectHint, setSubjectHint] = useState('');\n"
    "  const [sceneHint, setSceneHint] = useState('');\n"
    "  const [stylePreset, setStylePreset] = useState<NonNullable<AlbumCoverCreativeControls['stylePreset']>>('auto');\n"
    "  const [compositionPreset, setCompositionPreset] = useState<NonNullable<AlbumCoverCreativeControls['compositionPreset']>>('auto');\n"
    "  const [colorMood, setColorMood] = useState('');\n"
    "  const [mustInclude, setMustInclude] = useState('');\n"
    "  const [avoid, setAvoid] = useState('');\n"
    "  const [creativeStrength, setCreativeStrength] = useState<NonNullable<AlbumCoverCreativeControls['creativeStrength']>>('balanced');\n"
    "  const [generation, setGeneration]",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "  const titleDirty = Boolean(selectedTrack && titleInput.trim() && titleInput.trim() !== String(selectedTrack.name || '').trim());\n\n  const refreshCollection",
    "  const titleDirty = Boolean(selectedTrack && titleInput.trim() && titleInput.trim() !== String(selectedTrack.name || '').trim());\n"
    "  const creativeControls = useMemo<AlbumCoverCreativeControls>(() => ({\n"
    "    subjectHint: subjectHint.trim(),\n"
    "    sceneHint: sceneHint.trim(),\n"
    "    stylePreset,\n"
    "    compositionPreset,\n"
    "    colorMood: colorMood.trim(),\n"
    "    mustInclude: mustInclude.trim(),\n"
    "    avoid: avoid.trim(),\n"
    "    creativeStrength,\n"
    "  }), [subjectHint, sceneHint, stylePreset, compositionPreset, colorMood, mustInclude, avoid, creativeStrength]);\n\n"
    "  const refreshCollection",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "        parentalAdvisory,\n        variationCount,\n      });",
    "        parentalAdvisory,\n        variationCount,\n        creativeControls,\n      });",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "      const queued = await runAlbumCoverPath(generation.id, path, variationCount, action);",
    "      const queued = await runAlbumCoverPath(generation.id, path, variationCount, action, creativeControls);",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "        moodPathFromSet(latestSet.mood_path),\n        variationCount,\n      );",
    "        moodPathFromSet(latestSet.mood_path),\n        variationCount,\n        creativeControls,\n      );",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "              <p className=\"text-[11px] text-zinc-600 mt-2\">Creative direction: Gemini · Image rendering: OpenAI · Final export: 3000×3000</p>",
    "              <p className=\"text-[11px] text-zinc-600 mt-2\">Creative planning: song intelligence + your controls · Image rendering: Cloudflare FLUX.1 Schnell · Final export: 3000×3000</p>",
)
replace_once(
    "src/components/AlbumCoverStudio.tsx",
    "            <label className=\"space-y-2 block text-xs font-bold text-zinc-400\">\n              <span>Variations</span>",
    "            <div className=\"rounded-3xl border border-orange-500/20 bg-orange-500/[0.04] p-4 space-y-4\">\n"
    "              <div>\n"
    "                <div className=\"flex items-center gap-2\"><WandSparkles className=\"w-4 h-4 text-orange-500\" /><h3 className=\"text-sm font-black\">Creative Control</h3></div>\n"
    "                <p className=\"text-[10px] text-zinc-500 mt-1\">Subject / Scene, style, composition, color, required details, and exclusions are sent ahead of the song brief so FLUX sees them first.</p>\n"
    "              </div>\n"
    "              <div className=\"grid sm:grid-cols-2 gap-3\">\n"
    "                <label className=\"space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500\"><span>Primary subject</span><input value={subjectHint} onChange={(event) => setSubjectHint(event.target.value)} maxLength={300} placeholder=\"e.g. woman in a red suit\" className=\"w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500\" /></label>\n"
    "                <label className=\"space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500\"><span>Scene / setting</span><input value={sceneHint} onChange={(event) => setSceneHint(event.target.value)} maxLength={300} placeholder=\"e.g. empty theater stage\" className=\"w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500\" /></label>\n"
    "              </div>\n"
    "              <div className=\"grid sm:grid-cols-2 gap-3\">\n"
    "                <label className=\"space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500\"><span>Style</span><select value={stylePreset} onChange={(event) => setStylePreset(event.target.value as NonNullable<AlbumCoverCreativeControls['stylePreset']>)} className=\"w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500\"><option value=\"auto\">Auto</option><option value=\"photo\">Photo</option><option value=\"cinematic\">Cinematic</option><option value=\"illustration\">Illustration</option><option value=\"painting\">Painting</option><option value=\"collage\">Collage</option><option value=\"minimal\">Minimal</option></select></label>\n"
    "                <label className=\"space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500\"><span>Composition</span><select value={compositionPreset} onChange={(event) => setCompositionPreset(event.target.value as NonNullable<AlbumCoverCreativeControls['compositionPreset']>)} className=\"w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500\"><option value=\"auto\">Auto</option><option value=\"close-up\">Close-up</option><option value=\"portrait\">Portrait</option><option value=\"wide\">Wide scene</option><option value=\"centered\">Centered</option><option value=\"off-center\">Off-center</option><option value=\"minimal\">Minimal</option></select></label>\n"
    "              </div>\n"
    "              <label className=\"space-y-1.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500\"><span>Color / mood</span><input value={colorMood} onChange={(event) => setColorMood(event.target.value)} maxLength={200} placeholder=\"e.g. warm amber, deep shadows, restrained red\" className=\"w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500\" /></label>\n"
    "              <div className=\"grid sm:grid-cols-2 gap-3\">\n"
    "                <label className=\"space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500\"><span>Must include</span><textarea value={mustInclude} onChange={(event) => setMustInclude(event.target.value)} rows={2} maxLength={500} placeholder=\"Objects, wardrobe, symbols, details…\" className=\"w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500 resize-y\" /></label>\n"
    "                <label className=\"space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500\"><span>Avoid</span><textarea value={avoid} onChange={(event) => setAvoid(event.target.value)} rows={2} maxLength={500} placeholder=\"Cars, city streets, neon, faces…\" className=\"w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500 resize-y\" /></label>\n"
    "              </div>\n"
    "              <div>\n"
    "                <p className=\"text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2\">Creative strength</p>\n"
    "                <div className=\"grid grid-cols-3 gap-2\">{(['loose', 'balanced', 'strict'] as const).map((strength) => <button key={strength} type=\"button\" onClick={() => setCreativeStrength(strength)} className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${creativeStrength === strength ? 'border-orange-500 bg-orange-500 text-black' : 'border-zinc-800 bg-black text-zinc-400'}`}>{strength}</button>)}</div>\n"
    "              </div>\n"
    "            </div>\n\n"
    "            <label className=\"space-y-2 block text-xs font-bold text-zinc-400\">\n"
    "              <span>Variations</span>",
)

# ---------------------------------------------------------------------------
# Backend request schema
# ---------------------------------------------------------------------------
replace_once(
    "album_cover_backend/app/schemas.py",
    "MoodPath = Literal[\"auto\", \"blend\", \"audio\", \"lyrics\"]\n\n\nclass GenerateRequest(BaseModel):",
    "MoodPath = Literal[\"auto\", \"blend\", \"audio\", \"lyrics\"]\n"
    "StylePreset = Literal[\"auto\", \"photo\", \"cinematic\", \"illustration\", \"painting\", \"collage\", \"minimal\"]\n"
    "CompositionPreset = Literal[\"auto\", \"close-up\", \"portrait\", \"wide\", \"centered\", \"off-center\", \"minimal\"]\n"
    "CreativeStrength = Literal[\"loose\", \"balanced\", \"strict\"]\n\n\n"
    "class CreativeControls(BaseModel):\n"
    "    subject_hint: str | None = Field(default=None, max_length=300)\n"
    "    scene_hint: str | None = Field(default=None, max_length=300)\n"
    "    style_preset: StylePreset = \"auto\"\n"
    "    composition_preset: CompositionPreset = \"auto\"\n"
    "    color_mood: str | None = Field(default=None, max_length=200)\n"
    "    must_include: str | None = Field(default=None, max_length=500)\n"
    "    avoid: str | None = Field(default=None, max_length=500)\n"
    "    creative_strength: CreativeStrength = \"balanced\"\n\n"
    "    def as_prompt_dict(self) -> dict[str, str]:\n"
    "        values = self.model_dump()\n"
    "        return {key: str(value).strip() for key, value in values.items() if value is not None and str(value).strip()}\n\n\n"
    "class GenerateRequest(BaseModel):",
)
replace_once(
    "album_cover_backend/app/schemas.py",
    "class RegenerateRequest(BaseModel):\n    mood_path: Literal[\"blend\", \"audio\", \"lyrics\"] = \"blend\"",
    "class RegenerateRequest(CreativeControls):\n    mood_path: Literal[\"blend\", \"audio\", \"lyrics\"] = \"blend\"",
)

# ---------------------------------------------------------------------------
# Backend route accepts controls and forwards them with async jobs
# ---------------------------------------------------------------------------
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "    CollectionMetricsResponse,\n    GenerationResponse,",
    "    CollectionMetricsResponse,\n    CreativeControls,\n    GenerationResponse,",
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "    variation_count: int = Form(default=4, ge=3, le=5),\n    run_async: bool = Form(default=True),\n):",
    "    variation_count: int = Form(default=4, ge=3, le=5),\n"
    "    run_async: bool = Form(default=True),\n"
    "    subject_hint: str | None = Form(default=None),\n"
    "    scene_hint: str | None = Form(default=None),\n"
    "    style_preset: str = Form(default=\"auto\"),\n"
    "    composition_preset: str = Form(default=\"auto\"),\n"
    "    color_mood: str | None = Form(default=None),\n"
    "    must_include: str | None = Form(default=None),\n"
    "    avoid: str | None = Form(default=None),\n"
    "    creative_strength: str = Form(default=\"balanced\"),\n"
    "):",
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "    clean_artist = sanitize_metadata_text(artist, field_name=\"Artist\")\n    if not audio_bytes and not combined_lyrics:",
    "    clean_artist = sanitize_metadata_text(artist, field_name=\"Artist\")\n"
    "    controls = CreativeControls(\n"
    "        subject_hint=sanitize_metadata_text(subject_hint, field_name=\"Subject hint\", max_chars=300),\n"
    "        scene_hint=sanitize_metadata_text(scene_hint, field_name=\"Scene hint\", max_chars=300),\n"
    "        style_preset=style_preset,\n"
    "        composition_preset=composition_preset,\n"
    "        color_mood=sanitize_metadata_text(color_mood, field_name=\"Color / mood\", max_chars=200),\n"
    "        must_include=sanitize_metadata_text(must_include, field_name=\"Must include\", max_chars=500),\n"
    "        avoid=sanitize_metadata_text(avoid, field_name=\"Avoid\", max_chars=500),\n"
    "        creative_strength=creative_strength,\n"
    "    ).as_prompt_dict()\n"
    "    if not audio_bytes and not combined_lyrics:",
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "        parental_advisory=parental_advisory,\n    )",
    "        parental_advisory=parental_advisory,\n        creative_controls=controls,\n    )",
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "            svc.process_generation, created.generation.id, variation_count, mood_path\n        )",
    "            svc.process_generation, created.generation.id, variation_count, mood_path, controls\n        )",
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "    await svc.process_generation(created.generation.id, variation_count, mood_path)",
    "    await svc.process_generation(created.generation.id, variation_count, mood_path, controls)",
)
replace_all_checked(
    "album_cover_backend/app/routers/generations.py",
    "            svc.regenerate, generation_id, payload.variation_count, payload.mood_path\n        )",
    "            svc.regenerate, generation_id, payload.variation_count, payload.mood_path, payload.as_prompt_dict()\n        )",
    2,
)
replace_all_checked(
    "album_cover_backend/app/routers/generations.py",
    "        await svc.regenerate(generation_id, payload.variation_count, payload.mood_path)",
    "        await svc.regenerate(generation_id, payload.variation_count, payload.mood_path, payload.as_prompt_dict())",
    2,
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "            improve, generation_id, payload.variation_count, payload.mood_path\n        )",
    "            improve, generation_id, payload.variation_count, payload.mood_path, payload.as_prompt_dict()\n        )",
)
replace_once(
    "album_cover_backend/app/routers/generations.py",
    "        await improve(generation_id, payload.variation_count, payload.mood_path)",
    "        await improve(generation_id, payload.variation_count, payload.mood_path, payload.as_prompt_dict())",
)

# ---------------------------------------------------------------------------
# Cache identity and base service threading
# ---------------------------------------------------------------------------
replace_once(
    "album_cover_backend/app/validation.py",
    "import hashlib\nimport re",
    "import hashlib\nimport json\nimport re",
)
replace_once(
    "album_cover_backend/app/validation.py",
    "    parental_advisory: bool = False,\n) -> str:\n    canonical = (\n        f\"audio:{audio_hash or '-'}|lyrics:{lyrics_hash or '-'}|\"\n        f\"title:{title or '-'}|artist:{artist or '-'}|advisory:{int(parental_advisory)}\"\n    ).encode(\"utf-8\")",
    "    parental_advisory: bool = False,\n"
    "    creative_controls: dict[str, str] | None = None,\n"
    ") -> str:\n"
    "    controls = json.dumps(creative_controls or {}, sort_keys=True, separators=(\",\", \":\"), ensure_ascii=False)\n"
    "    canonical = (\n"
    "        f\"audio:{audio_hash or '-'}|lyrics:{lyrics_hash or '-'}|\"\n"
    "        f\"title:{title or '-'}|artist:{artist or '-'}|advisory:{int(parental_advisory)}|controls:{controls}\"\n"
    "    ).encode(\"utf-8\")",
)
replace_once(
    "album_cover_backend/app/service.py",
    "from .prompts import attach_concept_plan, build_image_prompt\nfrom .retry import with_retry",
    "from .prompts import attach_concept_plan, build_image_prompt\nfrom .render_prompts import build_creative_control_prompt\nfrom .retry import with_retry",
)
replace_once(
    "album_cover_backend/app/service.py",
    "        parental_advisory: bool,\n    ) -> CreateResult:",
    "        parental_advisory: bool,\n        creative_controls: dict[str, str] | None = None,\n    ) -> CreateResult:",
)
replace_once(
    "album_cover_backend/app/service.py",
    "            audio_hash, lyrics_hash, title=title, artist=artist, parental_advisory=parental_advisory\n        )",
    "            audio_hash, lyrics_hash, title=title, artist=artist, parental_advisory=parental_advisory,\n            creative_controls=creative_controls,\n        )",
)
replace_once(
    "album_cover_backend/app/service.py",
    "                \"parental_advisory\": parental_advisory,\n            },",
    "                \"parental_advisory\": parental_advisory,\n                \"creative_controls\": creative_controls or {},\n            },",
)
replace_once(
    "album_cover_backend/app/service.py",
    "    async def process_generation(\n        self, generation_id: str, variation_count: int = 4, mood_path: str = \"auto\"\n    ) -> None:",
    "    async def process_generation(\n"
    "        self, generation_id: str, variation_count: int = 4, mood_path: str = \"auto\",\n"
    "        creative_controls: dict[str, str] | None = None,\n"
    "    ) -> None:",
)
replace_once(
    "album_cover_backend/app/service.py",
    "                await self._create_and_fill_set(db, generation, variation_count, resolved_path)",
    "                await self._create_and_fill_set(db, generation, variation_count, resolved_path, creative_controls)",
)
replace_once(
    "album_cover_backend/app/service.py",
    "    async def regenerate(\n        self, generation_id: str, variation_count: int, mood_path: str\n    ) -> None:",
    "    async def regenerate(\n"
    "        self, generation_id: str, variation_count: int, mood_path: str,\n"
    "        creative_controls: dict[str, str] | None = None,\n"
    "    ) -> None:",
)
replace_once(
    "album_cover_backend/app/service.py",
    "                await self.process_generation(generation_id, variation_count, mood_path)\n                return\n            await self._create_and_fill_set(db, generation, variation_count, mood_path)",
    "                await self.process_generation(generation_id, variation_count, mood_path, creative_controls)\n                return\n            await self._create_and_fill_set(db, generation, variation_count, mood_path, creative_controls)",
)
replace_once(
    "album_cover_backend/app/service.py",
    "    async def _create_and_fill_set(\n        self, db: Session, generation: Generation, variation_count: int, mood_path: str\n    ) -> None:",
    "    async def _create_and_fill_set(\n"
    "        self, db: Session, generation: Generation, variation_count: int, mood_path: str,\n"
    "        creative_controls: dict[str, str] | None = None,\n"
    "    ) -> None:",
)
replace_once(
    "album_cover_backend/app/service.py",
    "        prompt = build_image_prompt(\n            signal,\n            mood_path,\n            title=generation.title,\n            artist=generation.artist,\n            parental_advisory=bool(generation.parental_advisory),\n            creative_seed=creative_seed,\n        )",
    "        prompt = build_creative_control_prompt(\n"
    "            build_image_prompt(\n"
    "                signal,\n"
    "                mood_path,\n"
    "                title=generation.title,\n"
    "                artist=generation.artist,\n"
    "                parental_advisory=bool(generation.parental_advisory),\n"
    "                creative_seed=creative_seed,\n"
    "            ),\n"
    "            creative_controls,\n"
    "        )",
)

# ---------------------------------------------------------------------------
# Major-label pipeline and Generate Better
# ---------------------------------------------------------------------------
replace_once(
    "album_cover_backend/app/major_label_service.py",
    "from .render_prompts import build_render_prompt",
    "from .render_prompts import build_creative_control_prompt, build_render_prompt",
)
replace_once(
    "album_cover_backend/app/major_label_service.py",
    "    async def _create_and_fill_set(\n        self, db: Session, generation: Generation, variation_count: int, mood_path: str\n    ) -> None:",
    "    async def _create_and_fill_set(\n"
    "        self, db: Session, generation: Generation, variation_count: int, mood_path: str,\n"
    "        creative_controls: dict[str, str] | None = None,\n"
    "    ) -> None:",
)
replace_once(
    "album_cover_backend/app/major_label_service.py",
    "        brief = build_image_prompt(\n            signal,\n            mood_path,\n            title=generation.title,\n            artist=generation.artist,\n            parental_advisory=bool(generation.parental_advisory),\n            creative_seed=seed,\n        )",
    "        brief = build_creative_control_prompt(\n"
    "            build_image_prompt(\n"
    "                signal,\n"
    "                mood_path,\n"
    "                title=generation.title,\n"
    "                artist=generation.artist,\n"
    "                parental_advisory=bool(generation.parental_advisory),\n"
    "                creative_seed=seed,\n"
    "            ),\n"
    "            creative_controls,\n"
    "        )",
)
replace_once(
    "album_cover_backend/app/feedback_generation_service.py",
    "        mood_path: str = \"blend\",\n    ) -> None:",
    "        mood_path: str = \"blend\",\n        creative_controls: dict[str, str] | None = None,\n    ) -> None:",
)
replace_once(
    "album_cover_backend/app/feedback_generation_service.py",
    "                await self.process_generation(generation_id, variation_count, mood_path)\n                return",
    "                await self.process_generation(generation_id, variation_count, mood_path, creative_controls)\n                return",
)
replace_all_checked(
    "album_cover_backend/app/feedback_generation_service.py",
    "await self._create_and_fill_set(db, generation, variation_count, mood_path)",
    "await self._create_and_fill_set(db, generation, variation_count, mood_path, creative_controls)",
    2,
)
replace_once(
    "album_cover_backend/app/feedback_generation_service.py",
    "                        \"improvement_context\": context,\n                    },",
    "                        \"improvement_context\": context,\n                        \"creative_controls\": creative_controls or {},\n                    },",
)

# ---------------------------------------------------------------------------
# FLUX-first control block
# ---------------------------------------------------------------------------
replace_once(
    "album_cover_backend/app/render_prompts.py",
    "_RENDER_VARIATIONS = {",
    "def build_creative_control_prompt(\n"
    "    base_prompt: str, controls: dict[str, Any] | None = None\n"
    ") -> str:\n"
    "    values = controls or {}\n"
    "    if not any(str(value).strip() for value in values.values() if value is not None):\n"
    "        return base_prompt.strip()\n\n"
    "    strength = str(values.get(\"creative_strength\") or \"balanced\").strip().lower()\n"
    "    if strength == \"strict\":\n"
    "        authority = (\n"
    "            \"Follow the user creative controls strictly. User-specified subject, scene, must-include, \"\n"
    "            \"and avoid instructions outrank automatic creative choices. Do not substitute a different central subject or setting.\"\n"
    "        )\n"
    "    elif strength == \"loose\":\n"
    "        authority = \"Use the user creative controls as guidance while allowing tasteful interpretation.\"\n"
    "    else:\n"
    "        authority = \"Follow the user creative controls closely while preserving tasteful creative judgment.\"\n\n"
    "    lines = [\"USER CREATIVE CONTROLS — PRIORITY INSTRUCTIONS\", authority]\n"
    "    labels = (\n"
    "        (\"subject_hint\", \"Primary subject\"),\n"
    "        (\"scene_hint\", \"Scene / setting\"),\n"
    "        (\"style_preset\", \"Visual style\"),\n"
    "        (\"composition_preset\", \"Composition\"),\n"
    "        (\"color_mood\", \"Color / mood\"),\n"
    "        (\"must_include\", \"Must include\"),\n"
    "        (\"avoid\", \"Avoid / do not include\"),\n"
    "    )\n"
    "    for key, label in labels:\n"
    "        value = str(values.get(key) or \"\").strip()\n"
    "        if value and value != \"auto\":\n"
    "            lines.append(f\"{label}: {value}.\")\n"
    "    return \" \".join(lines + [\"SONG-DRIVEN CREATIVE BRIEF:\", base_prompt.strip()]).strip()\n\n\n"
    "_RENDER_VARIATIONS = {",
)

print("Album Cover creative-control patch applied successfully.")
