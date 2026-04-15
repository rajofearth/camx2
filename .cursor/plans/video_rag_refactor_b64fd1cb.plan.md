---
name: Video RAG Refactor
overview: "Refactor the current monolithic `video-watch` pipeline into a modular analysis/RAG architecture while preserving the public API surface. The plan matches the codebase reality: `pnpm` is the package manager, the current cache lives under `tmp/video-watch-cache`, chat retrieval is keyword-based today, and there is no existing embedding or IndexedDB implementation to reuse."
todos:
  - id: audit-contracts
    content: Preserve the current route and client contracts while identifying all fields/types that can be extended safely.
    status: completed
  - id: install-vectra
    content: Add `vectra` with `pnpm` and introduce a small server-side embedding adapter since no reusable embedding code exists today.
    status: completed
  - id: create-analysis-domain
    content: Create the new `lib/video-analysis` domain types and services for persistent state, frame analysis, and repository persistence.
    status: completed
  - id: migrate-storage-root
    content: Replace `tmp/video-watch-cache` with a versioned `data/` storage layout and fresh-start invalidation behavior.
    status: completed
  - id: refactor-analysis-loop
    content: Refactor the main analysis handler to use ordered stateful frame processing, static-scene skip, and state trimming.
    status: completed
  - id: add-vectra-rag
    content: Create the Vectra-backed vector store and query-time chat context builder for semantic retrieval.
    status: completed
  - id: keep-routes-stable
    content: Retain the existing API surface by turning the current monolithic service into a thin façade over the new modules.
    status: completed
  - id: verify-performance
    content: Run an end-to-end validation pass on analysis continuity, timestamp accuracy, disk persistence, and chat latency.
    status: completed
isProject: false
---

# Video Analysis And RAG Refactor

## Current Baseline
- The entire uploaded-video pipeline currently lives in [app/api/video-watch/_lib/service.ts](app/api/video-watch/_lib/service.ts): frame extraction, square PNG preprocessing, per-frame LM Studio calls, timeline synthesis, summary generation, chat prompt building, and cache persistence.
- Public route contracts are already stable and should remain stable during the refactor: [app/api/video-watch/route.ts](app/api/video-watch/route.ts), [app/api/video-watch/chat/route.ts](app/api/video-watch/chat/route.ts), [app/lib/video-watch-types.ts](app/lib/video-watch-types.ts), and [app/lib/video-watch-client.ts](app/lib/video-watch-client.ts).
- The codebase uses `pnpm` (`pnpm-lock.yaml` exists).
- The current cache root is hardcoded to `tmp/video-watch-cache`, so moving to `data/` requires a versioned storage migration rather than just adding new files.
- There is no existing embedding function or IndexedDB layer in the repo today, so the refactor should add a small local embedding adapter on the server side and explicitly defer IndexedDB.

## Target Architecture
- Keep this as a modular monolith with a one-way dependency flow: routes -> orchestration service -> domain logic -> filesystem / LM Studio / Vectra adapters.
- Create a typed analysis domain under [lib/video-analysis/types.ts](lib/video-analysis/types.ts) for `TrackedObject`, `FrameAnalysis`, `VideoState`, `GlobalEntityRegistry`, `CompactTimeline`, and `EmbeddingRecord`.
- Move persistent state handling into [lib/video-analysis/video-state.service.ts](lib/video-analysis/video-state.service.ts) as a per-job coordinator: initialize, snapshot, update from frame, trim historical state, and expose a compact prompt-safe state view.
- Move LM Studio frame prompting/parsing into [lib/video-analysis/frame-analyzer.service.ts](lib/video-analysis/frame-analyzer.service.ts), with strict JSON response parsing and clear failure handling.
- Move artifact persistence and post-processing into [lib/video-analysis/analysis-repository.ts](lib/video-analysis/analysis-repository.ts): incremental frame analysis saves, final `GlobalEntityRegistry`, `CompactTimeline`, summary files, and embedding/index handoff.
- Add a thin Vectra wrapper in [lib/rag/vector-store.service.ts](lib/rag/vector-store.service.ts) using `LocalIndex`, one index per `./data/video-watch/v1/vectra/<videoId>`, with `isIndexCreated()`, `createIndex()`, `insertItem()`, and `queryItems()`.
- Add [lib/video-analysis/chat-context-builder.ts](lib/video-analysis/chat-context-builder.ts) to assemble minimal query-time evidence from embeddings plus global registry and compact timeline summaries.

