import tempfile
import unittest
from pathlib import Path

from render_audio_tools.processor import download_source


class _FakeS3:
    def __init__(self):
        self.downloads = []

    def download_file(self, bucket, key, filename):
        self.downloads.append((bucket, key, filename))
        Path(filename).write_bytes(b"from-s3")


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


if __name__ == "__main__":
    unittest.main()
