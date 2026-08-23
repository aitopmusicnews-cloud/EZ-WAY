from __future__ import annotations

import math
import os
import subprocess
import tempfile
import uuid
import zipfile
from pathlib import Path

import modal

import audio_tools_agent_v2 as base

app = base.app

ANALYZER_VERSION = "music-intelligence-v1"
CLAP_MODEL_ID = "laion/larger_clap_music"
ANALYSIS_GPU_NAME = os.getenv("EZWAY_ANALYSIS_GPU", "").strip()
ANALYSIS_GPU = None if ANALYSIS_GPU_NAME.lower() in {"", "cpu", "none", "false", "0"} else ANALYSIS_GPU_NAME

CUDA_LIBRARY_PATH = (
    "/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:"
    "/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib"
)

# Keep the proven v4 lyrics/stems environment isolated from the new analyzer stack.
audio_image = (
    base.audio_image
    .uv_pip_install(
        "torchcodec>=0.13,<0.14",
        "nvidia-cublas-cu12",
        "nvidia-cudnn-cu12==9.*",
    )
    .env({"LD_LIBRARY_PATH": CUDA_LIBRARY_PATH})
    .add_local_python_source("audio_tools_agent_v2")
)

analysis_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .uv_pip_install(
        "all-in-one-infer>=3.1,<4",
        "transformers>=4.47,<6",
        "librosa>=0.10,<0.12",
        "soundfile>=0.12,<1",
        "huggingface-hub[hf_xet]",
        "httpx",
    )
    .add_local_python_source("audio_tools_agent_v2", "music_intelligence_core")
)

web_image = base.web_image.add_local_python_source(
    "audio_tools_agent_v2",
    "music_intelligence_core",
)

GENRE_LABELS = [
    "Hip-Hop", "Trap", "Drill", "Boom Bap", "Lo-fi Hip-Hop", "R&B",
    "Alternative R&B", "Neo Soul", "Soul", "Gospel", "Pop", "Indie Pop",
    "Rock", "Alternative Rock", "Metal", "Punk", "Jazz", "Blues", "Funk",
    "Reggae", "Dancehall", "Afrobeats", "Amapiano", "Reggaeton", "Latin Pop",
    "House", "Techno", "Trance", "Drum and Bass", "Dubstep", "Ambient",
    "Cinematic", "Synthwave", "Phonk", "Country", "Folk", "Classical",
]

STYLE_LABELS = [
    "Melodic Trap", "Trap Soul", "Dark Trap", "Hard Trap", "West Coast Hip-Hop",
    "East Coast Hip-Hop", "Jersey Club", "UK Drill", "Chicago Drill",
    "Southern Hip-Hop", "Experimental", "Minimal", "Atmospheric", "Dreamy",
    "Psychedelic", "Retro", "Futuristic", "Acoustic", "Orchestral", "Electronic",
    "Club", "Lo-fi", "Sample-based", "Guitar-driven", "Piano-driven",
    "Vocal-heavy", "Instrumental",
]

MOOD_LABELS = [
    "Dark", "Melancholic", "Reflective", "Romantic", "Aggressive", "Energetic",
    "Euphoric", "Uplifting", "Chill", "Dreamy", "Moody", "Intimate", "Confident",
    "Tense", "Suspenseful", "Hopeful", "Nostalgic", "Smooth", "Sensual", "Playful",
    "Triumphant",
]

INSTRUMENT_LABELS = [
    "808 Bass", "Sub Bass", "Acoustic Bass", "Kick Drum", "Trap Hi-Hats",
    "Live Drums", "Drum Machine", "Piano", "Electric Piano / Rhodes", "Synth Pad",
    "Lead Synth", "Arpeggiated Synth", "Acoustic Guitar", "Electric Guitar", "Strings",
    "Brass", "Woodwinds", "Organ", "Choir", "Vocal Chops", "Lead Vocals",
    "Background Vocals", "Percussion", "Samples / Vinyl Texture",
]

