# EZ AI Album Cover Studio Integration Spec

## Approved behavior

Replace the existing EZ-WAY main Album Cover Studio experience with the workflow from `aitopmusicnews-cloud/EZ-AI-Album-cover-studio` without redesigning or simplifying that workflow.

The standalone workflow remains:

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
- Use the standalone Album Cover backend through `VITE_ALBUM_COVER_API_URL`; do not expose Gemini/OpenAI provider keys in the browser.

## Edit Metadata cleanup

`EditTrackModal.tsx` must no longer contain the Pollinations/Flux AI cover generator, model/aspect/seed/style controls, Pollinations auth, AI prompt state, or generated-cover UI. Keep manual artwork upload/replace/download/clear, metadata fields, lyrics, AWS re-analysis, save and delete actions. Rename the modal heading to `Edit Metadata`.

## Non-goals

- Do not alter the standalone backend generation algorithm or provider workflow.
- Do not replace the standalone studio with an iframe.
- Do not remove normal manual artwork handling from Edit Metadata.
- Do not change unrelated EZ-WAY features.
