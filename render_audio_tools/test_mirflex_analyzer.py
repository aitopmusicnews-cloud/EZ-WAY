import importlib
import importlib.util
import unittest
from pathlib import Path

from render_audio_tools.processor import AudioProcessor


ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = ROOT / "render_audio_tools" / "requirements.txt"


class MirflexLiveAnalyzerTests(unittest.TestCase):
    def _module(self):
        spec = importlib.util.find_spec("render_audio_tools.mirflex_analyzer")
        self.assertIsNotNone(spec, "render_audio_tools.mirflex_analyzer must exist")
        return importlib.import_module("render_audio_tools.mirflex_analyzer")

    def test_render_defaults_to_mirflex_instead_of_gemini(self):
        factory = AudioProcessor.__init__.__kwdefaults__["analysis_engine_factory"]
        self.assertEqual(factory.__name__, "MirflexMusicIntelligenceEngine")

    def test_render_runtime_has_local_dsp_and_no_gemini_client(self):
        requirements = REQUIREMENTS.read_text(encoding="utf-8")
        self.assertIn("librosa", requirements)
        self.assertNotIn("google-genai", requirements)

    def test_local_features_map_to_existing_canonical_profile(self):
        module = self._module()
        profile = module.profile_from_mirflex_features({
            "bpm": 123.4,
            "bpm_confidence": 0.72,
            "key": "C",
            "camelot_key": "8B",
            "key_confidence": 0.81,
        })

        self.assertEqual(profile["version"], "music-intelligence-mirflex-local-v1")
        self.assertEqual(profile["bpm"], 123)
        self.assertEqual(profile["key"], "C")
        self.assertEqual(profile["camelot_key"], "8B")
        self.assertEqual(profile["genres"], [])
        self.assertEqual(profile["moods"], [])
        self.assertEqual(profile["instruments"], [])
        self.assertEqual(profile["evidence"]["provider"], "mirflex")
        self.assertEqual(profile["evidence"]["analysis_device"], "cpu")

    def test_engine_uses_only_the_injected_local_feature_extractor(self):
        module = self._module()
        calls = []

        def local_features(source):
            calls.append(Path(source))
            return {
                "bpm": 96.0,
                "bpm_confidence": 0.6,
                "key": "Am",
                "camelot_key": "8A",
                "key_confidence": 0.7,
            }

        engine = module.MirflexMusicIntelligenceEngine(feature_extractor=local_features)
        profile = engine.analyze_file(Path("song.wav"))

        self.assertEqual(calls, [Path("song.wav")])
        self.assertEqual(profile["evidence"]["provider"], "mirflex")
        self.assertEqual(profile["key"], "Am")
        self.assertEqual(profile["camelot_key"], "8A")


if __name__ == "__main__":
    unittest.main()
