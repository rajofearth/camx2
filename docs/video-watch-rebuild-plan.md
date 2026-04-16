# Video Watch Rebuild Plan

This document is the authoritative rebuild plan for the `video-watch` feature.
It supersedes the earlier large refactor plan that introduced the modular
`lib/video-analysis` and Vectra-based architecture before the behavior was
validated.

## Product Direction

- We want frame analysis to stay simple and grounded in the current frame.
- We also want each frame to understand recent context so it can describe
  continuity instead of behaving like a stateless snapshot.
- We prefer fewer files and smaller changes at the start.
- We still want to grow into a stronger architecture, but only after the
  behavior is proven.
- We want RAG for chat, but only after analysis output is stable.

## Key Design Decisions

- Tracking approach for v1:
  no hard persistent IDs yet; use continuity-aware grouped descriptions instead.
- Architecture approach:
  start with the existing single-file `video-watch` pipeline and add only the
  minimum structure needed.
- Retrieval approach:
  use RAG later, after we trust the saved analysis artifacts.
- Delivery approach:
  build in phases, test after each phase, then continue.

## Non-Goals For The First Pass

- No immediate full service split.
- No immediate object identity engine.
- No immediate broad refactor for cleanliness alone.
- No chat retrieval changes until the analysis output format is working.

## Phased Plan

### Phase 1: Stateful Frame Analysis In The Existing Pipeline

Goal:
make frame analysis aware of recent context without a large refactor.

What we build:

- Keep the current single-file pipeline in
  [app/api/video-watch/_lib/service.ts](/p:/Projects/camx2/app/api/video-watch/_lib/service.ts).
- Replace the plain caption-only frame output with structured JSON.
- Each frame analysis should include:
  - `summaryText`
  - `visibleObjects`
  - `events`
  - `sceneContext`
  - `carryForwardNotes`
- When processing frame N, pass:
  - the current frame image
  - the previous frame analysis
  - a short rolling summary of recent frames
- Do not add persistent object IDs in this phase.
- Do not change chat or retrieval in this phase.

How we test:

- Run on a short known clip.
- Inspect 10 to 20 consecutive frame outputs manually.
- Verify that adjacent frames show continuity.
- Verify that the analyzer does not forget the previous frame immediately.
- Verify that it does not restate unrelated stale events every second.

Exit criteria:

- Frame outputs are structured and parse reliably.
- Consecutive frame descriptions feel temporally continuous.
- Processing remains acceptable for local testing.

Do not do:

- No vector DB.
- No retrieval changes.
- No major file split unless prompt/parsing logic becomes unmanageable.

### Phase 2: Short-Window Temporal Coherence

Goal:
improve continuity across several frames, not just the immediate previous frame.

What we build:

- Add a trimmed rolling context window.
- Teach the model to express whether something is:
  - continuing
  - newly appearing
  - no longer visible
- Use continuity language like:
  - same subject as prior frame
  - new person appears
  - previously seen vehicle remains
- Still avoid hard persistent IDs.

How we test:

- Use clips with a person remaining in frame.
- Use clips with a second subject entering later.
- Use clips where an action spans several seconds.

Exit criteria:

- Fewer contradictory frame outputs.
- Better continuity without identity overclaiming.

### Phase 3: Stabilize Saved Analysis Artifacts

Goal:
produce reliable saved artifacts that chat can use later.

What we build:

- Save richer per-frame structured analysis.
- Generate one compact timeline after processing.
- Timeline entries should include:
  - timestamp
  - short scene summary
  - visible objects
  - events
  - continuity notes
- Add a grouped summary pass to reduce repeated noise from neighboring frames.

How we test:

- Inspect the saved artifacts from short and medium clips.
- Confirm that artifacts are readable and compact.
- Confirm that repeated frame spam is reduced.

Exit criteria:

- Saved outputs are useful even before chat.
- We can manually answer some questions by reading the timeline.

### Phase 4: Add RAG Over Stable Analysis Output

Goal:
introduce retrieval only after the analysis format is trustworthy.

What we build:

- Embed timeline chunks or grouped frame summaries.
- On chat:
  - embed the query
  - retrieve relevant chunks
  - attach only those chunks with a compact global summary
- Keep prompt size small and predictable.

How we test:

- Ask timestamp questions.
- Ask sequence-change questions.
- Compare answers against the source video.

Exit criteria:

- Chat becomes more accurate than using one large summary alone.
- Prompt size stays controlled.

### Phase 5: Improve Count And Continuity Answers

Goal:
make count-style and continuity-style answers more stable.

What we build:

- Add lightweight grouping metadata to timeline chunks.
- Use labels like:
  - same-person-likely
  - new-entrant
  - subject-still-present
- Make chat answer cautiously when certainty is low.

How we test:

- Ask:
  - how many people were present
  - when did a subject appear
  - did the same vehicle remain throughout

Exit criteria:

- Answers are more stable.
- Uncertainty is expressed honestly.

### Phase 6: Optional Architecture Cleanup

Goal:
refactor only after the behavior is correct.

What we build:

- If the feature is working, split into a few modules such as:
  - frame analysis
  - timeline building
  - retrieval/chat
- If behavior is still unstable, do not refactor yet.

How we test:

- Re-run the same regression clips and questions from earlier phases.

Exit criteria:

- The refactor improves maintainability without changing behavior.

## Immediate Next Step

The next implementation step is Phase 1 only:

1. Define the exact Phase 1 frame JSON schema.
2. Define the prompt contract for current frame plus recent context.
3. Implement it in the existing pipeline.
4. Test on a short clip.
5. Review outputs before touching chat.
