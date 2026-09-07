from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]
REQUIREMENTS = ROOT / "aws" / "audio-tools" / "requirements.txt"
DOCKERFILE = ROOT / "aws" / "audio-tools" / "Dockerfile"
WORKER = ROOT / "aws" / "audio-tools" / "worker" / "worker.py"
ANALYZER = ROOT / "aws" / "audio-tools" / "worker" / "analyzer.py"
TEMPLATE = ROOT / "aws" / "audio-tools" / "template.yaml"
DEPLOY = ROOT / "aws" / "audio-tools" / "deploy.sh"


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

    def test_analysis_runtime_uses_gemini_and_removes_old_analyzer_stack(self):
        requirements = REQUIREMENTS.read_text(encoding="utf-8")
        analyzer = ANALYZER.read_text(encoding="utf-8")

        self.assertIn("google-genai", requirements)
        self.assertNotIn("all-in-one-infer", requirements)
        self.assertNotIn("transformers", requirements)
        self.assertNotIn("librosa", requirements)
        self.assertNotIn("huggingface-hub", requirements)
        self.assertIn("from google import genai", analyzer)
        self.assertIn('GEMINI_MODEL', analyzer)
        self.assertNotIn("allin1_infer", analyzer)
        self.assertNotIn("ClapModel", analyzer)
        self.assertNotIn("librosa", analyzer)

    def test_lyrics_runtime_keeps_faster_whisper(self):
        requirements = REQUIREMENTS.read_text(encoding="utf-8")
        worker = WORKER.read_text(encoding="utf-8")

        self.assertIn("faster-whisper==1.2.1", requirements)
        self.assertIn("from faster_whisper import WhisperModel", worker)
        self.assertIn('"large-v3"', worker)

    def test_gemini_key_is_injected_from_secrets_manager(self):
        template = TEMPLATE.read_text(encoding="utf-8")
        deploy = DEPLOY.read_text(encoding="utf-8")

        self.assertIn("GeminiApiKeySecretArn", template)
        self.assertIn("secretsmanager:GetSecretValue", template)
        self.assertIn("Secrets:", template)
        self.assertIn("Name: GEMINI_API_KEY", template)
        self.assertIn("ValueFrom: !Ref GeminiApiKeySecretArn", template)
        self.assertIn("Name: GEMINI_MODEL", template)
        self.assertIn("gemini-3.8-flash", template)
        self.assertIn('GEMINI_API_KEY="${GEMINI_API_KEY:-}"', deploy)
        self.assertIn("aws secretsmanager", deploy)
        self.assertIn('"GeminiApiKeySecretArn=${GEMINI_SECRET_ARN}"', deploy)

    def test_deploy_reuses_existing_gemini_secret_without_local_key(self):
        deploy = DEPLOY.read_text(encoding="utf-8")

        self.assertIn('if [[ -n "$GEMINI_API_KEY" ]]; then', deploy)
        self.assertIn('elif ! aws secretsmanager describe-secret', deploy)
        self.assertIn('Using existing Gemini secret', deploy)
        self.assertNotIn(
            'if [[ -z "$GEMINI_API_KEY" ]]; then\n  echo "GEMINI_API_KEY is required.',
            deploy,
        )


if __name__ == "__main__":
    unittest.main()
