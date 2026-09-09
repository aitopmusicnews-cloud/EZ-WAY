# Browser-Local Lyrics & Stem Separation Design

Date: 2026-09-08
Status: Proposed and user-approved direction; implementation pending review of this written spec
Repository: `aitopmusicnews-cloud/EZ-WAY`

## 1. Problem

EZ-WAY's Music Intelligence analysis now runs successfully in the browser, but Synced Lyrics and Stem Separation still use `VITE_AUDIO_TOOLS_URL` and submit jobs to the Render Audio Tools service.

Production evidence shows the AWS handoff is not the primary blocker:

- New audio-tool jobs are being created in DynamoDB.
- The source audio object exists in the AWS media bucket.
- The Render IAM user has source S3 read, output S3 read/write, and DynamoDB job-state permissions.
- A current lyrics job moved from `accepted` to `running`.
- A stems job submitted while lyrics was running remained `accepted` behind it.
- Render is configured with one worker, so long-running Whisper/Demucs work serializes all audio jobs.

The current compute placement is therefore the architectural problem: lyrics and stems are heavy local media workloads running on a very small shared Render worker. This makes both features slow and fragile and couples two user-facing tools to a remote job queue that EZ-WAY no longer needs for Music Intelligence.

## 2. Goal

Move Synced Lyrics and Stem Separation to browser-local processing, matching the new browser-local Music Intelligence architecture.

The user-visible contract must remain intact:

- Synced Lyrics returns timestamped lyrics and downloadable `.lrc` and plain-text files.
- Lyrics are saved back to the selected track.
- Stem Separation supports:
  - `vocals_instrumental`: vocals + instrumental/no-vocals
  - `full`: vocals + drums + bass + other
- Stem results remain downloadable individually and as a ZIP bundle.
- Progress/status text continues to update in the existing dialogs.
- Failure never invents lyrics or fake stem files.

## 3. Architecture

### 3.1 Browser is the compute layer

Create a browser-local Audio Tools service that owns both transcription and source separation.

```text
Track source
  -> browser fetch / File / Blob
  -> Web Worker
       -> Whisper browser runtime -> timestamped lyrics
       -> Demucs-compatible ONNX runtime -> stems
  -> browser-generated files
  -> optional AWS persistence through existing authenticated upload API
  -> existing EZ-WAY UI contract
```

No lyrics or stem-separation compute is sent to Render, Modal, Gemini, ECS, Lambda workers, or any other paid inference service.

### 3.2 AWS remains the persistence layer

AWS remains authoritative for the original media file and the EZ-WAY track record.

For lyrics:

1. Load the source track from `file_data` when available, otherwise fetch the current S3 read URL.
2. Transcribe locally.
3. Build timestamped LRC and plain text locally.
4. Persist the lyrics string using the existing track update flow.
5. Upload generated LRC/plain files to the AWS media bucket when app-data storage is configured.

For stems:

1. Load the source track locally.
2. Separate locally in a Web Worker.
3. Encode/export the requested WAV stem files.
4. Build the ZIP locally.
5. Upload generated outputs to AWS when app-data storage is configured; otherwise expose local object URLs for immediate download.

The AWS app-data upload contract currently has no dedicated generated-audio category. Add one narrowly scoped category such as `audio-tools-output` with an `audio/` content-type family and a suitable per-file size ceiling. Generated ZIPs can either use a second dedicated category or the same generated-output category with an explicitly allowed ZIP content type. The category must remain authenticated and private.

## 4. Lyrics Processing

### 4.1 Runtime

Use a browser Whisper implementation based on Hugging Face Transformers.js running in a Web Worker.

Preferred execution order:

1. WebGPU when available.
2. WASM fallback when WebGPU is unavailable and the selected model is supported within practical browser memory limits.

The initial production model should prioritize reliability and reasonable browser memory over maximum model size. The implementation plan must pin the chosen model and package versions after a browser compatibility smoke test.

### 4.2 Input

Lyrics should transcribe the original mixed track directly by default.

