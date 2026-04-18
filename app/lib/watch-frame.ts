/**
 * Square crop + WebP compression for size, then PNG for the watch API payload
 * (vision backends typically ingest PNG reliably; WebP stays the cheap intermediate).
 */

import { makeSquareAndCompress } from "@/app/lib/image-utils";

export const WATCH_FRAME_MAX_BYTES = 200 * 1024;

/** Descending quality / size — first fit under WATCH_FRAME_MAX_BYTES wins. */
export const WATCH_FRAME_ATTEMPTS: readonly {
  quality: number;
  targetSize: number;
}[] = [
  { quality: 0.52, targetSize: 320 },
  { quality: 0.45, targetSize: 256 },
  { quality: 0.38, targetSize: 224 },
  { quality: 0.32, targetSize: 192 },
  { quality: 0.26, targetSize: 160 },
  { quality: 0.2, targetSize: 128 },
];

const WATCH_OUTPUT = "webp" as const;

/** Re-encode raster (WebP/JPEG) to PNG for upstream LM / vision APIs. */
async function encodeBlobAsPng(blob: Blob): Promise<Blob> {
  const mime = (blob.type || "").toLowerCase();
  if (mime.includes("png")) return blob;

  const bitmap = await createImageBitmap(blob);
  try {
    const w = bitmap.width;
    const h = bitmap.height;

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2d context");
      ctx.drawImage(bitmap, 0, 0);
      const out = await canvas.convertToBlob({ type: "image/png" });
      if (!out) throw new Error("PNG encode failed");
      return out;
    }

    if (typeof document === "undefined") {
      throw new Error("PNG encode requires a browser environment");
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2d context");
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
        "image/png",
      );
    });
  } finally {
    bitmap.close?.();
  }
}

function isAcceptableRaster(blob: Blob, originalSize: number): boolean {
  const mime = (blob.type || "").toLowerCase();
  const isRaster =
    mime.includes("webp") ||
    mime.includes("png") ||
    mime.includes("jpeg") ||
    mime.includes("jpg");
  if (!isRaster) return false;
  return blob.size <= WATCH_FRAME_MAX_BYTES || blob.size < originalSize;
}

type WorkerResult = { blob: Blob; timings?: unknown };

function runWorkerOnce(
  worker: Worker,
  imageDataUrl: string,
  opts: { quality: number; targetSize: number },
  messageId: string,
): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      clearTimeout(timer);
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as {
        id?: string;
        success?: boolean;
        arrayBuffer?: ArrayBuffer;
        mimeType?: string;
        error?: string;
        timings?: unknown;
      };
      if (!d || d.id !== messageId) return;
      if (d.success && d.arrayBuffer) {
        finish(() =>
          resolve({
            blob: new Blob([d.arrayBuffer], {
              type: d.mimeType || "image/webp",
            }),
            timings: d.timings,
          }),
        );
      } else {
        finish(() => reject(new Error(d.error || "Worker processing failed")));
      }
    };
    const onError = (err: ErrorEvent) => {
      finish(() => reject(err.error || new Error("Worker error")));
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    const timer = setTimeout(() => {
      finish(() => reject(new Error("Image worker timeout")));
    }, 3000);

    worker.postMessage({
      id: messageId,
      imageDataUrl,
      options: {
        quality: opts.quality,
        mode: "crop",
        targetSize: opts.targetSize,
        output: WATCH_OUTPUT,
      },
    });
  });
}

/**
 * Produces a square **PNG** blob for `/api/watch` (compress via WebP first, then transcode).
 * Reuses `worker` when provided.
 */
export async function buildWatchFrameBlob(
  imageDataUrl: string,
  originalBlob: Blob,
  worker: Worker | null,
): Promise<{ blob: Blob; timings?: unknown }> {
  let lastTimings: unknown;

  for (const attempt of WATCH_FRAME_ATTEMPTS) {
    try {
      let blob: Blob | null = null;
      if (worker) {
        try {
          const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const out = await runWorkerOnce(worker, imageDataUrl, attempt, id);
          blob = out.blob;
          lastTimings = out.timings;
        } catch {
          blob = await makeSquareAndCompress(originalBlob, {
            quality: attempt.quality,
            mode: "crop",
            targetSize: attempt.targetSize,
            output: WATCH_OUTPUT,
          });
        }
      } else {
        blob = await makeSquareAndCompress(originalBlob, {
          quality: attempt.quality,
          mode: "crop",
          targetSize: attempt.targetSize,
          output: WATCH_OUTPUT,
        });
      }
      if (blob && isAcceptableRaster(blob, originalBlob.size)) {
        const png = await encodeBlobAsPng(blob);
        return { blob: png, timings: lastTimings };
      }
    } catch {
      /* try next attempt */
    }
  }

  const fallback = await makeSquareAndCompress(originalBlob, {
    quality: 0.18,
    targetSize: 128,
    mode: "crop",
    output: WATCH_OUTPUT,
  }).catch(() => originalBlob);

  const png = await encodeBlobAsPng(fallback);
  return { blob: png };
}
