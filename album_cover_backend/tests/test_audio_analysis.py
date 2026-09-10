from __future__ import annotations

import numpy as np
import soundfile as sf

from app.audio_analysis import AudioAnalyzer


def _write_tone(path, amplitude: float, seconds: float = 2.0, sr: int = 22050) -> None:
    t = np.arange(int(seconds * sr), dtype=np.float32) / sr
    # Pulse-modulated tone gives the beat/onset code some movement while keeping
    # the amplitude comparison deterministic.
    carrier = np.sin(2 * np.pi * 220 * t)
    pulse = 0.55 + 0.45 * (np.sin(2 * np.pi * 2 * t) > 0).astype(np.float32)
    sf.write(path, (amplitude * carrier * pulse).astype(np.float32), sr)


def test_loudness_uses_original_amplitude_not_normalized_waveform(tmp_path):
    quiet = tmp_path / "quiet.wav"
    loud = tmp_path / "loud.wav"
    _write_tone(quiet, 0.08)
    _write_tone(loud, 0.8)

    analyzer = AudioAnalyzer(max_seconds=10)
    quiet_signal = analyzer.analyze(quiet)
    loud_signal = analyzer.analyze(loud)

    assert loud_signal["loudness_dbfs"] > quiet_signal["loudness_dbfs"] + 12
    assert loud_signal["energy"] > quiet_signal["energy"]
    assert 55 <= loud_signal["tempo_bpm"] <= 210
    assert "tempo_confidence" in loud_signal
    assert "genre_confidence" in loud_signal


def test_section_summary_marks_low_and_high_energy_regions():
    analyzer = AudioAnalyzer()
    features = [
        {"name": "region_1", "start": 0.0, "end": 20.0, "energy": 0.2, "brightness": 0.3, "beat_density": 0.4},
        {"name": "region_2", "start": 20.0, "end": 40.0, "energy": 0.8, "brightness": 0.7, "beat_density": 0.9},
    ]

    summary = analyzer.summarize_sections(features)

    assert summary["lowest_intensity_region"]["start"] == 0.0
    assert summary["highest_intensity_region"]["start"] == 20.0
    assert summary["major_energy_transitions"][0]["direction"] == "up"
    assert summary["major_energy_transitions"][0]["delta"] == 0.6


def test_audio_analysis_includes_neutral_section_timeline(tmp_path):
    audio = tmp_path / "changing.wav"
    sr = 22050
    t = np.arange(44 * sr, dtype=np.float32) / sr
    carrier = np.sin(2 * np.pi * 220 * t)
    envelope = np.where(t < 22, 0.08, 0.8).astype(np.float32)
    sf.write(audio, (carrier * envelope).astype(np.float32), sr)

    signal = AudioAnalyzer(max_seconds=60).analyze(audio)

    assert len(signal["sections"]) >= 2
    assert all(item["name"].startswith("region_") for item in signal["sections"])
    assert signal["section_summary"]["highest_intensity_region"]["energy"] > signal["section_summary"]["lowest_intensity_region"]["energy"]