Do not require stem separation before transcription. Requiring Demucs first would recreate the existing coupling and make Synced Lyrics dependent on the heavier feature.

### 4.3 Output

Return the existing `AudioToolJobResult`-compatible shape:

```ts
{
  status: 'completed',
  action: 'lyrics',
  lyrics: string,
  language?: string | null,
  language_probability?: number | null,
  files: {
    lrc: string,
    plain: string,
  },
}
```

The `lyrics` value remains timestamped LRC-style text so current track persistence and UI behavior continue to work.

If no reliable transcript is produced, return a failure and leave existing track lyrics unchanged.

## 5. Stem Separation

### 5.1 Runtime

Use a Demucs-compatible browser model executed with ONNX Runtime Web in a dedicated Web Worker.

Preferred execution order:

1. WebGPU.
2. WASM fallback only if the model and track length fit practical memory limits.

No server-side fallback should silently run. If the current browser cannot support separation, the UI should report that requirement clearly instead of submitting a Render job.

### 5.2 Modes

Preserve current modes exactly:

`vocals_instrumental`
- vocals
- instrumental/no-vocals

`full`
- vocals
- drums
- bass
- other

The implementation may derive `instrumental` by summing non-vocal stems when the browser model emits four stems rather than a native two-stem output.

### 5.3 Output

Return the existing `AudioToolJobResult`-compatible shape:

```ts
{
  status: 'completed',
  action: 'stems',
  mode: 'vocals_instrumental' | 'full',
  files: Record<string, string>,
  bundle_url: string,
}
```

URLs may initially be browser object URLs, then be replaced with AWS signed read URLs after successful persistence.

## 6. Worker Isolation and UI Responsiveness

All model loading, decoding, inference, and heavy audio transforms must run outside the React main thread.

Create dedicated worker boundaries so:

- React remains responsive.
- Progress messages can be streamed back to the existing dialogs.
- A user can cancel a running task.
- Model state can be reused within the same browser session.
- Large intermediate arrays can be released deterministically after completion/cancellation.

Suggested progress phases:

Lyrics:
- Loading transcription model…
- Decoding audio…
- Transcribing locally…
- Building synced lyrics…
- Saving results…

Stems:
- Loading separation model…
- Decoding audio…
- Separating stems locally…
- Encoding WAV files…
- Building ZIP…
- Saving results…

## 7. Model Caching

Browser model downloads should be cached by the browser/runtime after the first successful load.

The UI must explain the first-run model download rather than appearing frozen. Subsequent runs should reuse cached assets when supported.

Do not pre-download large audio models on app startup. Load them only when the user invokes Synced Lyrics or Stem Separation.

## 8. Source Handling

Use the same resilient source rules as browser Music Intelligence:

1. Prefer `track.file_data` when the upload is still available locally.
2. Otherwise use the current authenticated/presigned `track.file_url`.
3. When a stable `file_key` exists and the URL may be stale, refresh the source through the AWS app-data bootstrap flow before processing.
4. Reject unusable `blob:` references when their backing Blob is no longer available.

This prevents old S3 signed URLs from becoming a hidden dependency.

## 9. Service Boundary

Replace remote job execution in UI consumers with a local service contract rather than duplicating model logic inside components.

Recommended service boundary:

```ts
runLocalAudioTool(
  track: Track,
  action: 'lyrics' | 'stems',
  mode?: StemMode,
  onProgress?: (status: string) => void,
): Promise<AudioToolJobResult>
```

`AudioAnalyzerStudio.tsx` and `TrackOptionsMenu.tsx` should call this boundary.

`audioTools.ts` should either become the local compatibility facade or be replaced by a clearly named browser-local module. Existing consumers should not know or care whether the implementation uses workers, WebGPU, ONNX, or Transformers.js.

## 10. Render and Legacy AWS Audio Tools

After browser-local lyrics/stems are verified in production:

