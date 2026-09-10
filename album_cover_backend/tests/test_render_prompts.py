from app.render_prompts import build_production_brief


def test_production_brief_keeps_strict_controls_and_no_text_before_cutoff():
    prompt = build_production_brief(
        concept={
            "name": "Red Glove",
            "subject": "woman holding one red glove",
            "artist_presence": "none",
            "setting": "empty church",
            "action_or_symbol": "holding the glove at her side",
            "camera": "35mm low eye level",
            "composition": "wide negative space upper-left",
            "lighting": "late afternoon window light",
            "medium": "editorial photography",
            "texture": "fine film grain",
            "palette": "cream burgundy black",
            "must_include": ["red glove"],
            "avoid": ["cars", "neon"],
            "image_prompt_seed": "x" * 5000,
        },
        creative_controls={
            "creative_strength": "strict",
            "subject_hint": "woman holding one red glove",
        },
        visual_bible=None,
        render_index=1,
    )
    assert len(prompt) <= 2048
    assert prompt.index("STRICT USER CONTROL") < 300
    assert prompt.index("NO TITLE") < 1600
    assert "CONCEPT: Red Glove" in prompt
    assert "red glove" in prompt


def test_reference_guide_is_only_injected_for_artist_present_concepts():
    bible = {
        "appearance": {"hair": "long black braids", "distinctive_features": ["round gold glasses"]},
        "do_not_change": ["round gold glasses"],
    }
    common = {
        "name": "Portrait",
        "subject": "artist standing alone",
        "setting": "studio",
        "action_or_symbol": "still",
        "camera": "50mm",
        "composition": "centered",
        "lighting": "soft",
        "medium": "photo",
        "texture": "grain",
        "palette": "black",
        "must_include": [],
        "avoid": [],
        "image_prompt_seed": "",
    }
    artist_prompt = build_production_brief(
        concept={**common, "artist_presence": "hero"},
        creative_controls={},
        visual_bible=bible,
        render_index=1,
    )
    no_person_prompt = build_production_brief(
        concept={**common, "artist_presence": "none"},
        creative_controls={},
        visual_bible=bible,
        render_index=1,
    )
    assert "long black braids" in artist_prompt
    assert "long black braids" not in no_person_prompt
