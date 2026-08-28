import unittest

from music_intelligence_core import (
    aggregate_rankings,
    build_profile,
    normalize_probability,
    segments_to_chapters,
)


class MusicIntelligenceCoreTests(unittest.TestCase):
    def test_normalize_probability_clips_range(self):
        self.assertEqual(normalize_probability(-0.2), 0.0)
        self.assertEqual(normalize_probability(1.2), 1.0)
        self.assertEqual(normalize_probability(0.4567), 0.4567)

    def test_aggregate_rankings_averages_windows_and_orders(self):
        windows = [
            {"Trap": 0.8, "R&B": 0.2},
            {"Trap": 0.6, "R&B": 0.4},
        ]
        ranked = aggregate_rankings(windows, limit=2)
        self.assertEqual([item["label"] for item in ranked], ["Trap", "R&B"])
        self.assertAlmostEqual(ranked[0]["score"], 0.7, places=6)
        self.assertAlmostEqual(ranked[1]["score"], 0.3, places=6)

    def test_segments_to_chapters_drops_start_end_and_formats_labels(self):
        segments = [
            {"start": 0.0, "end": 0.5, "label": "start"},
            {"start": 0.5, "end": 14.25, "label": "intro"},
            {"start": 14.25, "end": 40.0, "label": "verse"},
            {"start": 40.0, "end": 65.0, "label": "chorus"},
            {"start": 65.0, "end": 65.5, "label": "end"},
        ]
        chapters = segments_to_chapters(segments)
        self.assertEqual([chapter["label"] for chapter in chapters], ["Intro", "Verse", "Chorus"])
        self.assertEqual(chapters[0]["timestamp"], "0:00")
        self.assertEqual(chapters[1]["timestamp"], "0:14")

    def test_build_profile_marks_low_confidence_primary_genre_uncertain(self):
        profile = build_profile(
            bpm=92,
            sections=[{"start": 0.0, "end": 20.0, "label": "intro"}],
            genres=[{"label": "Alternative R&B", "score": 0.41}, {"label": "Trap Soul", "score": 0.39}],
            moods=[{"label": "Moody", "score": 0.78}],
            instruments=[{"label": "808 bass", "score": 0.82}],
            analyzer_version="music-intelligence-v1",
            key="F# Minor",
            camelot_key="11A",
            key_confidence=0.81,
        )
        self.assertEqual(profile["primary_genre"], "Alternative R&B")
        self.assertFalse(profile["genre_confident"])
        self.assertIn("Genre classification is uncertain", profile["warnings"])
        self.assertEqual(profile["bpm"], 92)
        self.assertEqual(profile["key"], "F# Minor")
        self.assertEqual(profile["camelot_key"], "11A")
        self.assertAlmostEqual(profile["key_confidence"], 0.81)
        self.assertEqual(profile["chapters"][0]["label"], "Intro")

    def test_build_profile_requires_genre_margin_for_confidence(self):
        profile = build_profile(
            bpm=140,
            sections=[],
            genres=[{"label": "Trap", "score": 0.70}, {"label": "Drill", "score": 0.69}],
            moods=[],
            instruments=[],
            analyzer_version="music-intelligence-v1",
        )
        self.assertFalse(profile["genre_confident"])


if __name__ == "__main__":
    unittest.main()
