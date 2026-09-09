# EZ-WAY Audio Tools — Browser-Local Runtime

EZ-WAY's production Audio Tools compute path runs in the user's browser.

Music Intelligence, Synced Lyrics, and Stem Separation do **not** depend on Modal, Gemini, Render inference, ECS workers, or Lambda inference. AWS remains responsible for authentication, source-media persistence, application data, and optional persistence of generated files.

## Production flow

```text
Track source
  -> prefer track.file_data
  -> otherwise refresh/use current signed S3 file_url
  -> browser decode/resample

Music Intelligence
  -> browser-local song-profile analysis

Synced Lyrics
  -> Whisper Tiny Web Worker
  -> timestamped LRC + plain text
  -> save lyrics to track
  -> optional private AWS output upload

Stem Separation
  -> Spleeter 4-stem ONNX Web Worker
  -> vocals / drums / bass / other
  -> optional vocals + instrumental derivation
  -> WAV files + ZIP
  -> optional private AWS output upload
```

## Synced Lyrics

Implementation:

- Facade: `src/services/browserAudioTools.ts`
- Worker client: `src/services/lyricsWorkerClient.ts`
- Worker: `src/workers/lyrics.worker.ts`
- Formatter: `src/services/lyricsCore.ts`
- Runtime: `@huggingface/transformers@4.2.0`
- Model: `onnx-community/whisper-tiny`

The source audio is decoded in the browser, mixed to mono, and resampled to 16 kHz before transcription. The worker prefers WebGPU when available and falls back to the Transformers.js browser runtime/WASM path.

The worker requests timestamps and returns transcript chunks. EZ-WAY converts those chunks into:

- timestamped LRC-style lyrics stored on the track;
- a downloadable `.lrc` file;
- a downloadable plain-text lyric file.

If no reliable transcript text is produced, the operation fails and existing track lyrics remain unchanged.

Lyrics transcribes the original source mix directly. It does **not** require stem separation first.

## Stem Separation

Implementation:

- Facade: `src/services/browserAudioTools.ts`
- Worker client: `src/services/stemsWorkerClient.ts`
- Worker: `src/workers/stems.worker.ts`
- DSP helpers: `src/services/spleeterCore.ts`
- WAV encoder: `src/services/wav.ts`
- Runtime: `onnxruntime-web@1.29.0`
- FFT runtime: `fourier-transform@2.4.1`
- Model: `Best-Practice/spleeter-4stems-onnx`

The selected four-stem ONNX model emits magnitude estimates for:

- vocals
- drums
- bass
- other

The worker uses the published Spleeter contract:

- 44.1 kHz stereo input
- periodic Hann window
- FFT size 4096
- hop size 1024
- 1024 modeled frequency bins
- 512 frames per inference split
- four-way squared soft-ratio masks
- average extension across the unmodeled high-frequency bins
- original phase plus overlap-add inverse reconstruction

### Modes

`vocals_instrumental`

- vocals
- instrumental, derived by summing drums + bass + other

`full`

- vocals
- drums
- bass
- other

Each requested stem is encoded as 16-bit stereo WAV. EZ-WAY also builds a ZIP containing the requested stem files.

## Model loading and browser capability

Large models are loaded only when the user invokes the corresponding feature.

The browser workers try accelerated execution first when supported. If an operation cannot run on the current browser/device, it fails locally with a clear error; it does not silently submit the track to Render or another paid inference service.

Model files downloaded from Hugging Face are expected to be cacheable by the browser/runtime after first use.

## Source handling

`src/services/trackAudioSource.ts` defines the shared source behavior.

Priority:

1. `track.file_data` when a real local File/Blob is still available.
2. Current `track.file_url` when fetchable.
3. If `track.file_key` exists, refresh the track through the authenticated AWS app-data `/bootstrap` flow before using an older signed URL.

Lyrics and Stems do not require an HTTPS cloud source when valid local `file_data` is available.

## Generated output persistence

Local processing succeeds independently of AWS output persistence.

When the AWS app-data store is configured, `browserAudioTools.ts` uploads finished files through the existing authenticated presigned-upload flow using these private categories:

| Category | Prefix | Allowed type | Limit |
| --- | --- | --- | ---: |
| `audio-tools-audio` | `generated/audio` | `audio/*` | 1 GiB/file |
| `audio-tools-text` | `generated/text` | `text/*` | 5 MiB/file |
| `audio-tools-bundle` | `generated/bundle` | `application/zip` | 2 GiB/file |

If cloud persistence fails after local processing succeeds, EZ-WAY keeps the browser object URLs so the user can still download the completed files and returns a warning rather than discarding the result.

AWS access keys are never exposed to browser code.

## Production UI contract

The production consumers are:

- `src/components/TrackOptionsMenu.tsx`
- `src/components/AudioAnalyzerStudio.tsx`

They call `runLocalAudioTool(...)` for Lyrics/Stems.

They must not call `runAudioToolsJob(...)`, `POST /jobs`, or depend on `VITE_AUDIO_TOOLS_URL` for the live Lyrics/Stems path.

`AudioToolJobResult` compatibility is preserved so existing result/download UI can continue using:

```ts
{
  status: 'completed',
  action: 'lyrics' | 'stems',
  lyrics?: string,
  files?: Record<string, string>,
  bundle_url?: string,
  warning?: string,
}
```

## Legacy remote Audio Tools

The repository still contains:

```text
aws/audio-tools/
render_audio_tools/
src/services/audioTools.ts
```

These are retained as rollback/diagnostic infrastructure. They are not the production browser execution path for Analyze, Lyrics, or Stems.

Do not delete the legacy infrastructure as part of browser-runtime changes unless a separate cleanup change has an explicit rollback decision.

## Frontend environment

Active application-data configuration may include:

```env
VITE_EZWAY_API_URL=...
```

An explicit separate Music Intelligence profile API may use:

```env
VITE_MUSIC_INTELLIGENCE_API_URL=...
```

`VITE_AUDIO_TOOLS_URL` is legacy rollback configuration and is not required for the browser-local Analyze/Lyrics/Stems path.

## Security and privacy

- Audio inference remains in the browser.
- Hugging Face serves model assets; user audio is not uploaded to the model host for inference.
- AWS stores the original source already used by EZ-WAY and only the generated outputs explicitly persisted by the app.
- No Gemini/Modal/Render inference credential is required for these browser Audio Tools operations.
- Private generated outputs are returned through signed AWS URLs when cloud persistence succeeds.

## Licensing and provenance

EZ-WAY intentionally does not ship the HTDemucs browser weights previously evaluated because that browser port restricts those weights to personal/research use.

The production stem worker points to `Best-Practice/spleeter-4stems-onnx` fp16 model files. The upstream model card/repository documents Apache-2.0 conversion artifacts and the Deezer Spleeter model-weight provenance/licensing discussion. See `THIRD_PARTY_NOTICES.md` before changing, mirroring, or redistributing those weights.

## Verification

The GitHub Actions verification workflow covers:

- browser Audio Tools facade contracts;
- lyrics formatting;
- worker-client protocols;
- stem DSP helpers;
- WAV encoding;
- AWS generated-output validation;
- UI routing away from remote jobs;
- existing Music Intelligence and application regressions;
- retained AWS/Render regression tests;
- Python/Node syntax checks;
- CloudFormation lint;
- TypeScript;
- production build.

A production deployment is not considered verified merely because CI passes. The final gate is a successful Amplify deploy plus real-browser validation of Lyrics/Stems downloads and network behavior.
