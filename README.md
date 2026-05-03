# camx2 (Checkout V2 Branch this one is outdated)

Local AI workflows:

1. **Live camera intelligence** (multi-camera) using **YOLO/RF-DETR exported to ONNX** + a local “harm” verification pass, running **locally** with **WebGPU** (with CPU fallback).
   - Live grid on `/`
   - Consolidated dashboard on `/monitor`
2. **Video intelligence**: upload a video, the server extracts/analyzes frames and builds a cached timeline, then you can ask questions via `/analysis/query`.
   - Upload + pipeline on `/analysis`
   - Legacy chat UI still exists at `/chat`

## What this is

On your machine, you get:

- **Live camera intelligence (`/` + `/monitor`)**:
  - **`/`**: multi-camera grid with bounding boxes (and RF-DETR instance masks when available).
    - Each camera runs detection and (optionally) a local “harm” watch/verification pass.
  - **`/monitor`**: primary camera feed + overlay, intel stream log, and an “active detections” summary panel.
    - When a watch result indicates a verified threat, a modal opens and the event can be viewed in the **Threat Log** under `/settings/threat-log`.
- **Video intelligence (`/analysis` + `/analysis/query`)**:
  - **`/analysis`**: upload a video and run the frame pipeline + cached timeline build.
  - **`/analysis/query`**: ask questions about the uploaded/analyzed footage.
- **Legacy chat UI (`/chat`)**:
  - Functionally similar to the analysis/query workflow, but with the older chat-focused interface (`components/VideoChatExperience.tsx`).
- **Settings (`/settings/*`)**:
  - Manage deployment/camera/alert settings, model configuration, face enrollment, user management, and view the persisted **Threat Log** (`/settings/threat-log`).

## The vibe (my fun take)

> Oi, listen up, you bloody beauty. I’m runnin’ this YOLOv11x/rfdetr-nano model—proper beast—exported to ONNX straight on WebGPU, local as you like, with real-time detection flyin’ across the screen. And get this: the whole thing’s sippin’ barely 1–3 gigs of RAM, no more. Meanwhile, it’s absolutely smokin’ the GPU, peggin’ it at near 100%, but the laptop’s cool as a cucumber—fans ain’t even bothered to spin up. Not a whisper from ’em. Proper efficient, innit? Makes you wonder why the rest of the world bothers with all that cloud bollocks when you can smash it right here on your own machine. Brilliant.

## Requirements

- Node.js (recent)
- **pnpm** (this repo uses `pnpm-lock.yaml`)
- A GPU + drivers that support **WebGPU** on your platform
- For **Analysis/Query** (and legacy `/chat`): an LLM backend compatible with the server config (defaults to **LM Studio** over WebSocket at `ws://127.0.0.1:1234`).

## Environment variables (example)

The repo includes `.example.env`. Use it as a starting point for a local `.env.local`.

```bash
# LM Studio local server WebSocket URL
LMSTUDIO_BASE_URL=ws://127.0.0.1:1234

# Preferred watch model
LMSTUDIO_WATCH_MODEL=lfm-2.5-ucf-1.6b

# Video watch frame analysis model
VIDEO_WATCH_FRAME_MODEL_KEY=lfm-ucf-400m

# Video watch summary/chat model
VIDEO_WATCH_SUMMARY_MODEL_KEY=google/gemma-4-e4b
```

## Getting started

Install deps:

```bash
pnpm install
```

Run dev:

```bash
pnpm dev
```

Open `http://localhost:3000`.

From there:
- `http://localhost:3000/monitor` for the consolidated live dashboard
- `http://localhost:3000/analysis` to upload video and run the analysis pipeline
- `http://localhost:3000/analysis/query` to ask questions about the analyzed footage
- `http://localhost:3000/chat` (optional) for the legacy chat UI
- `http://localhost:3000/settings/threat-log` to review archived verified threats (plus other settings pages)

