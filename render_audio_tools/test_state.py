import unittest
from decimal import Decimal

from render_audio_tools.state import AwsStateStore


class _FakeTable:
    def __init__(self):
        self.items = {}

    def put_item(self, *, Item):
        key_name = "call_id" if "call_id" in Item else "track_id"
        self.items[str(Item[key_name])] = dict(Item)
        return {}

    def get_item(self, *, Key, ConsistentRead=False):
        del ConsistentRead
        key = next(iter(Key.values()))
        item = self.items.get(str(key))
        return {"Item": dict(item)} if item else {}


class RenderAwsStateTests(unittest.TestCase):
    def setUp(self):
        self.jobs = _FakeTable()
        self.analysis = _FakeTable()
        self.store = AwsStateStore(
            jobs_table=self.jobs,
            track_analysis_table=self.analysis,
            id_factory=lambda: "call-123",
            clock=lambda: "2026-09-07T16:00:00+00:00",
        )

    def test_create_job_persists_accepted_status_and_source_key(self):
        item = self.store.create_job({
            "action": "analysis",
            "file_key": "tracks/audio/track-1/song.mp3",
            "track_id": "track-1",
            "track_name": "Song",
        })

        self.assertEqual(item["call_id"], "call-123")
        self.assertEqual(item["job_id"], "call-123")
        self.assertEqual(item["status"], "accepted")
        self.assertEqual(item["file_key"], "tracks/audio/track-1/song.mp3")
        self.assertEqual(self.store.get_job("call-123")["status"], "accepted")

    def test_update_job_merges_result_without_losing_request_fields(self):
        self.store.create_job({
            "action": "analysis",
            "file_key": "tracks/audio/track-1/song.mp3",
            "track_id": "track-1",
        })

        updated = self.store.update_job("call-123", {
            "status": "completed",
            "profile": {"bpm": 120},
        })

        self.assertEqual(updated["status"], "completed")
        self.assertEqual(updated["profile"], {"bpm": 120})
        self.assertEqual(updated["file_key"], "tracks/audio/track-1/song.mp3")

    def test_dynamodb_decimals_are_converted_to_json_safe_numbers_on_read(self):
        self.jobs.items["call-123"] = {
            "call_id": "call-123",
            "job_id": "call-123",
            "status": "completed",
            "profile": {
                "bpm": Decimal("120"),
                "bpm_confidence": Decimal("0.91"),
            },
        }

        item = self.store.get_job("call-123")

        self.assertIsInstance(item["profile"]["bpm"], int)
        self.assertIsInstance(item["profile"]["bpm_confidence"], float)
        self.assertEqual(item["profile"]["bpm"], 120)
        self.assertAlmostEqual(item["profile"]["bpm_confidence"], 0.91)

    def test_track_analysis_round_trips_through_existing_table(self):
        record = {
            "track_id": "track-1",
            "status": "ready",
            "profile": {"version": "music-intelligence-gemini-v2", "bpm": 120},
        }
        self.store.save_track_analysis(record)

        self.assertEqual(self.store.get_track_analysis("track-1")["profile"]["bpm"], 120)


if __name__ == "__main__":
    unittest.main()
