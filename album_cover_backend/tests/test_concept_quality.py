from app.concept_quality import score_concept, score_total, select_diverse_concepts
from app.creative_direction import ConceptDraft


def concept(cid, subject, setting, medium, metaphor, *, artist_presence="hero"):
    return ConceptDraft(
        id=cid,
        name=cid,
        one_line_pitch=cid,
        why_it_fits="song-specific",
        subject=subject,
        artist_presence=artist_presence,
        setting=setting,
        action_or_symbol="still",
        wardrobe_or_material="black wool",
        camera="35mm",
        composition="centered",
        lighting="soft",
        medium=medium,
        palette="black and cream",
        texture="grain",
        dominant_shape="vertical",
        visual_metaphor=metaphor,
        typography_zone="upper-left",
        image_prompt_seed=cid,
    )


def test_diverse_selector_rejects_three_near_duplicate_portraits():
    concepts = [
        concept("a", "artist portrait", "studio", "photo", "isolation"),
        concept("b", "artist portrait", "studio", "photo", "isolation"),
        concept("c", "artist portrait", "studio", "photo", "isolation"),
        concept("d", "empty table", "banquet hall", "photo", "absence", artist_presence="none"),
        concept("e", "folded letter", "white field", "collage", "release", artist_presence="none"),
    ]
    scores = {"a": 96.0, "b": 95.0, "c": 94.0, "d": 91.0, "e": 90.0}
    selected = select_diverse_concepts(concepts, scores, count=3)
    assert [item.id for item in selected] == ["a", "d", "e"]


def test_score_concept_clamps_major_label_rubric_to_100_points():
    item = concept("a", "artist", "studio", "photo", "release")
    suggested = {
        "song_specificity": 40,
        "originality": 18,
        "emotional_power": 15,
        "visual_memorability": 14,
        "artist_campaign_value": 10,
        "flux_executability": 10,
        "typography_compatibility": 5,
    }
    scores = score_concept(item, song_thesis={}, creative_controls={}, suggested_scores=suggested)
    assert scores["song_specificity"] == 25
    assert score_total(scores) == 97


def test_strict_control_violation_is_hard_failure():
    item = concept("a", "empty chair", "studio", "photo", "absence")
    scores = score_concept(
        item,
        song_thesis={},
        creative_controls={"creative_strength": "strict", "subject_hint": "woman holding one red glove"},
        suggested_scores={"song_specificity": 25},
    )
    assert score_total(scores) == 0
