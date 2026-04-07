import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraSourceRef } from "@/app/lib/camera-source";
import { makeSquareAndCompress } from "@/app/lib/image-utils";
import { fetchWatch } from "@/app/lib/watch-client";
import type { WatchResult } from "@/app/lib/watch-types";

// Use the shared image utility to produce a square, compressed PNG.
// The heavy lifting is delegated to `makeSquareAndCompress` which uses
// fast browser APIs (createImageBitmap, OffscreenCanvas where available).
// No local conversion helper is required here.

export interface UseWebcamWatchResult {
  readonly latest: WatchResult | null;
  readonly lastLatency: number | null;
  readonly lastRequestId: string | null;
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the ref-backed guard keeps the loop stable while state changes.
  const processFrame = useCallback(async () => {
    if (!isActiveRef.current || !webcamRef.current) {
      return;
    }

    // Backpressure: never overlap requests.
    if (abortControllerRef.current) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        void processFrame();
      }, FRAME_INTERVAL_MS);
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        void processFrame();
      }, FRAME_INTERVAL_MS);
      return;
    }

    abortControllerRef.current = new AbortController();
    setIsProcessing(true);
    setError(null);

    try {
      const originalBlob = await fetch(imageSrc).then((r) => r.blob());

      // We will try to produce a WebP processed blob that is small (target <= 100KB).
      // Strategy:
      // 1) Try worker-based processing to avoid blocking the UI thread.
      // 2) If worker is unavailable or fails, fall back to in-thread processing.
      // 3) If produced blob is too large (or larger than the original), retry with reduced size/quality.
      // 4) If all attempts fail, fall back to sending the processed blob we have (or original).
      let processedBlob: Blob | null = null;
      let workerTimings: unknown = null;

      // Helper: process once via worker (returns Blob or throws)
      async function processOnceWithWorker(_opts: {
        quality: number;
        targetSize: number;
      }): Promise<Blob> {
        return new Promise<Blob>((resolve, reject) => {
          try {
            const worker = new Worker(
              new URL("../workers/imageWorker.ts", import.meta.url),
              {
                type: "module",
              },
            );

            const id = String(Math.random()).slice(2);
            const onMessage = (ev: MessageEvent) => {
              const d = ev.data;
              if (!d) return;
              // accept matching id or single-response workers
              if (d.id !== undefined && d.id !== id) return;
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

            // Post the image data URL to the worker
            worker.postMessage({
              id,
              imageDataUrl: imageSrc,
              options: {
                quality: 0.45,
                mode: "crop",
                targetSize: 160,
                output: "png",
              },
            });

            // Safety timeout in case worker hangs
            const timeout = setTimeout(() => {
              try {
                worker.removeEventListener("message", onMessage);
                worker.removeEventListener("error", onError);
                worker.terminate();
              } catch {}
              reject(new Error("Image worker timeout"));
            }, 3000);

            // Clear timeout on resolution/rejection
            const wrapResolve =
              <TArgs extends unknown[], TResult>(
                fn: (...args: TArgs) => TResult,
              ) =>
              (...args: TArgs) => {
                clearTimeout(timeout);
                return fn(...args);
              };
            const originalResolve = resolve;
            const originalReject = reject;
            // replace resolve/reject to clear timeout
            resolve = wrapResolve(originalResolve);
            reject = wrapResolve(originalReject);
          } catch (err) {
            reject(err);
          }
        });
      }

      // Helper: synchronous/in-thread processing attempt
      async function processInThread(opts: {
        quality: number;
        targetSize: number;
      }) {
        return makeSquareAndCompress(originalBlob, {
          quality: opts.quality,
          mode: "crop",
          output: "png",
          targetSize: opts.targetSize,
        });
      }

      // Retry strategy parameters (descending quality/size)
      const MAX_SIZE = 100 * 1024; // 100 KB desired upper bound
      const attempts = [
        { quality: 0.45, targetSize: 160 },
        { quality: 0.35, targetSize: 128 },
        { quality: 0.25, targetSize: 96 },
        { quality: 0.18, targetSize: 64 },
      ];

      // Iterate attempts until we get a webp under MAX_SIZE (prefer smaller than original)
      for (const attempt of attempts) {
        try {
          // Prefer worker if available
          if (typeof Worker !== "undefined") {
            try {
              processedBlob = await processOnceWithWorker({
                quality: attempt.quality,
                targetSize: attempt.targetSize,
              });
            } catch {
              // worker failed for this attempt, try in-thread fallback for the same params
              try {
                processedBlob = await processInThread({
                  quality: attempt.quality,
                  targetSize: attempt.targetSize,
                });
              } catch {
                processedBlob = null;
              }
            }
          } else {
            // No worker available: process in-thread
            processedBlob = await processInThread({
              quality: attempt.quality,
              targetSize: attempt.targetSize,
            });
          }

          if (processedBlob) {
            // Ensure it's WebP (we requested webp, but double-check)
            const isWebp = (processedBlob.type || "")
              .toLowerCase()
              .includes("webp");
            const sizeOk = processedBlob.size <= MAX_SIZE;
            const smallerThanOriginal = processedBlob.size < originalBlob.size;

            if (isWebp && (sizeOk || smallerThanOriginal)) {
              // Accept this processed blob
              break;
            }

            // If not acceptable, continue to next attempt (possibly with lower size/quality)
            // Keep the smallest seen blob as a fallback.
            // If processedBlob is larger than original and there are more attempts, continue.
          }
        } catch {
          // keep trying lower-quality attempts
          processedBlob = null;
        }
      }

      // If after attempts we still don't have a processedBlob, try a final fast in-thread pass with very small params
      if (!processedBlob) {
        try {
          processedBlob = await processInThread({
            quality: 0.15,
            targetSize: 64,
          });
        } catch {
          // Give up and fall back to original
          processedBlob = originalBlob;
        }
      }

      // Final safeguard: ensure we at least have a Blob
      if (!processedBlob) {
        processedBlob = originalBlob;
      }

      // Log sizes and optional timings for debugging
      try {
        // eslint-disable-next-line no-console
        console.debug(
          `[watch] sending frame sizes: original=${originalBlob.size} bytes, processed=${processedBlob.size} bytes`,
          workerTimings ? { workerTimings } : undefined,
        );
      } catch {
        // ignore logging failures
      }

      // Send both original (for audit) and processed (for analysis)
      const result = await fetchWatch(originalBlob, processedBlob, {
        signal: abortControllerRef.current.signal,
      });

      if (!result.success) {
        setError(result.error);
        setLatest(null);
        setLastLatency(null);
        setLastRequestId(null);
      } else {
        setLatest(result.data.result);
        setLastLatency(result.data.meta?.latencyMs ?? null);
        setLastRequestId(result.data.requestId);
        setError(null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Watch failed: ${message}`);
      setLatest(null);
      setLastLatency(null);
      setLastRequestId(null);
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;

      if (isActiveRef.current) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          void processFrame();
        }, FRAME_INTERVAL_MS);
      }
    }
  }, [isActive, webcamRef]);

  useEffect(() => {
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
    isProcessing,
    error,
  };
}
