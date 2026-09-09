from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Callable

WORKER_DIR = Path(__file__).resolve().parents[1] / "aws" / "audio-tools" / "worker"
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from music_intelligence_core import build_profile  # noqa: E402

ANALYZER_VERSION = "music-intelligence-mirflex-local-v1"
DEFAULT_ANALYSIS_SECONDS = 180.0

_NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
_MAJOR_PROFILE = (6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
_MINOR_PROFILE = (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)
_CAMELOT_MAJOR = {
    "B": "1B", "F#": "2B", "C#": "3B", "G#": "4B", "D#": "5B", "A#": "6B",
    "F": "7B", "C": "8B", "G": "9B", "D": "10B", "A": "11B", "E": "12B",
}
_CAMELOT_MINOR = {
    "G#": "1A", "D#": "2A", "A#": "3A", "F": "4A", "C": "5A", "G": "6A",
    "D": "7A", "A": "8A", "E": "9A", "B": "10A", "F#": "11A", "C#": "12A",
}


def _analysis_seconds() -> float:
    try:
        value = float(os.getenv("MIRFLEX_ANALYSIS_SECONDS", str(DEFAULT_ANALYSIS_SECONDS)))
    except (TypeError, ValueError):
        value = DEFAULT_ANALYSIS_SECONDS
    return max(30.0, min(600.0, value))


def _key_from_chroma(chroma: Any) -> tuple[str | None, str | None, float]:
    import numpy as np

    values = np.asarray(chroma, dtype=float).reshape(-1)
    if values.size != 12 or not np.isfinite(values).all() or float(values.sum()) <= 0:
        return None, None, 0.0

    def correlation(profile: tuple[float, ...], tonic: int) -> float:
        rolled = np.roll(np.asarray(profile, dtype=float), tonic)
        if float(np.std(values)) == 0.0 or float(np.std(rolled)) == 0.0:
            return -1.0
        return float(np.corrcoef(values, rolled)[0, 1])

    candidates: list[tuple[float, int, str]] = []
    for tonic in range(12):
        candidates.append((correlation(_MAJOR_PROFILE, tonic), tonic, "major"))
        candidates.append((correlation(_MINOR_PROFILE, tonic), tonic, "minor"))
    candidates.sort(key=lambda item: item[0], reverse=True)

    best_score, tonic, mode = candidates[0]
    second_score = candidates[1][0]
    if not (best_score > 0.1):
        return None, None, 0.0

    note = _NOTE_NAMES[tonic]
    key = note if mode == "major" else f"{note}m"
    camelot = _CAMELOT_MAJOR[note] if mode == "major" else _CAMELOT_MINOR[note]
    margin = max(0.0, best_score - second_score)
    confidence = max(0.0, min(0.95, 0.2 + 0.5 * max(0.0, best_score) + 0.8 * margin))
    return key, camelot, round(confidence, 4)


def _tempo_confidence(onset_envelope: Any, bpm: float) -> float:
    import numpy as np

    values = np.asarray(onset_envelope, dtype=float).reshape(-1)
    if bpm <= 0 or values.size < 4 or not np.isfinite(values).all():
        return 0.0
    upper = float(np.percentile(values, 90))
    baseline = float(np.median(values))
    contrast = max(0.0, (upper - baseline) / max(upper, 1e-9))
    return round(max(0.2, min(0.8, 0.3 + 0.5 * contrast)), 4)


def extract_mirflex_features(source: Path) -> dict[str, Any]:
    """Extract resource-bounded MIR features locally without any network model call.

    This follows MIRFLEX's modular local-feature approach while deliberately avoiding
    its optional Essentia/TensorFlow semantic model stack, which is too heavy for the
    current Render worker and has separate commercial licensing requirements.
    """
    import librosa
    import numpy as np

    audio, sample_rate = librosa.load(
        str(source),
        sr=22050,
        mono=True,
        duration=_analysis_seconds(),
    )
    audio = np.asarray(audio, dtype=np.float32)
    if audio.size == 0:
        raise RuntimeError("MIRFLEX local analysis could not read audio samples.")

    trimmed, _ = librosa.effects.trim(audio, top_db=50)
    if trimmed.size >= max(1, sample_rate // 2):
        audio = trimmed

    onset_envelope = librosa.onset.onset_strength(y=audio, sr=sample_rate)
    tempo_values = librosa.feature.tempo(
        onset_envelope=onset_envelope,
        sr=sample_rate,
        aggregate=np.median,
    )
    bpm = float(np.atleast_1d(tempo_values)[0]) if np.size(tempo_values) else 0.0
    if not np.isfinite(bpm) or bpm < 30.0 or bpm > 300.0:
        bpm = 0.0

    chroma = librosa.feature.chroma_stft(
        y=audio,
        sr=sample_rate,
        n_fft=4096,
        hop_length=2048,
    )
    mean_chroma = np.nanmean(chroma, axis=1) if np.size(chroma) else np.zeros(12, dtype=float)
    key, camelot_key, key_confidence = _key_from_chroma(mean_chroma)

    return {
        "bpm": bpm,
        "bpm_confidence": _tempo_confidence(onset_envelope, bpm),
        "key": key,
        "camelot_key": camelot_key,
        "key_confidence": key_confidence,
    }


def profile_from_mirflex_features(features: dict[str, Any]) -> dict[str, Any]:
    return build_profile(
        bpm=features.get("bpm"),
        bpm_confidence=features.get("bpm_confidence"),
        key=features.get("key"),
        camelot_key=features.get("camelot_key"),
        key_confidence=features.get("key_confidence"),
        genres=[],
        moods=[],
        styles=[],
        instruments=[],
        sections=[],
        keywords=[],
        analyzer_version=ANALYZER_VERSION,
        evidence={
            "provider": "mirflex",
            "implementation": "ezway-mirflex-local",
            "analysis_device": "cpu",
            "source": "audio-file",
            "analysis_window_seconds": _analysis_seconds(),
            "semantic_models": "disabled",
        },
    )


class MirflexMusicIntelligenceEngine:
    def __init__(
        self,
        *,
        feature_extractor: Callable[[Path], dict[str, Any]] = extract_mirflex_features,
    ) -> None:
        self.feature_extractor = feature_extractor

    def analyze_file(self, source: Path) -> dict[str, Any]:
        features = self.feature_extractor(Path(source))
        return profile_from_mirflex_features(features)
