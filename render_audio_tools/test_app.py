import unittest

from fastapi.testclient import TestClient

from render_audio_tools.app import create_app


class _FakeState:
    def __init__(self):
        self.jobs = {}
        self.analysis = {}

    def create_job(self, request):
        item = {
            "call_id": "call-1",
            "job_id": "call-1",
            "status": "accepted",
            **request,
            "created_at": "2026-09-07T16:00:00+00:00",
            "updated_at": "2026-09-07T16:00:00+00:00",
        }
        self.jobs[item["call_id"]] = item
        return item

    def get_job(self, call_id):
        return self.jobs.get(call_id)

    def update_job(self, call_id, updates):
        self.jobs[call_id].update(updates)
        return self.jobs[call_id]

    def get_track_analysis(self, track_id):
        return self.analysis.get(track_id)

    def save_track_analysis(self, record):
        self.analysis[record["track_id"]] = record


class _FakeProcessor:
    def process(self, payload):
        return {"profile": {"version": "music-intelligence-gemini-v2", "bpm": 120}}


class _NoopExecutor:
    def __init__(self):
        self.submissions = []

    def submit(self, fn, *args):
        self.submissions.append((fn, args))
        return object()


class RenderAudioAppTests(unittest.TestCase):
    def setUp(self):
        self.state = _FakeState()
        self.executor = _NoopExecutor()
        self.client = TestClient(create_app(
            state=self.state,
            processor=_FakeProcessor(),
            executor=self.executor,
        ))

    def test_health_identifies_render_audio_provider(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "render")
        self.assertEqual(response.json()["tools"], ["analysis", "lyrics", "stems"])

    def test_create_and_poll_job_matches_existing_browser_contract(self):
        response = self.client.post("/jobs", json={
            "action": "analysis",
            "file_key": "tracks/audio/track-1/song.mp3",
            "file_url": "https://stale.example.com/song.mp3?expired=1",
            "track_id": "track-1",
            "track_name": "Song",
        })
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["status"], "accepted")
        self.assertEqual(response.json()["call_id"], "call-1")
        self.assertEqual(len(self.executor.submissions), 1)

        active = self.client.get("/jobs/call-1")
        self.assertEqual(active.status_code, 202)
        self.assertEqual(active.json()["status"], "accepted")

        self.state.update_job("call-1", {"status": "completed", "profile": {"bpm": 120}})
        complete = self.client.get("/jobs/call-1")
        self.assertEqual(complete.status_code, 200)
        self.assertEqual(complete.json()["profile"], {"bpm": 120})

    def test_missing_job_returns_404(self):
        response = self.client.get("/jobs/missing")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Audio Tools job not found.")

    def test_track_analysis_route_returns_canonical_record(self):
        self.state.analysis["track-1"] = {
            "track_id": "track-1",
            "status": "ready",
            "profile": {"bpm": 120},
        }
        response = self.client.get("/track-analysis/track-1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["record"]["track_id"], "track-1")


if __name__ == "__main__":
    unittest.main()
