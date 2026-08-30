from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]
REQUIREMENTS = ROOT / "aws" / "audio-tools" / "requirements.txt"
DOCKERFILE = ROOT / "aws" / "audio-tools" / "Dockerfile"
WORKER = ROOT / "aws" / "audio-tools" / "worker" / "worker.py"
ANALYZER = ROOT / "aws" / "audio-tools" / "worker" / "analyzer.py"


class AwsAudioToolsRuntimeDependencyContractTests(unittest.TestCase):
    def test_uses_modern_demucs_infer_without_legacy_demucs_pin(self):
        requirements = REQUIREMENTS.read_text(encoding="utf-8")
        worker = WORKER.read_text(encoding="utf-8")

        self.assertNotIn("demucs==4.0.1", requirements)
        self.assertIn("demucs-infer>=4.2.2", requirements)
        self.assertIn('"demucs-infer"', worker)
        self.assertNotIn('"python", "-m", "demucs"', worker)

    def test_cpu_worker_pins_cpu_only_torch_outside_generic_requirements(self):
        requirements = REQUIREMENTS.read_text(encoding="utf-8")
        dockerfile = DOCKERFILE.read_text(encoding="utf-8")

        self.assertNotIn("torch>=", requirements)
        self.assertNotIn("torchaudio>=", requirements)
        self.assertIn("https://download.pytorch.org/whl/cpu", dockerfile)
        self.assertIn("torch==2.6.0", dockerfile)
        self.assertIn("torchaudio==2.6.0", dockerfile)

    def test_analyzer_uses_published_all_in_one_api(self):
        analyzer = ANALYZER.read_text(encoding="utf-8")

        self.assertIn("from allin1_infer import analyze", analyzer)
        self.assertNotIn("AllInOneSession", analyzer)


if __name__ == "__main__":
    unittest.main()
