#!/usr/bin/env bash
set -euo pipefail

: "${EZWAY_API_BASE:?Set EZWAY_API_BASE}"
: "${COGNITO_USER_POOL_ID:?Set COGNITO_USER_POOL_ID}"
: "${COGNITO_CLIENT_ID:?Set COGNITO_CLIENT_ID}"
: "${SMOKE_ADMIN_EMAIL:?Set SMOKE_ADMIN_EMAIL}"
: "${SMOKE_ADMIN_PASSWORD:?Set SMOKE_ADMIN_PASSWORD}"

REGION="${AWS_REGION:-us-west-2}"
API_BASE="${EZWAY_API_BASE%/}"

for command in aws curl python; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 1; }
done

json_field() {
  local field="$1"
  python -c "import json,sys; value=json.load(sys.stdin); print(value$field if value$field is not None else '')"
}

uuid() {
  python -c 'import uuid; print(uuid.uuid4())'
}

TRACK_ID="$(uuid)"
CLIENT_ID="$(uuid)"
SHARE_ID="$(uuid)"
SHARE_TOKEN="smoke-$(uuid)"
FIXTURE="$(mktemp --suffix=.png)"
trap 'rm -f "$FIXTURE"' EXIT

# A tiny generated PNG fixture; no binary test asset is committed.
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2mH0AAAAASUVORK5CYII=' | base64 --decode > "$FIXTURE"
FIXTURE_SIZE="$(wc -c < "$FIXTURE" | tr -d ' ')"

cleanup() {
  set +e
  if [[ -n "${ID_TOKEN:-}" ]]; then
    curl -fsS -X DELETE "$API_BASE/share-links/$SHARE_ID" -H "Authorization: Bearer $ID_TOKEN" >/dev/null 2>&1 || true
    curl -fsS -X DELETE "$API_BASE/clients/$CLIENT_ID" -H "Authorization: Bearer $ID_TOKEN" >/dev/null 2>&1 || true
    curl -fsS -X DELETE "$API_BASE/tracks/$TRACK_ID" -H "Authorization: Bearer $ID_TOKEN" >/dev/null 2>&1 || true
  fi
}
trap 'cleanup; rm -f "$FIXTURE"' EXIT

AUTH_JSON="$(aws cognito-idp initiate-auth \
  --region "$REGION" \
  --client-id "$COGNITO_CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters "USERNAME=$SMOKE_ADMIN_EMAIL,PASSWORD=$SMOKE_ADMIN_PASSWORD" \
  --output json)"

CHALLENGE="$(printf '%s' "$AUTH_JSON" | python -c 'import json,sys; print(json.load(sys.stdin).get("ChallengeName", ""))')"
if [[ -n "$CHALLENGE" ]]; then
  echo "Smoke-test credentials require Cognito challenge: $CHALLENGE" >&2
  echo "Complete that challenge in EZ-WAY first, then rerun with the permanent password." >&2
  exit 1
fi

ID_TOKEN="$(printf '%s' "$AUTH_JSON" | python -c 'import json,sys; print(json.load(sys.stdin).get("AuthenticationResult", {}).get("IdToken", ""))')"
if [[ -z "$ID_TOKEN" ]]; then
  echo "Cognito did not return an ID token." >&2
  exit 1
fi

auth_header=(-H "Authorization: Bearer $ID_TOKEN")
json_header=(-H 'Content-Type: application/json')

echo "health: checking"
HEALTH="$(curl -fsS "$API_BASE/health")"
printf '%s' "$HEALTH" | python -c 'import json,sys; d=json.load(sys.stdin); assert d.get("status")=="ok" and d.get("provider")=="aws"'
echo "health: ok"

echo "bootstrap: checking authenticated workspace"
curl -fsS "$API_BASE/bootstrap" "${auth_header[@]}" | python -c 'import json,sys; d=json.load(sys.stdin); required={"tracks","playlists","clients","activities","share_links","messages","promo_videos","profile"}; assert required.issubset(d)'
echo "bootstrap: pass"

echo "private S3 upload/read: checking"
PRESIGN="$(curl -fsS -X POST "$API_BASE/uploads/presign" \
  "${auth_header[@]}" "${json_header[@]}" \
  -d "{\"category\":\"artwork\",\"relatedId\":\"$TRACK_ID\",\"filename\":\"smoke.png\",\"contentType\":\"image/png\",\"size\":$FIXTURE_SIZE}")"
