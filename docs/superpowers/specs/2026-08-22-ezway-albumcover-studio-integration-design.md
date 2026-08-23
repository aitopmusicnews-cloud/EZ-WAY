# EZ AI Albumcover Studio Integration Design

## Goal

Integrate **EZ AI Albumcover Studio** into EZ-WAY as a native, streamlined feature that reuses the EZ-WAY track library and Music Intelligence data instead of duplicating uploads, song analysis, or standalone-app workflows.

## Product behavior

EZ AI Albumcover Studio appears as a native EZ-WAY tool. The normal flow is:

**Albumcover Studio → Select Track → Generate 3 Covers → Choose Cover → Save to Track**

The feature is available to the current user without a paywall. Its entry point must be structured so a premium entitlement check can be enabled later without rebuilding the feature.

## Track selection and auto-fill

The page uses the same library-track selection pattern as the Video Maker. Selecting a track automatically supplies all available source data:

- track title
- artist name
- lyrics
- saved Music Intelligence genre
- mood
- style/vibe
- BPM
- key/Camelot where useful for creative direction
- instruments
- keywords
- existing artwork, when present

Users do not re-upload the song or re-enter metadata that EZ-WAY already stores.

## Reuse the existing analyzer

EZ-WAY Music Intelligence is the authoritative song-analysis source for this integration. The standalone Album Cover Studio audio-analysis pipeline must not be run again merely to obtain BPM, key, genre, mood, or related song descriptors already present in the Song Profile.

For the native EZ-WAY flow, the saved Music Intelligence fields plus saved lyrics are converted into a structured creative brief and sent to the Albumcover backend as text input. This deliberately avoids sending the audio master to the Albumcover analyzer and therefore avoids running a second acoustic-analysis job.

## Features retained from the standalone Album Cover Studio

The EZ-WAY integration keeps only the features that directly serve cover creation:

1. Generate **3 distinct cover concepts** per normal generation request.
2. Optional **Parental Advisory** toggle.
3. Use the existing creative-direction/image-rendering backend rather than exposing provider API keys to the browser.
4. Apply exact title/artist typography after image generation so release text is spelled correctly.
5. Produce final **3000×3000 PNG** artwork.
6. Allow **Generate New Options** for another set of concepts.
7. Allow the user to select one result and **Save Cover to Track**.
8. Preserve enough generation status/error information to retry a failed generation without losing the track selection.

## Standalone features intentionally omitted from EZ-WAY

The integrated page does not reproduce the standalone app's independent product shell. Specifically, EZ-WAY should not require:

- a second MP3 upload screen for library tracks
- a second lyrics upload when lyrics are already stored on the track
- a second song-analysis dashboard
- a separate mood-conflict decision workflow in the normal path
- a separate standalone cover-history dashboard
- a browser-local SQLite workflow
- duplicate artist/title entry when those values exist on the track
- duplicate authentication solely for Albumcover Studio
- Gemini concept-ranking calls in the slim production configuration
- Gemini cover-critic calls in the slim production configuration

The backend can retain local/deterministic fallback ranking and critique needed for compatibility, but the EZ-WAY user interface should remain simple.

## Missing-cover upload prompt

After a successful track upload, EZ-WAY checks whether artwork is present.

If artwork exists, upload proceeds normally with no cover prompt.

If artwork is missing, EZ-WAY displays a notice:

**No cover art detected**

"This track was uploaded without cover artwork. Do you want to generate one now in EZ AI Albumcover Studio?"

Actions:

- **Generate Cover** — keep the already-saved track, open EZ AI Albumcover Studio, auto-select the newly uploaded track, and prefill all available data.
- **Skip for Now** — keep the track in the library with no forced generation.

A track without artwork remains eligible for a later **Generate Cover** action from Albumcover Studio. Upload must never fail merely because the user skipped cover generation.

## Saving artwork

Selecting **Save Cover to Track** updates the selected EZ-WAY track's artwork using the final normalized 3000×3000 result. The chosen cover then becomes the artwork reused by other EZ-WAY features such as Video Maker, sharing, and YouTube/promo workflows.

Generated but unselected alternatives must not silently replace the current track artwork.

## Premium readiness

The feature is free/enabled for the current single-user phase. Code calls a shared feature-entitlement boundary rather than hard-coding premium UI throughout the component.

The initial entitlement result for Albumcover Studio is enabled. Later, the entitlement source can be switched to subscription data alongside Copyrights.

## Backend and security

The standalone `EZ-AI-Album-cover-studio` repository remains the source for generation logic. EZ-WAY communicates with its server-side generation API through `VITE_ALBUM_COVER_API_URL`.

Provider credentials such as OpenAI or Gemini API keys remain server-side and must never be placed in Vite/browser environment variables that expose their values to clients.

The existing Render backend is `ez-ai-album-cover-api`. At the time of this integration it is user-suspended, so live generation remains unavailable until that existing service is resumed. Do not create a duplicate service merely to work around the suspension because the existing service owns its server-side provider configuration.

After resume, configure its non-secret slim-mode settings to allow the EZ-WAY origins and disable the unnecessary AI ranking/critic calls while preserving the creative-director and image-rendering stages.

## Failure behavior

- A failed cover generation does not modify or delete the source track.
- A failed image result does not replace existing artwork.
- Users can retry generation while keeping the same selected track and prefilled data.
- If the backend is not configured, the page reports that cover generation is unavailable instead of fabricating a result.
- Skipping the missing-cover prompt is always safe and leaves the track usable.

## Testing requirements

Tests cover at minimum:

- missing-cover detection
- no prompt when artwork exists
- track-to-cover request data mapping
- Song Profile metadata preferred over legacy tags
- exactly three default cover requests/options at the EZ-WAY integration boundary
- premium entitlement defaults to enabled for the current phase

The repository verification workflow also runs the full TypeScript check and production build so navigation and UI wiring must compile.

## Out of scope for this phase

- activating a paid subscription requirement
- rebuilding all standalone Album Cover Studio screens inside EZ-WAY
- changing image providers
- changing the existing Music Intelligence model stack
- automatic generation without user consent after upload
- official distribution/release submission