CAMELOT_MINOR = {
    "Ab": "1A", "Eb": "2A", "Bb": "3A", "F": "4A", "C": "5A", "G": "6A",
    "D": "7A", "A": "8A", "E": "9A", "B": "10A", "F#": "11A", "C#": "12A",
}
CAMELOT_MAJOR = {
    "B": "1B", "F#": "2B", "C#": "3B", "Ab": "4B", "Eb": "5B", "Bb": "6B",
    "F": "7B", "C": "8B", "G": "9B", "D": "10B", "A": "11B", "E": "12B",
}


def _run_demucs(source: Path, output_dir: Path, two_stem: bool) -> Path:
    base._configure_runtime_cache()
    command = [
        "python", "-m", "demucs", "-n", "htdemucs", "--device", "cuda", "--float32",
        "-o", str(output_dir),
    ]
    if two_stem:
        command.extend(["--two-stems", "vocals"])
    command.append(str(source))

    completed = subprocess.run(command, capture_output=True, text=True, timeout=1500)
    if completed.returncode != 0:
        combined = (completed.stdout + "\n" + completed.stderr).strip()
        raise RuntimeError(f"Demucs separation failed.\n{combined[-2500:]}")

    stem_dir = output_dir / "htdemucs" / source.stem
    if not stem_dir.is_dir():
        raise RuntimeError(f"Demucs output folder was not created: {stem_dir}")
    return stem_dir


def _camelot_key(root: str, mode: str) -> str | None:
    if mode == "Minor":
        return CAMELOT_MINOR.get(root)
    return CAMELOT_MAJOR.get(root)


def _estimate_key(y, sr: int) -> tuple[str | None, str | None, float | None]:
    import librosa
    import numpy as np

    if y is None or len(y) < sr:
        return None, None, None

    harmonic = librosa.effects.harmonic(y)
    try:
        chroma = librosa.feature.chroma_cqt(y=harmonic, sr=sr)
    except Exception:
        chroma = librosa.feature.chroma_stft(y=harmonic, sr=sr)

    profile = np.mean(chroma, axis=1)
    norm = np.linalg.norm(profile)
    if not np.isfinite(norm) or norm <= 1e-9:
        return None, None, None
    profile = profile / norm

    major_template = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_template = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    note_names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

    candidates: list[tuple[float, str, str]] = []
    for index, root in enumerate(note_names):
        major = np.roll(major_template, index)
        minor = np.roll(minor_template, index)
        major_score = float(np.corrcoef(profile, major)[0, 1])
        minor_score = float(np.corrcoef(profile, minor)[0, 1])
        if math.isfinite(major_score):
            candidates.append((major_score, root, "Major"))
        if math.isfinite(minor_score):
            candidates.append((minor_score, root, "Minor"))

    if not candidates:
        return None, None, None

    candidates.sort(reverse=True, key=lambda item: item[0])
    best_score, root, mode = candidates[0]
    second_score = candidates[1][0] if len(candidates) > 1 else -1.0
    margin = max(0.0, best_score - second_score)
    denominator = max(abs(best_score), 0.05)
    confidence = max(0.0, min(1.0, margin / denominator))
    return f"{root} {mode}", _camelot_key(root, mode), confidence


def _window_starts(duration: float, window_seconds: float) -> list[float]:
    if duration <= window_seconds:
        return [0.0]
    anchors = [0.08, 0.28, 0.50, 0.72, 0.92]
    last_start = max(0.0, duration - window_seconds)
    return [min(last_start, max(0.0, duration * anchor - window_seconds / 2.0)) for anchor in anchors]


