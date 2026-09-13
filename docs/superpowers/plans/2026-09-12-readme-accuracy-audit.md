# README Accuracy Audit Plan

**Goal:** Update the root `README.md` so it matches the current EZ-WAY codebase without changing application behavior or rewriting the document's voice.

**Scope:** Documentation only. Preserve the existing README structure and tone where accurate; correct stale facts and add clearly missing current modules/configuration.

## Tasks

- [ ] Compare setup commands and prerequisites with `package.json`, CI, Vite, and the Album Cover backend.
- [ ] Reconcile browser/public environment variables with actual `import.meta.env` consumers and flag legacy/optional values.
- [ ] Update current architecture and feature behavior: Cognito/app-data, local Music Intelligence, HTDemucs stems, Demucs-first chunked Whisper lyrics, Album Cover Studio, YouTube browser OAuth/upload, and retained legacy services.
- [ ] Correct directory/module references and model/dependency/version notes.
- [ ] Check README-linked repository files and externally named production endpoints; flag documentation that is itself stale rather than repeating it.
- [ ] Review the README diff for factual accuracy and style preservation.
- [ ] Run the existing TypeScript/build verification and README-specific consistency checks before merge.
