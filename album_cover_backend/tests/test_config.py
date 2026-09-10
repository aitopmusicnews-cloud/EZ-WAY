from app.config import Settings


def test_cloudflare_creative_director_defaults(monkeypatch):
    for name in (
        "CLOUDFLARE_CREATIVE_DIRECTOR_MODEL",
        "CLOUDFLARE_CREATIVE_DIRECTOR_TIMEOUT_SECONDS",
        "ENABLE_CLOUDFLARE_CREATIVE_DIRECTOR",
        "CONCEPT_COUNT",
        "SELECTED_CONCEPT_COUNT",
        "RENDERS_PER_CONCEPT",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = Settings()

    assert settings.cloudflare_creative_director_model == "@cf/google/gemma-4-26b-a4b-it"
    assert settings.enable_cloudflare_creative_director is True
    assert settings.cloudflare_creative_director_timeout_seconds == 90.0
    assert settings.concept_count == 8
    assert settings.selected_concept_count == 3
    assert settings.renders_per_concept == 2
    assert settings.render_count == 6
