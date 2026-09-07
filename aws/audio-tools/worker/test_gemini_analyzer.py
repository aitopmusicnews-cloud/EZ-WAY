import unittest

from analyzer import ANALYZER_VERSION, profile_from_gemini_payload


class GeminiAnalyzerTests(unittest.TestCase):
    def test_normalizes_gemini_payload_into_canonical_song_profile(self):
        payload = {
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

        profile = profile_from_gemini_payload(payload, "gemini-3.8-flash")

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
