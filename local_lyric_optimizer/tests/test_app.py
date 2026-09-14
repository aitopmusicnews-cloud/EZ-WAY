from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from local_lyric_optimizer.app import create_app
from local_lyric_optimizer.config import OptimizerConfig, ServiceConfig
from local_lyric_optimizer.transcriber import TranscriptSegment, TranscriptionResult


class FakeTranscriber:
    def __init__(self, *, fail: bool = False):
        self.paths: list[Path] = []
        self.fail = fail

    def transcribe(self, path: Path, language: str | None = None) -> TranscriptionResult:
        self.paths.append(Path(path))
        assert Path(path).exists()
        if self.fail:
            raise RuntimeError("model load failed")
        return TranscriptionResult(
            text="First line\nSecond line",
            language=language or "en",
            language_probability=0.98,
            segments=[
                TranscriptSegment(0.0, 3.2, "First line"),
                TranscriptSegment(3.2, 6.1, "Second line"),
            ],
        )


def make_client(*, transcriber=None, max_upload_mb=250):
    optimizer = OptimizerConfig(model_size="small", cpu_threads=4)
    service = ServiceConfig(
        host="127.0.0.1",
        port=8765,
        max_upload_mb=max_upload_mb,
        allowed_origins=("https://ezwaypro.theartistcut.com",),
        youtube_api_key="",
    )
    app = create_app(
        optimizer_config=optimizer,
        service_config=service,
        transcriber=transcriber or FakeTranscriber(),
    )
    return TestClient(app), app


def test_health_is_non_sensitive_and_reports_cpu_int8():
    client, _ = make_client()
    assert client.get("/health").json() == {
        "ok": True,
        "service": "ezway-local-lyric-optimizer",
        "model": "small",
        "device": "cpu",
        "compute_type": "int8",
    }


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [("song.mp3", "audio/mpeg"), ("song.wav", "audio/wav")],
)
def test_transcribe_accepts_mp3_and_wav_and_cleans_temp_file(filename, content_type):
    transcriber = FakeTranscriber()
    client, _ = make_client(transcriber=transcriber)

    response = client.post(
        "/lyrics/transcribe",
        files={"file": (filename, b"audio bytes", content_type)},
        data={"language": "en"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "text": "First line\nSecond line",
        "language": "en",
        "language_probability": 0.98,
        "segments": [
            {"start": 0.0, "end": 3.2, "text": "First line"},
            {"start": 3.2, "end": 6.1, "text": "Second line"},
        ],
    }
    assert len(transcriber.paths) == 1
    assert not transcriber.paths[0].exists()


def test_transcribe_rejects_unsupported_extension():
    client, _ = make_client()
    response = client.post(
        "/lyrics/transcribe",
        files={"file": ("song.flac", b"audio bytes", "audio/flac")},
    )
    assert response.status_code == 415
    assert "MP3 or WAV" in response.json()["detail"]


def test_transcribe_rejects_empty_upload():
    client, _ = make_client()
    response = client.post(
        "/lyrics/transcribe",
        files={"file": ("song.wav", b"", "audio/wav")},
    )
    assert response.status_code == 422


def test_transcribe_rejects_over_limit_upload():
    client, _ = make_client(max_upload_mb=1)
    response = client.post(
        "/lyrics/transcribe",
        files={"file": ("song.wav", b"x" * (1024 * 1024 + 1), "audio/wav")},
    )
    assert response.status_code == 413


def test_transcribe_failure_removes_temp_file_and_returns_503():
    transcriber = FakeTranscriber(fail=True)
    client, _ = make_client(transcriber=transcriber)

    response = client.post(
        "/lyrics/transcribe",
        files={"file": ("song.wav", b"audio bytes", "audio/wav")},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Local lyric model could not transcribe this file."
    assert len(transcriber.paths) == 1
    assert not transcriber.paths[0].exists()