def _keyword_list(genres, styles, moods, instruments) -> list[str]:
    values: list[str] = []
    for group, limit in ((genres, 3), (styles, 2), (moods, 2), (instruments, 2)):
        values.extend(str(item.get("label") or "").strip() for item in group[:limit])

    if genres:
        genre = str(genres[0].get("label") or "").strip()
        if genre:
            values.append(f"{genre} music")
            if moods:
                mood = str(moods[0].get("label") or "").strip()
                if mood:
                    values.append(f"{mood} {genre}")

    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        clean = value.strip()
        key = clean.casefold()
        if clean and key not in seen:
            seen.add(key)
            deduped.append(clean)
    return deduped[:12]


@app.cls(
    image=audio_image,
    gpu=base.AUDIO_GPU,
    timeout=1800,
    scaledown_window=180,
    volumes={base.MODEL_ROOT: base.model_volume, base.OUTPUT_ROOT: base.output_volume},
)
class AudioToolsEngineV5:
    @modal.enter()
    def configure_runtime(self) -> None:
        base._configure_runtime_cache()

    @modal.method()
    def separate_stems(self, payload: dict, file_base_url: str) -> dict:
        file_url = str(payload.get("file_url") or "").strip()
        if not file_url:
            raise ValueError("file_url is required")
        mode = str(payload.get("mode") or "vocals_instrumental")
        if mode not in {"vocals_instrumental", "full"}:
            raise ValueError("mode must be vocals_instrumental or full")

        job_id = str(payload.get("job_id") or uuid.uuid4().hex[:16])
        track_name = str(payload.get("track_name") or "track")
        with tempfile.TemporaryDirectory(prefix="ezway-stems-") as temp_name:
            temp_dir = Path(temp_name)
            source = base._download_audio(file_url, temp_dir)
            stem_dir = _run_demucs(source, temp_dir / "separated", two_stem=mode == "vocals_instrumental")
            requested = (
                {"vocals": stem_dir / "vocals.wav", "instrumental": stem_dir / "no_vocals.wav"}
                if mode == "vocals_instrumental"
                else {
                    "vocals": stem_dir / "vocals.wav", "drums": stem_dir / "drums.wav",
                    "bass": stem_dir / "bass.wav", "other": stem_dir / "other.wav",
                }
            )
            missing = [name for name, path in requested.items() if not path.is_file()]
            if missing:
                raise RuntimeError(f"Missing Demucs outputs: {', '.join(missing)}")

            published: dict[str, str] = {}
            zip_path = temp_dir / f"{base._safe_label(track_name)}-stems.zip"
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for name, path in requested.items():
                    _, public_url = base._publish_file(path, job_id, name, file_base_url)
                    published[name] = public_url
                    archive.write(path, arcname=f"{base._safe_label(track_name)}-{name}.wav")
            _, bundle_url = base._publish_file(zip_path, job_id, "stems", file_base_url)
            base.output_volume.commit()
            return {
                "status": "completed", "job_id": job_id, "action": "stems", "mode": mode,
                "engine": "demucs-htdemucs+torchcodec", "files": published, "bundle_url": bundle_url,
            }

    @modal.method()
    def generate_synced_lyrics(self, payload: dict, file_base_url: str) -> dict:
        file_url = str(payload.get("file_url") or "").strip()
        if not file_url:
            raise ValueError("file_url is required")
        job_id = str(payload.get("job_id") or uuid.uuid4().hex[:16])
        track_name = str(payload.get("track_name") or "track")

        with tempfile.TemporaryDirectory(prefix="ezway-lyrics-") as temp_name:
            temp_dir = Path(temp_name)
            source = base._download_audio(file_url, temp_dir)
            stem_dir = _run_demucs(source, temp_dir / "separated", two_stem=True)
            vocal_path = stem_dir / "vocals.wav"
            if not vocal_path.is_file():
                raise RuntimeError("Vocal stem was not produced, so lyrics were not generated")

            whisper_dir = Path(base.MODEL_ROOT) / "faster-whisper-large-v3"
            if not whisper_dir.is_dir() or not any(whisper_dir.iterdir()):
                raise RuntimeError("Whisper model is not prepared. Run prepare_audio_models before transcription.")

            from faster_whisper import WhisperModel

            model = WhisperModel(str(whisper_dir), device="cuda", compute_type="float16", local_files_only=True)
            segments, info = model.transcribe(
                str(vocal_path), beam_size=5, word_timestamps=True,
                condition_on_previous_text=False, vad_filter=False,
            )
            lrc_lines: list[str] = []
            plain_lines: list[str] = []
            for segment in segments:
                text = (segment.text or "").strip()
                if text:
                    lrc_lines.append(f"{base._format_lrc_time(segment.start)} {text}")
                    plain_lines.append(text)
            if not lrc_lines:
                raise RuntimeError("No reliable vocal transcript was detected. Lyrics were left unchanged rather than invented.")

            lyrics = "\n".join(lrc_lines)
            lrc_path = temp_dir / f"{base._safe_label(track_name)}.lrc"
            txt_path = temp_dir / f"{base._safe_label(track_name)}-lyrics.txt"
            lrc_path.write_text(lyrics + "\n", encoding="utf-8")
            txt_path.write_text("\n".join(plain_lines) + "\n", encoding="utf-8")
            _, lrc_url = base._publish_file(lrc_path, job_id, "lyrics", file_base_url)
            _, txt_url = base._publish_file(txt_path, job_id, "lyrics-plain", file_base_url)
            _, vocals_url = base._publish_file(vocal_path, job_id, "vocals", file_base_url)
            base.output_volume.commit()
            return {
                "status": "completed", "job_id": job_id, "action": "lyrics",
                "engine": "demucs+torchcodec+faster-whisper-large-v3+cuda12",
                "language": getattr(info, "language", None),
                "language_probability": getattr(info, "language_probability", None),
                "lyrics": lyrics, "files": {"lrc": lrc_url, "plain": txt_url, "vocals": vocals_url},
            }


