import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from render_audio_tools.processor import AudioProcessor, download_source, whisper_model_name


class _FakeS3:
    def __init__(self):
        self.downloads = []
        self.uploads = []

    def download_file(self, bucket, key, filename):
        self.downloads.append((bucket, key, filename))
        Path(filename).write_bytes(b"from-s3")

    def upload_file(self, filename, bucket, key):
        self.uploads.append((filename, bucket, key))

    def generate_presigned_url(self, operation, Params, ExpiresIn):
        return f"https://downloads.example.com/{Params['Key']}?expires={ExpiresIn}"


class _FakeState:
    def __init__(self):
        self.analysis = []

    def save_track_analysis(self, record):
        self.analysis.append(record)


class _FakeAnalysisEngine:
    def __init__(self):
        self.sources = []

    def analyze_file(self, source):
        self.sources.append(Path(source))
        return {
            "version": "music-intelligence-gemini-v2",
            "bpm": 120,
            "evidence": {"provider": "gemini"},
        }


class _FakeWhisperModel:
    def __init__(self):
        self.sources = []

    def transcribe(self, source, **kwargs):
        self.sources.append(Path(source))
        segments = [
            SimpleNamespace(start=1.25, text=" First line "),
            SimpleNamespace(start=4.5, text="Second line"),
        ]
        info = SimpleNamespace(language="en", language_probability=0.98)
        return iter(segments), info


def _fake_demucs(source, output_dir, two_stem):
    stem_dir = Path(output_dir) / "htdemucs" / Path(source).stem
    stem_dir.mkdir(parents=True, exist_ok=True)
    (stem_dir / "vocals.wav").write_bytes(b"vocals")
    if two_stem:
        (stem_dir / "no_vocals.wav").write_bytes(b"instrumental")
    else:
        (stem_dir / "drums.wav").write_bytes(b"drums")
        (stem_dir / "bass.wav").write_bytes(b"bass")
        (stem_dir / "other.wav").write_bytes(b"other")
    return stem_dir


