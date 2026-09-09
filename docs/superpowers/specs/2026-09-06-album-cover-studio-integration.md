# EZ AI Album Cover Studio Integration Spec

## Approved behavior

Keep the Album Cover Studio workflow already integrated into EZ-WAY without redesigning or simplifying it. EZ-WAY is now the source-of-truth repository for both the browser integration and the Album Cover backend.

The workflow remains:

1. Release + source material
2. Analyze and generate
3. Generated directions and analysis
4. Resolve audio/lyrics mood conflict when the backend requires a choice
5. Review 3–5 generated variations, including AI winner/runner-up labels and commercial/market signals when present
6. Select/download a cover
7. Generate Better or create fresh Blend/Audio/Lyrics variation sets
8. Review Studio metrics
9. Review and reopen Input versions/history

## EZ-WAY integration actions

EZ-WAY adds only integration actions around that workflow:

- Select an existing EZ-WAY track.
- Auto-fill title, artist, lyrics and the existing track audio source when available.
- Keep title editable and allow saving the updated title back to the EZ-WAY track.
- Allow the user to replace/add MP3 or lyrics input manually before generation.
- Keep Parental Advisory and 3–5 variation-count controls.
- Save the selected finished cover back to the EZ-WAY track artwork so downstream Videos, Sharing and YouTube use it.
- Keep direct download of generated covers.
- Use the Album Cover backend maintained under `album_cover_backend/` in this repository through `VITE_ALBUM_COVER_API_URL`.
- Keep provider credentials server-side; never expose Gemini or Cloudflare provider secrets in browser code or `VITE_*` variables.

## Backend provider responsibilities

- Gemini remains responsible for creative direction, concept generation/ranking, and cover criticism.
- Cloudflare Workers AI renders final cover images with `@cf/black-forest-labs/flux-1-schnell`.
- Pollinations is not part of the Album Cover backend provider path.
- The backend is API-only inside EZ-WAY; the main EZ-WAY React application remains the Album Cover Studio user interface.

## Edit Metadata cleanup

`EditTrackModal.tsx` must no longer contain the Pollinations/Flux AI cover generator, model/aspect/seed/style controls, Pollinations auth, AI prompt state, or generated-cover UI. Keep manual artwork upload/replace/download/clear, metadata fields, lyrics, AWS re-analysis, save and delete actions. Rename the modal heading to `Edit Metadata`.

## Non-goals

- Do not redesign the Album Cover Studio workflow.
- Do not replace the studio with an iframe or a second standalone frontend.
- Do not remove normal manual artwork handling from Edit Metadata.
- Do not expose Cloudflare credentials to the browser.
- Do not add a Pollinations fallback.
- Do not change unrelated EZ-WAY features.
