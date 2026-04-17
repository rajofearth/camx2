import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CameraSourceRef } from "@/app/lib/camera-source";
import { fetchDetect } from "@/app/lib/detect-client";
import type {
  Detection,
  DetectionModel,
  FrameDimensions,
} from "@/app/lib/types";

export interface UseWebcamDetectOptions {
  readonly maxFps?: number;
  readonly minConfidence?: number;
  readonly model?: DetectionModel;
}

export interface UseWebcamDetectResult {
  readonly detections: readonly Detection[];
  readonly detectionCount: number;
  readonly lastLatency: number | null;
  readonly isProcessing: boolean;
  readonly error: string | null;
  readonly frameDimensions: FrameDimensions | null;
}

const DEFAULT_MAX_FPS = 5;
const DEFAULT_MIN_CONFIDENCE = 0.5;
const DEFAULT_MODEL: DetectionModel = "rfdetr";

export function useWebcamDetect(
  webcamRef: React.RefObject<CameraSourceRef | null>,
  isActive: boolean,
  options?: UseWebcamDetectOptions,
): UseWebcamDetectResult {
  const maxFps = options?.maxFps ?? DEFAULT_MAX_FPS;
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const detectionModel = options?.model ?? DEFAULT_MODEL;
  const minIntervalMs = 1000 / maxFps;

  const [detections, setDetections] = useState<readonly Detection[]>([]);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameDimensions, setFrameDimensions] =
    useState<FrameDimensions | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestTimeRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(isActive);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    setDetections([]);
    setLastLatency(null);
    setError(null);
    setFrameDimensions(null);
  }, [detectionModel]);

  const processFrame = useCallback(async () => {
    // Only process if active and webcam source is ready
    if (!isActiveRef.current || !webcamRef.current) return;

    const now = performance.now();
    const sinceLast = now - lastRequestTimeRef.current;

    if (sinceLast < minIntervalMs) {
      // Throttle detection loop
      timeoutRef.current = setTimeout(
        () => void processFrame(),
        minIntervalMs - sinceLast,
      );
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      timeoutRef.current = setTimeout(() => void processFrame(), 16);
      return;
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setIsProcessing(true);
    setError(null);
    lastRequestTimeRef.current = now;

    try {
      const blob = await fetch(imageSrc).then((r) => r.blob());
      const result = await fetchDetect(blob, {
        signal: abortControllerRef.current.signal,
        model: detectionModel,
      });

      if (!result.success) {
        startTransition(() => {
          setError(result.error);
          setDetections([]);
          setLastLatency(null);
          setFrameDimensions(null);
        });
      } else {
        const filtered = result.data.detections.filter(
          (d) => d.confidence >= minConfidence,
        );
        startTransition(() => {
          setDetections(filtered);
          setLastLatency(result.data.meta?.latencyMs ?? null);
          setFrameDimensions(result.data.frame);
          setError(null);
        });
      }
    } catch (err) {
      // Request cancelled or failed
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Unknown error";
      startTransition(() => {
        setError(`Detection failed: ${message}`);
        setDetections([]);
        setLastLatency(null);
        setFrameDimensions(null);
      });
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
      if (isActiveRef.current) {
        const delay = Math.max(
          0,
          minIntervalMs - (performance.now() - lastRequestTimeRef.current),
        );
        timeoutRef.current = setTimeout(() => void processFrame(), delay);
      }
    }
  }, [webcamRef, minIntervalMs, minConfidence, detectionModel]);

  useEffect(() => {
    if (!isActive) {
      // Clean up in-flight requests and timeouts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setDetections([]);
      setError(null);
      setFrameDimensions(null);
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
    detections,
    detectionCount: detections.length,
    lastLatency,
    isProcessing,
    error,
    frameDimensions,
  };
}