@app.cls(
    image=analysis_image,
    gpu=ANALYSIS_GPU,
    timeout=1800,
    scaledown_window=120,
    volumes={base.MODEL_ROOT: base.model_volume},
)
class MusicIntelligenceEngine:
    @modal.enter()
    def load_models(self) -> None:
        base._configure_runtime_cache()
        import torch
        from allin1_infer import AllInOneSession
        from transformers import ClapModel, ClapProcessor

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.structure = AllInOneSession(model="harmonix-all", device=str(self.device))
        self.structure.load()
        self.clap_processor = ClapProcessor.from_pretrained(CLAP_MODEL_ID, local_files_only=False)
        self.clap_model = ClapModel.from_pretrained(CLAP_MODEL_ID, local_files_only=False).to(self.device)
        self.clap_model.eval()
        self.text_embeddings = self._prepare_text_embeddings()

    def _prepare_text_embeddings(self):
        import torch
        import torch.nn.functional as functional

        groups = {
            "genres": (GENRE_LABELS, "a music track in the genre of {}"),
            "styles": (STYLE_LABELS, "a music track with a {} style"),
            "moods": (MOOD_LABELS, "a {} sounding music track"),
            "instruments": (INSTRUMENT_LABELS, "a music track featuring {}"),
        }
        embeddings = {}
        with torch.inference_mode():
            for name, (labels, template) in groups.items():
                prompts = [template.format(label) for label in labels]
                inputs = self.clap_processor(text=prompts, padding=True, return_tensors="pt")
                inputs = {key: value.to(self.device) for key, value in inputs.items()}
                text = self.clap_model.get_text_features(**inputs)
                embeddings[name] = (labels, functional.normalize(text, dim=-1))
        return embeddings

    def _rank_window(self, audio_window, sr: int) -> dict[str, dict[str, float]]:
        import torch
        import torch.nn.functional as functional

        inputs = self.clap_processor(audios=audio_window, sampling_rate=sr, return_tensors="pt")
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        with torch.inference_mode():
            audio = functional.normalize(self.clap_model.get_audio_features(**inputs), dim=-1)

        output: dict[str, dict[str, float]] = {}
        for group, (labels, text) in self.text_embeddings.items():
            similarities = (audio @ text.T).squeeze(0).detach().cpu().tolist()
            output[group] = {
                label: max(0.0, min(1.0, (float(score) + 1.0) / 2.0))
                for label, score in zip(labels, similarities)
            }
        return output

    @modal.method()
    def analyze_music(self, payload: dict) -> dict:
        import librosa
        from music_intelligence_core import aggregate_rankings, build_profile

        file_url = str(payload.get("file_url") or "").strip()
        if not file_url:
            raise ValueError("file_url is required")
        job_id = str(payload.get("job_id") or uuid.uuid4().hex[:16])

        with tempfile.TemporaryDirectory(prefix="ezway-analysis-") as temp_name:
            temp_dir = Path(temp_name)
            source = base._download_audio(file_url, temp_dir)

            structure_result = self.structure.infer(str(source))
            sections = [
                {"start": float(segment.start), "end": float(segment.end), "label": str(segment.label)}
                for segment in structure_result.segments
            ]

            target_sr = int(getattr(self.clap_processor.feature_extractor, "sampling_rate", 48000))
            y, sr = librosa.load(str(source), sr=target_sr, mono=True)
            duration = float(librosa.get_duration(y=y, sr=sr))
            window_seconds = min(10.0, max(4.0, duration))
            window_samples = max(1, int(window_seconds * sr))

            score_windows = {"genres": [], "styles": [], "moods": [], "instruments": []}
            for start_seconds in _window_starts(duration, window_seconds):
                start = int(start_seconds * sr)
                window = y[start:start + window_samples]
                if len(window) < sr:
                    continue
                window_scores = self._rank_window(window, sr)
                for group in score_windows:
                    score_windows[group].append(window_scores[group])

            genres = aggregate_rankings(score_windows["genres"], limit=5)
            styles = aggregate_rankings(score_windows["styles"], limit=5)
            moods = aggregate_rankings(score_windows["moods"], limit=5)
            instruments = aggregate_rankings(score_windows["instruments"], limit=6)
            key, camelot, key_confidence = _estimate_key(y, sr)
            keywords = _keyword_list(genres, styles, moods, instruments)

            profile = build_profile(
                bpm=getattr(structure_result, "bpm", 0),
                sections=sections,
                genres=genres,
                moods=moods,
                instruments=instruments,
                styles=styles,
                keywords=keywords,
                key=key,
                camelot_key=camelot,
                key_confidence=key_confidence,
                analyzer_version=ANALYZER_VERSION,
                evidence={
                    "structure_model": "all-in-one-infer/harmonix-all",
                    "semantic_model": CLAP_MODEL_ID,
                    "semantic_windows": len(score_windows["genres"]),
                    "duration_seconds": round(duration, 3),
                    "device": str(self.device),
                },
            )
            return {
                "status": "completed", "job_id": job_id, "action": "analysis",
                "engine": ANALYZER_VERSION, "profile": profile,
            }