- `VITE_AUDIO_TOOLS_URL` must no longer be required for Analyze, Lyrics, or Stems.
- The Render service may remain temporarily deployed for rollback/diagnostics, but production UI must not call it.
- Do not delete the legacy Render/AWS audio-tool infrastructure in the same implementation PR. Removing infrastructure is a separate cleanup task after a stable production verification window.
- Existing stale `accepted`/`running` DynamoDB jobs may remain historical records; no migration is required for the browser-local feature.

## 11. Error Handling

Expected failures must be explicit and local:

- WebGPU unsupported and WASM fallback unavailable -> explain browser capability requirement.
- Model download failure -> show retryable model-download error.
- Track fetch failure -> refresh signed URL once, then fail clearly.
- Decode failure -> identify unsupported/corrupt audio.
- Memory exhaustion -> show a browser-memory error and recommend closing other tabs or using a shorter/lighter operation; do not fall back to Render automatically.
- Empty transcript -> leave existing lyrics unchanged.
- Separation failure -> do not expose partial/fake downloadable stems as complete results.
- AWS persistence failure after successful local processing -> preserve local downloadable object URLs and tell the user that processing completed but cloud save failed.

## 12. Security and Privacy

- Source audio stays in the user's browser during inference.
- No model provider receives the user's song for lyrics or stems.
- AWS receives only the original source already stored there plus finished outputs the app explicitly persists.
- No AWS credentials are exposed to browser code; uploads continue through authenticated presigned URLs.
- No Gemini, Modal, or Render inference secret is required for these operations.

## 13. Testing Strategy

Implementation must follow TDD.

Required automated contracts:

1. Lyrics consumer does not call `VITE_AUDIO_TOOLS_URL` or `POST /jobs`.
2. Stems consumer does not call `VITE_AUDIO_TOOLS_URL` or `POST /jobs`.
3. Lyrics result preserves `lyrics`, `files.lrc`, and `files.plain` fields expected by current UI.
4. Lyrics persistence updates the selected track only after a non-empty reliable transcript.
5. Existing lyrics remain unchanged on empty/failed transcription.
6. `vocals_instrumental` returns vocals + instrumental.
7. `full` returns vocals + drums + bass + other.
8. Stem result exposes a ZIP bundle URL.
9. Progress callbacks are emitted for model load, processing, and persistence phases.
10. Source refresh is attempted for stale signed URLs when `file_key` is available.
11. AWS generated-output upload category accepts intended audio/ZIP types and rejects unrelated file types/sizes.
12. Unsupported browser capability errors do not trigger a server fallback.
13. TypeScript, full existing CI, and production build remain green.

## 14. Production Verification Gate

Do not call the migration complete until all of the following are freshly verified:

1. Production frontend deploy contains the new browser-local code.
2. A real track generates non-empty timestamped lyrics.
3. Saved track lyrics survive a page reload.
4. LRC and plain-text downloads open correctly.
5. A real track completes vocals + instrumental separation.
6. A real track completes full four-stem separation on a supported browser/device.
7. Individual stem downloads work.
8. ZIP download works.
9. Browser network inspection shows no Render `/jobs` request for Analyze, Lyrics, or Stems.
10. Existing Copyrights, YouTube, Promo Pack, and Music Intelligence workflows still receive the same track metadata contracts.

## 15. Scope Boundaries

Included:
- Browser-local synced lyrics.
- Browser-local two-stem and four-stem separation.
- Worker isolation and progress reporting.
- Existing UI integration.
- AWS persistence support for generated outputs.
- Tests and production verification.

Not included in this change:
- Rewriting Music Intelligence again.
- Removing all legacy AWS audio-tools infrastructure.
- Removing Render service resources immediately.
- Changing Copyrights/YouTube/Promo Pack behavior.
- Replacing the messaging subsystem.
- Adding a paid GPU/server inference fallback.

## 16. Decision

Proceed with browser-local Lyrics and Stem Separation as the sole production compute path for those two features. Preserve AWS for authentication, source media, track persistence, and optional generated-output persistence. Keep legacy remote audio tools only as dormant rollback infrastructure until the browser-local implementation has passed the production verification gate.