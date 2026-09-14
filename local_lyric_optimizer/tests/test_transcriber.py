from types import SimpleNamespace

from local_lyric_optimizer.config import OptimizerConfig
from local_lyric_optimizer.transcriber import FasterWhisperTranscriber


def test_default_config_is_intel_cpu_int8(monkeypatch):
    monkeypatch.delenv("LYRIC_MODEL_SIZE", raising=False)
    monkeypatch.delenv("LYRIC_CPU_THREADS", raising=False)
    config = OptimizerConfig.from_env()
    assert config.model_size == "small"
    assert config.device == "cpu"
    assert config.compute_type == "int8"
    assert 1 <= config.cpu_threads <= 8


def test_base_model_and_thread_override(monkeypatch):
    monkeypatch.setenv("LYRIC_MODEL_SIZE", "base")
    monkeypatch.setenv("LYRIC_CPU_THREADS", "3")
    config = OptimizerConfig.from_env()
    assert config.model_size == "base"
    assert config.cpu_threads == 3


def test_model_factory_receives_cpu_int8():
    calls = []

    class FakeModel:
        def __init__(self, *args, **kwargs):
            calls.append((args, kwargs))

    transcriber = FasterWhisperTranscriber(
        OptimizerConfig(model_size="base", cpu_threads=4),
        model_class=FakeModel,
    )
    transcriber._get_model()

    assert calls == [
        (("base",), {
            "device": "cpu",
            "compute_type": "int8",
            "cpu_threads": 4,
        })
    ]


def test_transcript_cleanup_preserves_words_and_removes_adjacent_duplicates(tmp_path):
    class FakeModel:
        def transcribe(self, path, **kwargs):
            assert path.endswith("song.wav")
            assert kwargs == {"language": None, "vad_filter": False, "beam_size": 5}
            segments = [
                SimpleNamespace(start=0.0, end=1.0, text="  First   line "),
                SimpleNamespace(start=1.0, end=2.0, text="First line"),
                SimpleNamespace(start=2.0, end=3.0, text=" Second line "),
            ]
            info = SimpleNamespace(language="en", language_probability=0.98)
            return segments, info

    audio = tmp_path / "song.wav"
    audio.write_bytes(b"fake wav")
    transcriber = FasterWhisperTranscriber(
        OptimizerConfig(model_size="small", cpu_threads=2),
        model=FakeModel(),
    )

    result = transcriber.transcribe(audio)

    assert result.text == "First line\nSecond line"
    assert result.language == "en"
    assert result.language_probability == 0.98
    assert [(s.start, s.end, s.text) for s in result.segments] == [
        (0.0, 1.0, "First line"),
        (2.0, 3.0, "Second line"),
    ]
