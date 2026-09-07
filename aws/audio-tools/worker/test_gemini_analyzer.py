import tempfile
import unittest
from pathlib import Path

from analyzer import ANALYZER_VERSION, MusicIntelligenceEngine, profile_from_gemini_payload


GEMINI_PAYLOAD = {
    "bpm": 128,
    "bpm_confidence": 0.91,
    "key": "A Minor",
    "camelot_key": "8A",
    "key_confidence": 0.84,
    "genres": [
        {"label": "House", "score": 0.88},
        {"label": "Dance Pop", "score": 0.64},
    ],
    "moods": [{"label": "Energetic", "score": 0.9}],
    "styles": [{"label": "Club", "score": 0.82}],
    "instruments": [
        {"label": "Drum Machine", "score": 0.86},
        {"label": "Synth Bass", "score": 0.79},
    ],
    "sections": [
        {"label": "intro", "start": 0.0, "end": 12.5, "confidence": 0.8},
        {"label": "chorus", "start": 12.5, "end": 35.0, "confidence": 0.88},
    ],
    "keywords": ["dancefloor", "four on the floor", "club"],
}


class _FakeUploaded:
    name = "files/test-audio"


class _FakeFiles:
    def __init__(self):
        self.uploaded_path = None
        self.deleted_name = None

    def upload(self, *, file):
        self.uploaded_path = file
        return _FakeUploaded()

    def delete(self, *, name):
        self.deleted_name = name


class _FakeResponse:
    parsed = GEMINI_PAYLOAD
    text = ""


class _FakeModels:
    def __init__(self):
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeResponse()


class _FakeClient:
    def __init__(self):
        self.files = _FakeFiles()
        self.models = _FakeModels()


class GeminiAnalyzerTests(unittest.TestCase):
    def test_normalizes_gemini_payload_into_canonical_song_profile(self):
        profile = profile_from_gemini_payload(GEMINI_PAYLOAD, "gemini-3.8-flash")

        self.assertEqual(ANALYZER_VERSION, "music-intelligence-gemini-v2")
        self.assertEqual(profile["version"], ANALYZER_VERSION)
        self.assertEqual(profile["bpm"], 128)
        self.assertEqual(profile["key"], "A Minor")
        self.assertEqual(profile["camelot_key"], "8A")
        self.assertEqual(profile["primary_genre"], "House")
        self.assertEqual(profile["chapters"][0]["label"], "Intro")
        self.assertEqual(profile["evidence"]["provider"], "gemini")
        self.assertEqual(profile["evidence"]["semantic_model"], "gemini-3.8-flash")
        self.assertEqual(profile["evidence"]["analysis_device"], "remote-api")

    def test_analyzes_existing_local_audio_file_without_redownloading_it(self):
        engine = MusicIntelligenceEngine.__new__(MusicIntelligenceEngine)
        engine.model_name = "gemini-3.8-flash"
        engine.client = _FakeClient()

        with tempfile.TemporaryDirectory() as temp_name:
            source = Path(temp_name) / "track.mp3"
            source.write_bytes(b"test-audio")

            profile = engine.analyze_file(source)

        self.assertEqual(engine.client.files.uploaded_path, str(source))
        self.assertEqual(engine.client.files.deleted_name, "files/test-audio")
        self.assertEqual(len(engine.client.models.calls), 1)
        self.assertEqual(profile["evidence"]["provider"], "gemini")
        self.assertEqual(profile["evidence"]["semantic_model"], "gemini-3.8-flash")

    def test_rejects_non_object_gemini_payload(self):
        with self.assertRaisesRegex(ValueError, "object"):
            profile_from_gemini_payload(["not", "an", "object"], "gemini-3.8-flash")

    def test_missing_optional_arrays_are_normalized_to_empty_lists(self):
        profile = profile_from_gemini_payload(
            {
                "bpm": 0,
                "bpm_confidence": 0,
                "key": None,
                "camelot_key": None,
                "key_confidence": 0,
            },
            "gemini-3.8-flash",
        )

        self.assertEqual(profile["genres"], [])
        self.assertEqual(profile["moods"], [])
        self.assertEqual(profile["styles"], [])
        self.assertEqual(profile["instruments"], [])
        self.assertEqual(profile["sections"], [])
        self.assertIn("Genre classification is uncertain", profile["warnings"])


if __name__ == "__main__":
    unittest.main()