## Route And Service Refactor
- Keep the route files thin and preserve their request/response contracts.
- Keep the existing exported service entrypoints stable in [app/api/video-watch/_lib/service.ts](app/api/video-watch/_lib/service.ts): `createOrResumeVideoJob`, `getVideoJobStatus`, `clearVideoJobCache`, and `answerQuestionAboutVideo`. Refactor this file into a façade that delegates to the new modules.
- Refactor the main analysis flow from concurrent isolated frame workers into an ordered stateful loop for frame reasoning continuity. Each frame should receive the current trimmed `VideoState`, produce structured `FrameAnalysis`, update shared state, and persist the result incrementally.
- Preserve the existing square PNG preprocessing path and current upload/status lifecycle, but move artifact storage from `tmp/` into `./data/` with a fresh versioned start.
- Refactor chat so the current keyword-only evidence builder is replaced by: embed question -> query Vectra -> filter/high-score results -> convert to concise evidence text -> prepend global entity/compact timeline context -> send to LM Studio chat model.

## Storage Layout And Migration
- Introduce a fresh-start root under `./data/video-watch/v1/` for analysis artifacts and `./data/video-watch/v1/vectra/<videoId>/` for vector indexes.
- Do not preserve compatibility with old `tmp/video-watch-cache`; bump the processing/storage version and ignore or delete the old root entirely.
- Avoid persisting absolute frame/image paths in new manifests where possible; store relative paths under the analysis directory so Docker volume mounts stay portable.
- Use direct reference files for fast lookup, especially `by-job-id/<jobId>.json` and `by-fingerprint/<fingerprint>.json`, instead of directory scans.
- Keep incremental writes for long jobs: state file, frame analysis log, compact timeline, registry, summary, and index build marker.

## Performance Guardrails
- Add static-scene skip before expensive model calls by comparing the current frame against the last analyzed frame and recording skipped frames in the log.
- Trim `VideoState` every 60 frames and keep only active/recent entities plus unresolved anomalies in prompt state.
- Treat LM frame analysis as sequential by default so continuity stays stable; bound concurrency only for non-inference work such as extraction and writes.
- Build embeddings once after final analysis completes, not during frame processing.
- Keep chat context intentionally small: global registry summary, compact timeline summary, and only top semantically relevant frame records above the similarity threshold.
- Cache retrieval results by question hash when possible, but keep prompt budgeting deterministic and conservative.

## Key Code Seams To Replace
- Current frame analysis is isolated per image in [app/api/video-watch/_lib/service.ts](app/api/video-watch/_lib/service.ts), where `analyzeFrame()` only asks for a one-frame description and returns `{ description }`. That is the main seam to replace with typed structured analysis plus `VideoState`.
- Current chat evidence assembly in [app/api/video-watch/_lib/service.ts](app/api/video-watch/_lib/service.ts) uses `buildTimelineExcerpt()` and token-overlap scoring. That should be replaced, not layered on top, to avoid duplicate retrieval logic.
- Current shared types in [app/lib/video-watch-types.ts](app/lib/video-watch-types.ts) should be extended carefully rather than broken, so the UI in [app/components/VideoChatExperience.tsx](app/components/VideoChatExperience.tsx) keeps working while richer analysis metadata is added behind the scenes.

## Dependencies And Validation
- Install `vectra` with `pnpm`.
- Add strict runtime validation around LM JSON parsing, repository reads/writes, and query-time RAG inputs so malformed frame outputs do not poison the entity registry or vector index.
- Preserve existing error-response behavior in the route handlers while improving structured logging around LM failures, parse failures, and index build failures.
- Verify success with one end-to-end sample video: fresh analysis, resumed status read from disk, generated registry/compact timeline/index artifacts under `data/`, and chat answers that reference exact timestamps and stable entity IDs.

## Rollout Notes
- Phase 1 should land the new types, storage root, and route-façade refactor without changing the client API.
- Phase 2 should land persistent `VideoState` and structured `FrameAnalysis` output with sequential frame processing and trimming.
- Phase 3 should add Vectra indexing and query-time RAG using the compact timeline plus registry summaries.
- IndexedDB should be left out of this refactor and tracked as a follow-up after the server-side state/RAG architecture is stable.