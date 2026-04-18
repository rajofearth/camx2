import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraSourceRef } from "@/app/lib/camera-source";
import { fetchWatch } from "@/app/lib/watch-client";
import { buildWatchFrameBlob } from "@/app/lib/watch-frame";
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const frameWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    try {
      frameWorkerRef.current = new Worker(
        new URL("../workers/imageWorker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      frameWorkerRef.current = null;
    }
    return () => {
      try {
        frameWorkerRef.current?.terminate();
      } catch {
        /* ignore */
      }
      frameWorkerRef.current = null;
    };
  }, []);

  const processFrame = useCallback(async () => {
    if (!isActiveRef.current || !webcamRef.current) return;

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
      const { blob: processedBlob, timings: workerTimings } =
        await buildWatchFrameBlob(
          imageSrc,
          originalBlob,
          frameWorkerRef.current,
        );

      try {
        // eslint-disable-next-line no-console
        console.debug(
          `[watch] frame bytes: original=${originalBlob.size} processed=${processedBlob.size}`,
          workerTimings ? { workerTimings } : undefined,
        );
      } catch {
        /* ignore */
      }

      const result = await fetchWatch(originalBlob, processedBlob, {
        signal: abortControllerRef.current.signal,
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
        timeoutRef.current = setTimeout(() => {
          void processFrame();
        }, FRAME_INTERVAL_MS);
      }
    }
  }, [webcamRef]);

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
