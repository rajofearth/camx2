# camx2

Two local experiences:

1. **Live webcam object detection** (multi-camera) using **YOLO/RF-DETR exported to ONNX**, running **locally** with **WebGPU** (with CPU fallback).
2. **Chat with recorded footage**: upload a video, the server extracts/analyzes frames, then you can ask questions about what’s happening.

## What this is

On your machine, you get:

- **Home (`/`)**: multi-camera webcam detection.
  - **Client**: captures frames and draws boxes (and RF-DETR instance masks when available).
  - **Server (Next.js route)**: preprocesses the frame, runs ONNX inference with **WebGPU** via `onnxruntime-node`, then postprocesses detections.
- **Chat (`/chat`)**: video upload + timeline-based Q&A.
  - **Client**: uploads a video file and streams a job status.
  - **Server (Next.js route)**: extracts frames, builds a cached “timeline”, and answers your questions.

## The vibe (my fun take)

> Oi, listen up, you bloody beauty. I’m runnin’ this YOLOv11x/rfdetr-nano model—proper beast—exported to ONNX straight on WebGPU, local as you like, with real-time detection flyin’ across the screen. And get this: the whole thing’s sippin’ barely 1–3 gigs of RAM, no more. Meanwhile, it’s absolutely smokin’ the GPU, peggin’ it at near 100%, but the laptop’s cool as a cucumber—fans ain’t even bothered to spin up. Not a whisper from ’em. Proper efficient, innit? Makes you wonder why the rest of the world bothers with all that cloud bollocks when you can smash it right here on your own machine. Brilliant.

## Requirements

- Node.js (recent)
- **pnpm** (this repo uses `pnpm-lock.yaml`)
- A GPU + drivers that support **WebGPU** on your platform
- For `/chat`: an LLM backend compatible with the server config (defaults to **LM Studio** over WebSocket at `ws://127.0.0.1:1234`).

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

Then also visit `http://localhost:3000/chat` for the video chat experience.

## How it works (code map)

- **Live detection UI (home `/`)**:
  - **UI**: `components/DetectView.tsx` + `components/CameraCard.tsx`
    - `DetectView` lays out multiple camera panels.
    - `CameraCard` uses `react-webcam` (or an optional local video file) and starts detection via `useWebcamDetect`.
    - Renders detections on `OverlayCanvas` (boxes, and RF-DETR instance masks when available).
  - **Capture loop**: `app/hooks/useWebcamDetect.ts`
    - Grabs screenshots and calls the detect endpoint at a capped FPS.
  - **Detect endpoint**: `app/api/detect/route.ts`
    - Accepts `multipart/form-data` with a `frame` image (and optional `model`: `rfdetr` or `yolo`).
    - Preprocesses the image, runs ONNX inference, then postprocesses detections (and masks when present).
  - **Model session**: `app/api/detect/_lib/model.ts`
    - Loads ONNX models from `public/models/` and caches sessions for `rfdetr` and `yolo`.
    - Creates an ONNX Runtime session with execution providers: `["webgpu", "cpu"]` (WebGPU first, CPU fallback).

- **Video chat UI (`/chat`)**:
  - **UI**: `components/VideoChatExperience.tsx`
  - **Client API**: `app/lib/video-watch-client.ts`
    - `POST /api/video-watch` to upload and create/resume a job
    - `GET /api/video-watch?jobId=...` to poll job status
    - `POST /api/video-watch/chat` to ask questions
  - **Server routes**:
    - `app/api/video-watch/route.ts` (upload/status/cache management)
    - `app/api/video-watch/chat/route.ts` (answer questions)

## Models

Models live in:

- `public/models/yolo11x.onnx`
- `public/models/yolo11n.onnx`
- `public/models/rf-detr-seg-nano.onnx`

If your RF-DETR ONNX export includes a mask tensor (commonly `masks`), the app renders instance masks automatically. Detection-only RF-DETR exports still work (boxes only).

To switch the model, the client sends `model` in the request body; the server selects the right ONNX session per request.

For `/chat`, model keys are configured on the server via environment variables (for example `LMSTUDIO_BASE_URL`, `VIDEO_WATCH_FRAME_MODEL_KEY`, `VIDEO_WATCH_SUMMARY_MODEL_KEY`).

## Performance notes

Actual performance depends on your GPU, drivers, and model size.

- Expect **high GPU utilization** (that’s the point).
- RAM usage can stay relatively modest because inference is local and avoids heavyweight cloud/streaming overhead.

## Troubleshooting

- **WebGPU provider not available**: you’ll fall back to CPU. Check your OS/driver support and ONNX Runtime WebGPU availability for your platform.
- **Camera permissions**: allow camera access in your browser.
- **Inference errors**: check server logs for the requestId-prefixed messages.
- **Video chat can’t connect to the LLM**: verify `LMSTUDIO_BASE_URL` (defaults to `ws://127.0.0.1:1234`) and that the expected model is loaded in your LLM backend.

## Scripts

- `pnpm dev` — start dev server
- `pnpm build` — production build
- `pnpm start` — start production server
- `pnpm lint` — run Biome checks
- `pnpm format` — format with Biome
