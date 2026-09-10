# SDD ledger — plan: docs/superpowers/plans/2026-09-09-album-cover-creative-director-core.md

Base branch: `feature/album-cover-major-label-director`
Spec: `docs/superpowers/specs/2026-09-09-album-cover-major-label-creative-director-design.md`

## Pre-flight dependency scan

| Tasks | Shared interface/file | Finding / ruling |
|---|---|---|
| 1 → 2 | `CreativeDirector`, `SongThesis` | Clean: Task 2 consumes the provider-neutral contract from Task 1. |
| 1 → 3 | `ConceptDraft`, `ConceptCritique`, Cloudflare adapter | **Ruling:** add `suggested_scores: dict[str, float]` to `ConceptCritique`, and let `score_concept(..., suggested_scores=None)` clamp those values. The plan text requires Gemma-proposed rubric scores but omitted them from the type/signature. |
| 2 → 3 | stored Song Thesis / creative context | Clean: concept competition consumes Song Intelligence outputs. |
| 3 → 4 | selected concepts / `major_label_service.py` | Clean: Task 4 only changes final prompt construction after top-three selection. |
| 2 → 5 | `song_intelligence_json`, `song_thesis_json` | Clean: Task 5 persists the report created in Task 2. |
| 3 → 5 | expanded `ConceptDraft` metadata | Clean: Task 5 persists fields produced in Task 3. |
| 1/2/3/4/5 → 6 | `main.py`, `service.py`, `major_label_service.py` | Clean: Task 6 is the production wiring/integration gate after the lower-level units exist. |
| 1–6 → 7 | verification only | Clean: Task 7 is read/test-only unless a concrete defect is exposed. |

## Task status

- Task 1: pending
- Task 2: pending
- Task 3: pending
- Task 4: pending
- Task 5: pending
- Task 6: pending
- Task 7: pending
