import { useCallback, useEffect, useRef, useState } from "react";
import type Webcam from "react-webcam";
import { fetchWatch } from "@/app/lib/watch-client";
import type { WatchResult } from "@/app/lib/watch-types";

export interface UseWebcamWatchResult {
  readonly latest: WatchResult | null;
  readonly lastLatency: number | null;
  readonly lastRequestId: string | null;
  readonly isProcessing: boolean;
  readonly error: string | null;
}

const FRAME_INTERVAL_MS = 3000;

export function useWebcamWatch(
  webcamRef: React.RefObject<Webcam | null>,
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
      const blob = await fetch(imageSrc).then((r) => r.blob());
      const result = await fetchWatch(blob, {
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