## How it works (code map)

- **Live camera intelligence (`/` + `/monitor`)**:
  - **UI**:
    - Grid (`/`): `components/DetectView.tsx` -> `components/CameraCard.tsx`
    - Dashboard (`/monitor`): `app/monitor/page.tsx`
  - **Client loops**:
    - Detection: `app/hooks/useWebcamDetect.ts` (screenshots -> `/api/detect`)
    - Harm watch/verification: `app/hooks/useWebcamWatch.ts` (watch -> `/api/watch`)
  - **Detect endpoint**: `app/api/detect/route.ts`
    - Accepts `multipart/form-data` with a `frame` image (and optional `model`: `rfdetr` or `yolo`).
    - Preprocesses the image, runs ONNX inference, then postprocesses detections (and masks when present).
  - **Model session**: `app/api/detect/_lib/model.ts`
    - Loads ONNX models from `public/models/` and caches sessions for `rfdetr` and `yolo`.
    - Creates an ONNX Runtime session with execution providers: `["webgpu", "cpu"]` (WebGPU first, CPU fallback).
  - **Watch endpoint**: `app/api/watch/route.ts`
    - Performs the “harm” verification pass used by the live watch flow.
  - **Overlay rendering**: `components/OverlayCanvas`

- **Video intelligence (`/analysis` + `/analysis/query`)**:
  - **UI**:
    - Upload + pipeline: `app/analysis/page.tsx`
    - Query chat: `app/analysis/query/page.tsx`
  - **Client API**: `app/lib/video-watch-client.ts`
    - `POST /api/video-watch` to upload and create/resume a job
    - `GET /api/video-watch?jobId=...` to poll job status
    - `POST /api/video-watch/chat` to ask questions
  - **Server routes**:
    - `app/api/video-watch/route.ts` (upload/status/cache management)
    - `app/api/video-watch/chat/route.ts` (answer questions)

- **Legacy chat UI (`/chat`)**:
  - **UI**: `components/VideoChatExperience.tsx`
  - Uses the same `/api/video-watch/*` backend routes as the analysis/query workflow.

- **Settings (`/settings/*`)**:
  - UI pages live under `app/settings/*`
  - Threat Log viewer uses persisted records from `app/lib/threat-log-store.ts` (and supports CSV export + status updates).

## Models

Models live in:

- `public/models/yolo11x.onnx`
- `public/models/yolo11n.onnx`
- `public/models/rf-detr-seg-nano.onnx`

If your RF-DETR ONNX export includes a mask tensor (commonly `masks`), the app renders instance masks automatically. Detection-only RF-DETR exports still work (boxes only).

To switch the model, the client sends `model` in the request body; the server selects the right ONNX session per request.

For **Analysis/Query** (and legacy `/chat`), model keys are configured on the server via environment variables (for example `LMSTUDIO_BASE_URL`, `VIDEO_WATCH_FRAME_MODEL_KEY`, `VIDEO_WATCH_SUMMARY_MODEL_KEY`).

## Performance notes

Actual performance depends on your GPU, drivers, and model size.

- Expect **high GPU utilization** (that’s the point).
- RAM usage can stay relatively modest because inference is local and avoids heavyweight cloud/streaming overhead.

## Troubleshooting

- **WebGPU provider not available**: you’ll fall back to CPU. Check your OS/driver support and ONNX Runtime WebGPU availability for your platform.
- **Camera permissions**: allow camera access in your browser.
- **Inference errors**: check server logs for the requestId-prefixed messages.
- **Analysis/Query can’t connect to the LLM**: verify `LMSTUDIO_BASE_URL` (defaults to `ws://127.0.0.1:1234`) and that the expected model is loaded in your LLM backend.

## Scripts

- `pnpm dev` — start dev server
- `pnpm build` — production build
- `pnpm start` — start production server
- `pnpm lint` — run Biome checks
- `pnpm format` — format with Biome
