from __future__ import annotations

from io import BytesIO

from PIL import Image


def _create(client, *, title="Song", artist="Artist", extra=None, files=None):
    data = {
        "collection_id": "major_label_contract",
        "lyrics_text": "I kept the letter by the door while the room grew quiet",
        "title": title,
        "artist": artist,
        "run_async": "false",
    }
    data.update(extra or {})
    return client.post("/api/generations", data=data, files=files or {})


def _png_bytes() -> bytes:
    image = Image.new("RGB", (512, 512), (85, 55, 45))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_default_generation_returns_six_equal_user_choices(app_factory):
    client, _, _, images = app_factory()
    response = _create(client)
    assert response.status_code == 201
    body = response.json()
    latest = body["variation_sets"][-1]
    assert latest["requested_count"] == 6
    assert len(latest["variations"]) == 6
    assert images.calls == 6
    assert latest["winner_variation_id"] is None
    assert latest["runner_up_variation_id"] is None
    assert all(item["selection_tier"] == "unranked" for item in latest["variations"])


def test_parental_advisory_is_manual_and_defaults_off_even_with_explicit_lyrics(app_factory):
    client, *_ = app_factory()
    response = client.post(
        "/api/generations",
        data={
            "collection_id": "advisory_off",
            "lyrics_text": "fuck this night, I am done with every lie",
            "title": "No Automatic Sticker",
            "artist": "Artist",
            "variation_count": "3",
            "run_async": "false",
        },
    )
    assert response.status_code == 201
    assert response.json()["parental_advisory"] is False


def test_release_text_patch_recomposes_without_calling_image_provider(app_factory):
    client, _, _, images = app_factory()
    body = _create(client, extra={"variation_count": "3"}).json()
    calls_before = images.calls
    response = client.patch(
        f"/api/generations/{body['id']}/release-text",
        json={
            "show_title": True,
            "show_artist": False,
            "parental_advisory": False,
            "title": {
                "position": "top-left",
                "size": 88,
                "font_style": "editorial",
                "case": "upper",
                "treatment": "outline",
                "color": "#FFFFFF",
            },
            "artist": {
                "position": "bottom-center",
                "size": 42,
                "font_style": "serif",
                "case": "original",
                "treatment": "light",
                "color": "#F5F1E8",
            },
            "advisory": {"position": "bottom-right", "size": "small"},
        },
    )
    assert response.status_code == 200
    assert images.calls == calls_before
    updated = response.json()
    assert updated["release_text"]["show_artist"] is False
    assert updated["release_text"]["title"]["position"] == "top-left"


def test_reference_upload_is_validated_and_never_exposes_storage_path(app_factory):
    client, *_ = app_factory()
    response = _create(
        client,
        extra={"variation_count": "3", "reference_type": "artist"},
        files={"reference_image": ("artist.png", _png_bytes(), "image/png")},
    )
    assert response.status_code == 201
    reference = response.json()["artist_reference"]
    assert reference["reference_type"] == "artist"
    assert reference["hash"]
    assert "path" not in reference


def test_generate_better_requires_and_uses_the_user_selected_source_cover(app_factory):
    client, _, _, images = app_factory()
    body = _create(client, extra={"variation_count": "3"}).json()
    generation_id = body["id"]
    missing = client.post(
        f"/api/generations/{generation_id}/improve",
        json={"mood_path": "lyrics", "variation_count": 3, "run_async": False},
    )
    assert missing.status_code == 422

    source_id = body["variation_sets"][0]["variations"][1]["id"]
    calls_before = images.calls
    improved = client.post(
        f"/api/generations/{generation_id}/improve",
        json={
            "source_variation_id": source_id,
            "mood_path": "lyrics",
            "variation_count": 3,
            "run_async": False,
        },
    )
    assert improved.status_code == 200
    updated = improved.json()
    assert len(updated["variation_sets"]) == 2
    assert images.calls == calls_before + 3
    events = [e for e in updated["audit_events"] if e["step"] == "generate_better"]
    assert events
    assert events[-1]["details"]["source_variation_id"] == source_id
