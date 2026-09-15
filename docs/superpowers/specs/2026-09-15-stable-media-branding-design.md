# Stable Media + Branding Design

## Goal

Make AWS object keys the durable source of truth for photos, audio, thumbnails, and saved videos while treating signed URLs as replaceable access tokens. Also separate the video watermark from the default cover so each brand asset can be changed independently.

## Approved behavior

- Preserve existing AWS object keys (`file_key`, `image_key`, `avatar_key`, `video_key`, `thumbnail_key`, `attachment_key`) and refresh access URLs from those keys.
- Do not persist temporary `blob:` / `data:` URLs or rely on old signed URLs as durable media identity.
- Audio must refresh before playback and retry once automatically if a signed source expires during resume/load.
- Photos and thumbnails must be able to refresh from their object key instead of disappearing until the whole app is reloaded.
- Saved videos must refresh `video_key` and `thumbnail_key` before playback/download and must not depend on stale track audio URLs.
- Music Video Maker must preload its background/cover image once and reuse the loaded image throughout the animation/render loop.
- Watermark and default cover are separate static assets. The first uploaded image is the watermark; the second uploaded image is the default cover.
- Existing app features, AWS persistence, Cognito auth, YouTube/Spotify routes, and current database schema must not be disrupted.

## Architecture

Create a focused frontend media-access service that wraps the existing authenticated `/media/read-url` API. Consumers pass an object key plus the current URL and receive a fresh playable/displayable URL. Specialized helpers for tracks and promo videos use that resolver without changing persisted object keys.

`MediaStoreContext` remains responsible for durable app state. It may update in-memory URLs after a successful refresh, but the persistence sanitizer continues removing signed URLs whenever the matching stable key exists. Playback/render components resolve media immediately before use rather than assuming cached URLs remain valid.

## Branding

- `public/ogbeatz_watermark.jpeg`: first uploaded image, used only for watermark rendering.
- `public/ogbeatz_default_cover.jpeg`: second uploaded image, used only when a track/playlist has no artwork.
- Existing `public/ogbeatz_logo.svg` remains untouched for favicon/other existing brand usage unless a consumer is specifically the watermark/default-cover path.

## Failure handling

- A failed refresh never deletes or overwrites the stable object key.
- If a refresh fails but the current URL is still usable, the caller may keep using it.
- If a refreshed source fails during active playback, retry at most once to avoid loops.
- Local user-selected files continue to use browser object URLs only for the current session and are revoked on replacement/unmount.

## Verification

Regression tests must cover single-object media refresh, track audio refresh without full bootstrap, video/thumbnail refresh, no per-frame image construction in Music Video Maker, and separate branding asset paths. Existing TypeScript checks and production build must stay green.
