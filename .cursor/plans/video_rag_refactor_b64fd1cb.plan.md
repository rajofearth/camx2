---
name: Video Watch Rebuild Phase 1
overview: Implement Phase 1 of the rebuilt `video-watch` plan by keeping the current single-file pipeline, adding structured state-aware frame analysis, and validating continuity before any chat or RAG changes. The authoritative long-term plan lives in `docs/video-watch-rebuild-plan.md`.
todos:
  - id: define-phase1-contract
    content: Define the exact structured JSON contract for frame analysis output and keep it small enough to live in the current pipeline.
    status: pending
  - id: add-recent-context
    content: Update frame prompting so each frame sees the previous frame analysis plus a short rolling recent-context summary.
    status: pending
  - id: implement-structured-storage
    content: Persist the new structured per-frame output in the existing cache layout without introducing a broad module refactor.
    status: pending
  - id: keep-chat-unchanged
    content: Preserve the current chat path for Phase 1 and avoid any RAG or retrieval work until analysis outputs are stable.
    status: pending
  - id: validate-short-clip
    content: Test the Phase 1 output on a short known clip and manually verify temporal continuity across consecutive frames.
    status: pending
isProject: false
---

# Video Watch Rebuild Phase 1

## Authoritative Reference

- The source of truth for the full rebuild is
[docs/video-watch-rebuild-plan.md](../../docs/video-watch-rebuild-plan.md).
- This Cursor plan only covers Phase 1 from that document.

## Phase 1 Objective

- Keep the current single-file pipeline intact.
- Upgrade frame analysis from plain caption-only output to a small structured
JSON result.
- Make each frame aware of the immediately previous frame plus a short rolling
scene summary.
- Do not change the chat or retrieval flow yet.

## Files In Scope

- [app/api/video-watch/_lib/service.ts](../../app/api/video-watch/_lib/service.ts)
- Optionally one small helper file only if prompt or parsing logic becomes too
large to keep readable in the service file.

## Planned Output Shape

- `summaryText`
- `visibleObjects`
- `events`
- `sceneContext`
- `carryForwardNotes`

The exact field schema should be finalized before implementation starts and kept
small enough that the LM prompt remains reliable.

## Constraints

- Preserve the existing API surface and current cache behavior.
- Do not introduce Vectra or any vector index work in this phase.
- Do not introduce persistent object IDs in this phase.
- Do not introduce a broad multi-service refactor in this phase.

## Validation

- Test on a short known clip. (tell user to upload a new video through the page)
- Manually inspect 10 to 20 consecutive frames.
- Confirm that adjacent frames express continuity better than the current
stateless captions.
- Confirm that stale events are not blindly repeated into unrelated frames.
- Confirm that JSON output is stable and parseable.

## Exit Criteria

- Structured frame output is implemented and persisted successfully.
- The analyzer uses recent context without a large architecture rewrite.
- Phase 1 improves temporal continuity enough to justify moving to Phase 2 from
the master plan.

