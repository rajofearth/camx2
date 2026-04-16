import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraSourceRef } from "@/app/lib/camera-source";
import { makeSquareAndCompress } from "@/app/lib/image-utils";
import { fetchWatch } from "@/app/lib/watch-client";
import type { WatchOk, WatchResult } from "@/app/lib/watch-types";

export interface UseWebcamWatchResult {
  readonly latest: WatchResult | null;
  readonly lastLatency: number | null;
  readonly lastRequestId: string | null;
  readonly lastMeta: WatchOk["meta"] | null;
  readonly isProcessing: boolean;
  readonly error: string | null;
}

const FRAME_INTERVAL_MS = 3000;

export function useWebcamWatch(
  webcamRef: React.RefObject<CameraSourceRef | null>,
  isActive: boolean,
): UseWebcamWatchResult {
  const [latest, setLatest] = useState<WatchResult | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<WatchOk["meta"] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // Schedule and process a webcam frame if allowed, with backpressure.
  const processFrame = useCallback(async () => {
    if (!isActiveRef.current || !webcamRef.current) return;

    if (abortControllerRef.current) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => { void processFrame(); }, FRAME_INTERVAL_MS);
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => { void processFrame(); }, FRAME_INTERVAL_MS);
      return;
    }

    abortControllerRef.current = new AbortController();
    setIsProcessing(true);
    setError(null);

    try {
      const originalBlob = await fetch(imageSrc).then(r => r.blob());
      let processedBlob: Blob | null = null;
      let workerTimings: unknown = null;

      // Try to process the blob with a worker or in-thread, repeatedly reducing size/quality.
      async function processOnceWithWorker(opts: { quality: number; targetSize: number }): Promise<Blob> {
        return new Promise<Blob>((resolve, reject) => {
          try {
            const worker = new Worker(
              new URL("../workers/imageWorker.ts", import.meta.url),
              { type: "module" }
            );
            const id = String(Math.random()).slice(2);
            const onMessage = (ev: MessageEvent) => {
              const d = ev.data;
              if (!d || (d.id !== undefined && d.id !== id)) return;
              worker.removeEventListener("message", onMessage);
              worker.removeEventListener("error", onError);
              if (d.success) {
                const ab: ArrayBuffer = d.arrayBuffer;
                const mime: string = d.mimeType || "image/webp";
                workerTimings = d.timings ?? null;
                resolve(new Blob([ab], { type: mime }));
              } else {
                reject(new Error(d.error || "Worker processing failed"));
              }
            };
            const onError = (err: ErrorEvent) => {
              worker.removeEventListener("message", onMessage);
              worker.removeEventListener("error", onError);
              reject(err.error || new Error("Worker error"));
            };
            worker.addEventListener("message", onMessage);
            worker.addEventListener("error", onError);
            worker.postMessage({
              id,
              imageDataUrl: imageSrc,
              options: {
                quality: opts.quality,
                mode: "crop",
                targetSize: opts.targetSize,
                output: "png",
              },
            });
            const timeout = setTimeout(() => {
              try {
                worker.removeEventListener("message", onMessage);
                worker.removeEventListener("error", onError);
                worker.terminate();
              } catch {}
              reject(new Error("Image worker timeout"));
            }, 3000);
            const wrap = (fn: any) => (...args: any[]) => { clearTimeout(timeout); return fn(...args); };
            resolve = wrap(resolve);
            reject = wrap(reject);
          } catch (err) {
            reject(err);
          }
        });
      }

      async function processInThread(opts: { quality: number; targetSize: number }) {
        return makeSquareAndCompress(originalBlob, {
          quality: opts.quality,
          mode: "crop",
          output: "png",
          targetSize: opts.targetSize,
        });
      }

      const MAX_SIZE = 100 * 1024;
      const attempts = [
        { quality: 0.45, targetSize: 160 },
        { quality: 0.35, targetSize: 128 },
        { quality: 0.25, targetSize: 96 },
        { quality: 0.18, targetSize: 64 },
      ];

      for (const attempt of attempts) {
        try {
          if (typeof Worker !== "undefined") {
            try {
              processedBlob = await processOnceWithWorker(attempt);
            } catch {
              try {
                processedBlob = await processInThread(attempt);
              } catch {
                processedBlob = null;
              }
            }
          } else {
            processedBlob = await processInThread(attempt);
          }
          if (processedBlob) {
            // Accept if image is WebP and under size target or at least smaller than original.
            const isWebp = (processedBlob.type || "").toLowerCase().includes("webp");
            const sizeOk = processedBlob.size <= MAX_SIZE;
            const smallerThanOriginal = processedBlob.size < originalBlob.size;
            if (isWebp && (sizeOk || smallerThanOriginal)) break;
          }
        } catch {
          processedBlob = null;
        }
      }

      if (!processedBlob) {
        try {
          processedBlob = await processInThread({ quality: 0.15, targetSize: 64 });
        } catch {
          processedBlob = originalBlob;
        }
      }
      if (!processedBlob) processedBlob = originalBlob;

      try {
        // eslint-disable-next-line no-console
        console.debug(
          `[watch] sending frame sizes: original=${originalBlob.size} bytes, processed=${processedBlob.size} bytes`,
          workerTimings ? { workerTimings } : undefined
        );
      } catch {}

      // Send original and processed image to backend.
      const result = await fetchWatch(originalBlob, processedBlob, {
        signal: abortControllerRef.current.signal
      });

      if (!result.success) {
        setError(result.error);
        setLatest(null);
        setLastLatency(null);
        setLastRequestId(null);
        setLastMeta(null);
      } else {
        setLatest(result.data.result);
        setLastLatency(result.data.meta?.latencyMs ?? null);
        setLastRequestId(result.data.requestId);
        setLastMeta(result.data.meta ?? null);
        setError(null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Watch failed: ${message}`);
      setLatest(null);
      setLastLatency(null);
      setLastRequestId(null);
      setLastMeta(null);
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;

      if (isActiveRef.current) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => { void processFrame(); }, FRAME_INTERVAL_MS);
      }
    }
  }, [isActive, webcamRef]);

  useEffect(() => {
    // Start/stop processing based on isActive.
    if (!isActive) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setLatest(null);
      setError(null);
      setLastLatency(null);
      setLastRequestId(null);
      setLastMeta(null);
      setIsProcessing(false);
      return;
    }

    void processFrame();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isActive, processFrame]);

  return {
    latest,
    lastLatency,
    lastRequestId,
    lastMeta,
    isProcessing,
    error,
  };
}
