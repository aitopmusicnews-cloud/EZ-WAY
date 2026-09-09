# Third-Party Notices — Browser Audio Models

This file records the third-party model/runtime provenance used by EZ-WAY's browser-local Audio Tools. It is not a substitute for the upstream license texts.

## Whisper Tiny / Transformers.js

EZ-WAY Synced Lyrics uses:

- `@huggingface/transformers@4.2.0`
- model: `onnx-community/whisper-tiny`
- original Whisper project/model family: OpenAI Whisper

The model/runtime is loaded from Hugging Face only when Synced Lyrics is invoked. Audio inference runs in the user's browser; the user's track is not submitted to a hosted inference API by this feature.

Before changing the model ID or mirroring model files, review the license metadata and notices published with the selected Hugging Face model and its upstream Whisper source.

## Spleeter 4-stem ONNX

EZ-WAY Stem Separation uses the fp16 files from:

- Hugging Face model: `Best-Practice/spleeter-4stems-onnx`
- conversion source: `madewith-bestpractice/spleeter-4stems-onnx`
- original source-separation project/model family: Deezer Spleeter
- conversion lineage also derives from `k2-fsa/sherpa-onnx`

The upstream conversion repository/model card identifies the conversion artifacts as Apache-2.0 and documents the model-weight provenance as Deezer Spleeter weights. It also records the licensing ambiguity around wording in the Spleeter README versus the Spleeter JOSS paper. That upstream notice must be reviewed before mirroring, redistributing, or changing the model files.

EZ-WAY currently fetches these self-contained model files at runtime:

```text
vocals.fp16.onnx
drums.fp16.onnx
bass.fp16.onnx
other.fp16.onnx
```

from the `Best-Practice/spleeter-4stems-onnx` Hugging Face repository.

EZ-WAY does not copy those ~20 MB-per-stem model binaries into this Git repository.

## Why HTDemucs browser weights are not used

A browser HTDemucs port was evaluated, but its included HTDemucs weights were marked for personal/research use. EZ-WAY therefore does not bundle or use those weights in the production commercial browser path.

## Runtime libraries

The stem worker also uses:

- `onnxruntime-web@1.29.0`
- `fourier-transform@2.4.1`

The application package lock records the exact dependency graph shipped by the web build.

## Maintainer rule

Do not replace a browser audio model solely because code around it is permissively licensed. Model-weight licensing, training-data restrictions, redistribution terms, and commercial-use conditions must be checked separately before the model is introduced into production.