class RenderAudioProcessorTests(unittest.TestCase):
    def test_file_key_is_preferred_over_stale_presigned_url(self):
        fake_s3 = _FakeS3()
        http_calls = []

        def fake_http_download(url, target_dir):
            http_calls.append(url)
            path = target_dir / "source.mp3"
            path.write_bytes(b"from-http")
            return path

        payload = {
            "file_key": "tracks/audio/track-1/song.mp3",
            "file_url": "https://stale.example.com/song.mp3?expired=1",
        }

        with tempfile.TemporaryDirectory() as temp_name:
            source = download_source(
                payload,
                Path(temp_name),
                source_bucket="private-media-bucket",
                s3_client=fake_s3,
                http_downloader=fake_http_download,
            )
            self.assertEqual(source.read_bytes(), b"from-s3")

        self.assertEqual(len(fake_s3.downloads), 1)
        self.assertEqual(fake_s3.downloads[0][0], "private-media-bucket")
        self.assertEqual(fake_s3.downloads[0][1], "tracks/audio/track-1/song.mp3")
        self.assertEqual(http_calls, [])

    def test_file_url_remains_a_compatibility_fallback(self):
        fake_s3 = _FakeS3()
        http_calls = []

        def fake_http_download(url, target_dir):
            http_calls.append(url)
            path = target_dir / "source.wav"
            path.write_bytes(b"from-http")
            return path

        with tempfile.TemporaryDirectory() as temp_name:
            source = download_source(
                {"file_url": "https://fresh.example.com/song.wav"},
                Path(temp_name),
                source_bucket="private-media-bucket",
                s3_client=fake_s3,
                http_downloader=fake_http_download,
            )
            self.assertEqual(source.read_bytes(), b"from-http")

        self.assertEqual(http_calls, ["https://fresh.example.com/song.wav"])
        self.assertEqual(fake_s3.downloads, [])

    def test_file_key_requires_source_bucket_configuration(self):
        with tempfile.TemporaryDirectory() as temp_name:
            with self.assertRaisesRegex(RuntimeError, "SOURCE_BUCKET"):
                download_source(
                    {"file_key": "tracks/audio/track-1/song.mp3"},
                    Path(temp_name),
                    source_bucket="",
                    s3_client=_FakeS3(),
                    http_downloader=lambda *_: None,
                )

    def test_whisper_model_defaults_to_base_and_allows_override(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(whisper_model_name(), "base")
        with patch.dict(os.environ, {"WHISPER_MODEL": "small"}, clear=True):
            self.assertEqual(whisper_model_name(), "small")

    def test_analysis_reads_s3_source_and_persists_canonical_profile(self):
        s3 = _FakeS3()
        state = _FakeState()
        engine = _FakeAnalysisEngine()
        processor = AudioProcessor(
            state=state,
            source_bucket="private-media-bucket",
            output_bucket="audio-output-bucket",
            s3_client=s3,
            analysis_engine_factory=lambda: engine,
            demucs_runner=_fake_demucs,
            whisper_model_factory=lambda: _FakeWhisperModel(),
        )

        result = processor.process({
            "call_id": "call-1",
            "job_id": "job-1",
            "action": "analysis",
            "file_key": "tracks/audio/track-1/song.mp3",
            "file_url": "https://stale.example.com/song.mp3?expired=1",
            "track_id": "track-1",
            "track_name": "Song",
            "source_fingerprint": "fingerprint-1",
        })

        self.assertEqual(result["profile"]["evidence"]["provider"], "gemini")
        self.assertEqual(len(engine.sources), 1)
        self.assertEqual(len(state.analysis), 1)
        self.assertEqual(state.analysis[0]["track_id"], "track-1")
        self.assertEqual(state.analysis[0]["source_fingerprint"], "fingerprint-1")

    def test_stems_returns_vocals_instrumental_and_zip_downloads(self):
        processor = AudioProcessor(
            state=_FakeState(),
            source_bucket="private-media-bucket",
            output_bucket="audio-output-bucket",
            s3_client=_FakeS3(),
            analysis_engine_factory=_FakeAnalysisEngine,
            demucs_runner=_fake_demucs,
            whisper_model_factory=lambda: _FakeWhisperModel(),
        )

        result = processor.process({
            "call_id": "call-2",
            "job_id": "job-2",
            "action": "stems",
            "mode": "vocals_instrumental",
            "file_key": "tracks/audio/track-2/song.mp3",
            "track_id": "track-2",
            "track_name": "Song Two",
        })

        self.assertEqual(result["mode"], "vocals_instrumental")
        self.assertIn("vocals", result["files"])
        self.assertIn("instrumental", result["files"])
        self.assertIn("bundle_url", result)

    def test_lyrics_transcribes_source_directly_without_demucs(self):
        demucs_calls = []
        whisper = _FakeWhisperModel()

        def forbidden_demucs(*args, **kwargs):
            demucs_calls.append((args, kwargs))
            raise AssertionError("lyrics must not run Demucs")

        processor = AudioProcessor(
            state=_FakeState(),
            source_bucket="private-media-bucket",
            output_bucket="audio-output-bucket",
            s3_client=_FakeS3(),
            analysis_engine_factory=_FakeAnalysisEngine,
            demucs_runner=forbidden_demucs,
            whisper_model_factory=lambda: whisper,
        )

        result = processor.process({
            "call_id": "call-3",
            "job_id": "job-3",
            "action": "lyrics",
            "file_key": "tracks/audio/track-3/song.wav",
            "track_id": "track-3",
            "track_name": "Song Three",
        })

        self.assertEqual(demucs_calls, [])
        self.assertEqual([path.name for path in whisper.sources], ["source.wav"])
        self.assertIn("[00:01.25] First line", result["lyrics"])
        self.assertIn("[00:04.50] Second line", result["lyrics"])
        self.assertEqual(result["language"], "en")
        self.assertIn("lrc", result["files"])
        self.assertIn("plain", result["files"])
        self.assertNotIn("vocals", result["files"])


if __name__ == "__main__":
    unittest.main()
