import { useCallback, useEffect, useRef, useState } from "react";
import type Webcam from "react-webcam";
import { fetchWatch } from "@/app/lib/watch-client";
import type { WatchResult } from "@/app/lib/watch-types";

/**
 * Ensure a Blob is PNG. If the blob is already PNG, return it unchanged.
 * Otherwise load it into an Image and redraw to a canvas, then export as PNG.
 */
async function ensurePng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for PNG conversion"));
    };
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get canvas context for PNG conversion");
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const pngBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!pngBlob) throw new Error("Failed to convert image to PNG");
  return pngBlob;
}

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
      const initialBlob = await fetch(imageSrc).then((r) => r.blob());
      const blob = await ensurePng(initialBlob);
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