@app.function(
    image=analysis_image,
    timeout=3600,
    volumes={base.MODEL_ROOT: base.model_volume},
)
def prepare_music_intelligence_models() -> dict:
    base._configure_runtime_cache()
    from allin1_infer import AllInOneSession
    from huggingface_hub import snapshot_download

    snapshot_download(repo_id=CLAP_MODEL_ID)
    session = AllInOneSession(model="harmonix-all", device="cpu")
    session.load()
    session.release()
    base.model_volume.commit()
    return {
        "status": "ready", "structure": "all-in-one-infer/harmonix-all",
        "semantic": CLAP_MODEL_ID, "analysis_gpu": ANALYSIS_GPU_NAME or "cpu",
    }


@app.function(
    image=web_image,
    volumes={base.OUTPUT_ROOT: base.output_volume},
)
@modal.concurrent(max_inputs=30)
@modal.asgi_app(requires_proxy_auth=base.REQUIRE_PROXY_AUTH)
def audio_tools_api_v5():
    from fastapi import Body, FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, JSONResponse

    web = FastAPI(title="EZ-WAY Audio Tools v5")
    web.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @web.get("/health")
    async def health():
        return {
            "status": "ok", "gpu": base.AUDIO_GPU, "analysis_gpu": ANALYSIS_GPU_NAME or "cpu",
            "tools": ["music_analysis", "synced_lyrics", "vocals_instrumental", "full_stems"],
            "runtime": "music-intelligence-v1+torchcodec+whisper-cuda12",
        }

    @web.post("/jobs")
    async def create_job(payload: dict = Body(...)):
        action = str(payload.get("action") or "").strip()
        file_url = str(payload.get("file_url") or "").strip()
        public_base_url = str(payload.get("public_base_url") or "").strip().rstrip("/")

        if action not in {"analysis", "lyrics", "stems"}:
            raise HTTPException(status_code=400, detail="action must be analysis, lyrics, or stems")
        if not file_url or file_url.startswith("blob:"):
            raise HTTPException(status_code=400, detail="A cloud-accessible track file_url is required for Audio Tools")
        if not public_base_url.startswith("https://"):
            raise HTTPException(status_code=400, detail="Audio Tools public_base_url is required")

        job_id = str(payload.get("job_id") or uuid.uuid4().hex[:16])
        if action == "analysis":
            call = MusicIntelligenceEngine().analyze_music.spawn(payload={**payload, "job_id": job_id})
        else:
            engine = AudioToolsEngineV5()
            file_base_url = f"{public_base_url}/files"
            if action == "lyrics":
                call = engine.generate_synced_lyrics.spawn(
                    payload={**payload, "job_id": job_id}, file_base_url=file_base_url,
                )
            else:
                mode = str(payload.get("mode") or "vocals_instrumental")
                if mode not in {"vocals_instrumental", "full"}:
                    raise HTTPException(status_code=400, detail="Invalid stem mode")
                call = engine.separate_stems.spawn(
                    payload={**payload, "job_id": job_id, "mode": mode}, file_base_url=file_base_url,
                )

        return {
            "status": "accepted", "job_id": job_id, "call_id": call.object_id,
            "action": action, "gpu": base.AUDIO_GPU if action != "analysis" else (ANALYSIS_GPU_NAME or "cpu"),
        }

    @web.get("/jobs/{call_id}")
    async def get_job(call_id: str):
        function_call = modal.FunctionCall.from_id(call_id)
        try:
            result = await function_call.get.aio(timeout=0)
        except TimeoutError:
            return JSONResponse({"status": "running", "call_id": call_id}, status_code=202)
        except modal.exception.OutputExpiredError:
            return JSONResponse({"error": "Job result expired"}, status_code=404)
        except Exception as error:
            message = f"{type(error).__name__}: {error}"
            return JSONResponse({"status": "failed", "error": message[-3000:]}, status_code=500)
        return result

    @web.get("/files/{filename}")
    async def get_file(filename: str):
        safe_name = Path(filename).name
        if safe_name != filename or not safe_name.startswith("audio-"):
            return JSONResponse({"error": "Invalid filename"}, status_code=400)
        if Path(safe_name).suffix.lower() not in {".wav", ".zip", ".lrc", ".txt"}:
            return JSONResponse({"error": "Unsupported file type"}, status_code=400)

        base.output_volume.reload()
        filepath = Path(base.OUTPUT_ROOT) / safe_name
        if not filepath.is_file():
            return JSONResponse({"error": "Audio output not found"}, status_code=404)
        media_types = {
            ".wav": "audio/wav", ".zip": "application/zip",
            ".lrc": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
        }
        return FileResponse(filepath, media_type=media_types[filepath.suffix.lower()], filename=safe_name)

    return web
