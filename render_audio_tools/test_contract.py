import unittest

from render_audio_tools.contract import normalize_job_request, poll_http_status, public_job_response


class RenderAudioContractTests(unittest.TestCase):
    def test_accepts_persistent_s3_key_as_primary_source(self):
        result = normalize_job_request({
            "action": "analysis",
            "file_key": "tracks/audio/track-1/song.mp3",
            "file_url": "https://stale.example.com/song.mp3?expired=1",
            "track_id": "track-1",
            "track_name": "Song",
            "source_fingerprint": "abc123",
        })

        self.assertEqual(result["action"], "analysis")
        self.assertEqual(result["file_key"], "tracks/audio/track-1/song.mp3")
        self.assertEqual(result["file_url"], "https://stale.example.com/song.mp3?expired=1")
        self.assertEqual(result["track_id"], "track-1")
        self.assertEqual(result["source_fingerprint"], "abc123")

    def test_allows_key_only_job_without_presigned_url(self):
        result = normalize_job_request({
            "action": "lyrics",
            "file_key": "tracks/audio/track-2/song.wav",
            "track_id": "track-2",
        })

        self.assertEqual(result["file_key"], "tracks/audio/track-2/song.wav")
        self.assertNotIn("file_url", result)

    def test_rejects_job_without_cloud_source(self):
        with self.assertRaisesRegex(ValueError, "cloud audio source"):
            normalize_job_request({"action": "analysis", "track_id": "track-1"})

    def test_normalizes_and_validates_stem_mode(self):
        result = normalize_job_request({
            "action": "stems",
            "file_key": "tracks/audio/track-1/song.mp3",
            "track_id": "track-1",
        })
        self.assertEqual(result["mode"], "vocals_instrumental")

        with self.assertRaisesRegex(ValueError, "mode"):
            normalize_job_request({
                "action": "stems",
                "mode": "karaoke-plus",
                "file_key": "tracks/audio/track-1/song.mp3",
                "track_id": "track-1",
            })

    def test_poll_status_matches_browser_contract(self):
        self.assertEqual(poll_http_status("accepted"), 202)
        self.assertEqual(poll_http_status("running"), 202)
        self.assertEqual(poll_http_status("completed"), 200)
        self.assertEqual(poll_http_status("failed"), 200)

    def test_public_response_does_not_expose_private_source_fields(self):
        public = public_job_response({
            "call_id": "call-1",
            "job_id": "call-1",
            "status": "completed",
            "action": "analysis",
            "track_id": "track-1",
            "profile": {"bpm": 120},
            "file_key": "tracks/audio/private.mp3",
            "file_url": "https://signed.example.com/private.mp3",
            "internal_note": "secret",
        })

        self.assertEqual(public["call_id"], "call-1")
        self.assertEqual(public["profile"], {"bpm": 120})
        self.assertNotIn("file_key", public)
        self.assertNotIn("file_url", public)
        self.assertNotIn("internal_note", public)


if __name__ == "__main__":
    unittest.main()
