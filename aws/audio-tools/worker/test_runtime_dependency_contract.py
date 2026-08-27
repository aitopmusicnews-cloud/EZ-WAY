from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]
REQUIREMENTS = ROOT / "aws" / "audio-tools" / "requirements.txt"
WORKER = ROOT / "aws" / "audio-tools" / "worker" / "worker.py"


class AwsAudioToolsRuntimeDependencyContractTests(unittest.TestCase):
    def test_uses_modern_demucs_infer_without_legacy_demucs_pin(self):
        requirements = REQUIREMENTS.read_text(encoding="utf-8")
        worker = WORKER.read_text(encoding="utf-8")

        self.assertNotIn("demucs==4.0.1", requirements)
        self.assertIn("demucs-infer>=4.2.2", requirements)
        self.assertIn('"demucs-infer"', worker)
        self.assertNotIn('"python", "-m", "demucs"', worker)


if __name__ == "__main__":
    unittest.main()