UPLOAD_URL="$(printf '%s' "$PRESIGN" | python -c 'import json,sys; print(json.load(sys.stdin)["upload_url"])')"
READ_URL="$(printf '%s' "$PRESIGN" | python -c 'import json,sys; print(json.load(sys.stdin)["read_url"])')"
OBJECT_KEY="$(printf '%s' "$PRESIGN" | python -c 'import json,sys; print(json.load(sys.stdin)["object_key"])')"
curl -fsS -X PUT "$UPLOAD_URL" -H 'Content-Type: image/png' --data-binary "@$FIXTURE" >/dev/null
curl -fsS "$READ_URL" >/dev/null
echo "private S3 upload/read: pass"

echo "track CRUD: checking"
TRACK_JSON="$(curl -fsS -X POST "$API_BASE/tracks" \
  "${auth_header[@]}" "${json_header[@]}" \
  -d "{\"id\":\"$TRACK_ID\",\"name\":\"AWS Smoke Track\",\"artist\":\"EZ-WAY Smoke\",\"duration\":30,\"bpm\":120,\"key_signature\":\"C Minor\",\"image_key\":\"$OBJECT_KEY\",\"size\":1,\"type\":\"audio/mpeg\",\"tags\":[\"smoke\"],\"status\":\"ready\"}")"
printf '%s' "$TRACK_JSON" | python -c 'import json,sys; d=json.load(sys.stdin); assert d.get("id") and d.get("name")=="AWS Smoke Track" and d.get("image_url")'
PATCHED="$(curl -fsS -X PATCH "$API_BASE/tracks/$TRACK_ID" \
  "${auth_header[@]}" "${json_header[@]}" -d '{"bpm":121}')"
printf '%s' "$PATCHED" | python -c 'import json,sys; assert json.load(sys.stdin).get("bpm")==121'
echo "track CRUD: pass"

echo "client/share creation: checking"
CLIENT_JSON="$(curl -fsS -X POST "$API_BASE/clients" \
  "${auth_header[@]}" "${json_header[@]}" \
  -d "{\"id\":\"$CLIENT_ID\",\"name\":\"AWS Smoke Client\",\"email\":\"smoke-$CLIENT_ID@example.invalid\",\"status\":\"online\",\"last_active\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"tags\":[\"smoke\"]}")"
printf '%s' "$CLIENT_JSON" | python -c 'import json,sys; assert json.load(sys.stdin).get("id")'
SHARE_JSON="$(curl -fsS -X POST "$API_BASE/share-links" \
  "${auth_header[@]}" "${json_header[@]}" \
  -d "{\"id\":\"$SHARE_ID\",\"token\":\"$SHARE_TOKEN\",\"track_id\":\"$TRACK_ID\",\"client_id\":\"$CLIENT_ID\",\"recipient_email\":\"smoke@example.invalid\",\"download_enabled\":true}")"
printf '%s' "$SHARE_JSON" | python -c 'import json,sys; assert json.load(sys.stdin).get("token")'
echo "client/share creation: pass"

echo "public share resolve: checking"
PUBLIC_JSON="$(curl -fsS "$API_BASE/public/share/$SHARE_TOKEN")"
printf '%s' "$PUBLIC_JSON" | python -c 'import json,sys; d=json.load(sys.stdin); assert d.get("track",{}).get("id") and d.get("link",{}).get("token")'
echo "public share resolve: pass"

echo "public play/feedback event: checking"
curl -fsS -X POST "$API_BASE/public/share/$SHARE_TOKEN/events" "${json_header[@]}" \
  -d "{\"type\":\"play\",\"track_id\":\"$TRACK_ID\"}" >/dev/null
VERIFY="$(curl -fsS "$API_BASE/bootstrap" "${auth_header[@]}")"
printf '%s' "$VERIFY" | TRACK_ID="$TRACK_ID" python -c 'import json,os,sys; d=json.load(sys.stdin); t=next(x for x in d["tracks"] if x["id"]==os.environ["TRACK_ID"]); assert t.get("plays",0)>=1'
echo "public play/feedback event: pass"

echo "cleanup: checking"
cleanup
ID_TOKEN=""
echo "cleanup: pass"

echo "LIVE APP-DATA SMOKE PASSED"
