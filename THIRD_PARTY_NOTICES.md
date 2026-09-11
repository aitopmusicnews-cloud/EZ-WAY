# Third-Party Notices — Browser Audio Models

This file records the third-party model/runtime provenance used by EZ-WAY's browser-local Audio Tools. It is not a substitute for the upstream license texts.

## Whisper Tiny / Transformers.js

EZ-WAY Synced Lyrics uses:

- `@huggingface/transformers@4.2.0`
- model: `onnx-community/whisper-tiny`
- original Whisper project/model family: OpenAI Whisper

The model/runtime is loaded from Hugging Face only when Synced Lyrics is invoked. Audio inference runs in the user's browser; the user's track is not submitted to a hosted inference API by this feature.

Before changing the model ID or mirroring model files, review the license metadata and notices published with the selected Hugging Face model and its upstream Whisper source.

## HTDemucs 4-stem ONNX

EZ-WAY Stem Separation and the vocal-isolation stage of Synced Lyrics use:

- Hugging Face model: `StemSplitio/htdemucs-onnx`
- artifact: `htdemucs_fp16weights.onnx`
- original source-separation project/model family: Meta HTDemucs / Demucs v4
- browser runtime: ONNX Runtime Web

The selected Hugging Face model card identifies the repository and its HTDemucs provenance as MIT-licensed and documents a single-file four-stem output in this order: drums, bass, other, vocals. The original `facebookresearch/demucs` code repository is also published under the MIT license.

EZ-WAY fetches the model at runtime from Hugging Face when Synced Lyrics or Stem Separation is invoked. The approximately 166 MB model binary is not committed to this Git repository. Separation inference runs in the user's browser. Long audio is processed as overlapping 7.8-second, 44.1 kHz stereo segments.

The current application is not being distributed as a commercial hosted inference product. If the distribution or commercial status changes, re-review the selected model artifact's then-current model card, upstream model-weight provenance, and any applicable third-party terms before release.

## Local lyrics pipeline

Synced Lyrics first runs the same HTDemucs model locally and selects the isolated vocal stem. The vocal stem is downmixed/resampled to 16 kHz and then transcribed locally with Whisper in bounded chunks. This path does not silently fall back to Render, AWS Audio Tools compute, or another hosted inference provider.

## Runtime libraries

The browser audio workers use:

- `onnxruntime-web@1.29.0`
- `@huggingface/transformers@4.2.0`

The application package lock records the exact dependency graph shipped by the web build.

## Maintainer rule

Do not replace a browser audio model solely because code around it is permissively licensed. Model-weight licensing, training-data restrictions, redistribution terms, and commercial-use conditions must be checked separately before the model is introduced into production.
