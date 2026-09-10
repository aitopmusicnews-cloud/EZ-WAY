import json

import httpx
import pytest

from app.errors import (
    CloudflareAuthenticationError,
    CloudflareRateLimitError,
    CloudflareRequestError,
    CloudflareServiceError,
)


def _thesis_payload():
    return {
        "core_meaning": "survival",
        "emotional_arc": "contained to defiant",
        "musical_personality": ["tense"],
        "lyrical_world": {"people": [], "objects": [], "places": [], "symbols": []},
        "creative_contradiction": "calm vocal over hard drums",
        "signature_moment": "final hook",
        "visual_permissions": ["pressure", "stillness"],
        "visual_bans": ["sports car"],
        "artist_role_recommendation": "none",
        "campaign_thesis": "calm control under pressure",
    }


@pytest.mark.asyncio
async def test_song_thesis_uses_cloudflare_endpoint_and_bearer_auth():
    from app.cloudflare_creative_director import CloudflareGemmaCreativeDirector

    seen = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        payload = json.loads(request.content)
        assert payload["messages"][0]["role"] == "system"
        assert payload["messages"][1]["role"] == "user"
        return httpx.Response(200, json={"result": {"response": json.dumps(_thesis_payload())}})

    client = CloudflareGemmaCreativeDirector(
        account_id="acct",
        api_token="secret",
        transport=httpx.MockTransport(handler),
    )
    thesis = await client.build_song_thesis(context={"lyrics": "hold the line"})

    assert thesis.campaign_thesis == "calm control under pressure"
    assert "/accounts/acct/ai/run/@cf/google/gemma-4-26b-a4b-it" in seen["url"]
    assert seen["auth"] == "Bearer secret"


@pytest.mark.asyncio
async def test_missing_cloudflare_credentials_fail_before_network_request():
    from app.cloudflare_creative_director import CloudflareGemmaCreativeDirector

    called = False

    async def handler(_: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(500)

    client = CloudflareGemmaCreativeDirector(
        account_id=None,
        api_token=None,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(CloudflareAuthenticationError):
        await client.build_song_thesis(context={})
    assert called is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,error_type",
    [
        (401, CloudflareAuthenticationError),
        (403, CloudflareAuthenticationError),
        (429, CloudflareRateLimitError),
        (500, CloudflareServiceError),
        (400, CloudflareRequestError),
    ],
)
async def test_cloudflare_director_errors_are_classified(status, error_type):
    from app.cloudflare_creative_director import CloudflareGemmaCreativeDirector

    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"errors": [{"message": "provider error"}]})

    client = CloudflareGemmaCreativeDirector(
        account_id="acct",
        api_token="secret",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(error_type):
        await client.build_song_thesis(context={})


@pytest.mark.asyncio
async def test_malformed_cloudflare_director_response_is_service_error():
    from app.cloudflare_creative_director import CloudflareGemmaCreativeDirector

    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"result": {"response": "not json"}})

    client = CloudflareGemmaCreativeDirector(
        account_id="acct",
        api_token="secret",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(CloudflareServiceError):
        await client.build_song_thesis(context={})
