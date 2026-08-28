from __future__ import annotations

import math
import os
import tempfile
from pathlib import Path

import httpx

from music_intelligence_core import aggregate_rankings, build_profile

ANALYZER_VERSION = "music-intelligence-v1"
CLAP_MODEL_ID = "laion/larger_clap_music"
MODEL_ROOT = Path(os.getenv("MODEL_ROOT", "/models"))

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


def configure_model_cache() -> None:
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(MODEL_ROOT / "hf"))
    os.environ.setdefault("TORCH_HOME", str(MODEL_ROOT / "torch"))
    os.environ.setdefault("XDG_CACHE_HOME", str(MODEL_ROOT / "cache"))


def download_audio(url: str, target_dir: Path) -> Path:
    suffix = Path(url.split("?", 1)[0]).suffix.lower()
    if suffix not in {".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg"}:
        suffix = ".mp3"
    destination = target_dir / f"source{suffix}"
    with httpx.stream("GET", url, timeout=120.0, follow_redirects=True) as response:
        response.raise_for_status()
        content_type = (response.headers.get("content-type") or "").split(";", 1)[0].lower()
        if destination.suffix == ".mp3":
            mapping = {
                "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/flac": ".flac",
                "audio/mp4": ".m4a", "audio/aac": ".aac", "audio/ogg": ".ogg",
            }
            if content_type in mapping:
                destination = target_dir / f"source{mapping[content_type]}"
        with destination.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)
    return destination


def _camelot_key(root: str, mode: str) -> str | None:
    return CAMELOT_MINOR.get(root) if mode == "Minor" else CAMELOT_MAJOR.get(root)


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
        major_score = float(np.corrcoef(profile, np.roll(major_template, index))[0, 1])
        minor_score = float(np.corrcoef(profile, np.roll(minor_template, index))[0, 1])
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
    confidence = max(0.0, min(1.0, margin / max(abs(best_score), 0.05)))
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


class MusicIntelligenceEngine:
    def __init__(self) -> None:
        configure_model_cache()
        import torch
        from allin1_infer import analyze
        from transformers import ClapModel, ClapProcessor

        requested_threads = int(os.getenv("TORCH_NUM_THREADS", "4"))
        torch.set_num_threads(max(1, requested_threads))
        self.device = torch.device("cpu")
        self.structure_analyze = analyze
        self.clap_processor = ClapProcessor.from_pretrained(CLAP_MODEL_ID)
        self.clap_model = ClapModel.from_pretrained(CLAP_MODEL_ID).to(self.device)
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
                text = self.clap_model.get_text_features(**inputs)
                embeddings[name] = (labels, functional.normalize(text, dim=-1))
        return embeddings

    def _rank_window(self, audio_window, sr: int) -> dict[str, dict[str, float]]:
        import torch
        import torch.nn.functional as functional

        inputs = self.clap_processor(audios=audio_window, sampling_rate=sr, return_tensors="pt")
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

    def analyze_url(self, file_url: str) -> dict:
        import librosa

        with tempfile.TemporaryDirectory(prefix="ezway-aws-analysis-") as temp_name:
            temp_dir = Path(temp_name)
            source = download_audio(file_url, temp_dir)
            structure_result = self.structure_analyze(
                str(source),
                model="harmonix-all",
                device="cpu",
                demix_dir=temp_dir / "allin1-demix",
                spec_dir=temp_dir / "allin1-spec",
                keep_byproducts=False,
                multiprocess=False,
            )
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
            return build_profile(
                bpm=getattr(structure_result, "bpm", 0),
                sections=sections,
                genres=genres,
                moods=moods,
                styles=styles,
                instruments=instruments,
                analyzer_version=ANALYZER_VERSION,
                key=key,
                camelot_key=camelot,
                key_confidence=key_confidence,
                keywords=keywords,
                evidence={
                    "provider": "aws-ecs",
                    "structure_model": "harmonix-all",
                    "semantic_model": CLAP_MODEL_ID,
                    "key_method": "librosa-chroma-krumhansl",
                    "analysis_device": "cpu",
                },
            )
