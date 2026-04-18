"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { useCameraDevices } from "@/app/hooks/useCameraDevices";
import { useWebcamDetect } from "@/app/hooks/useWebcamDetect";
import { useWebcamWatch } from "@/app/hooks/useWebcamWatch";
import type { CameraSourceRef } from "@/app/lib/camera-source";
import type { DetectionModel } from "@/app/lib/types";
import type { WatchResult } from "@/app/lib/watch-types";
import {
  isVerifiedThreat,
  type VerifiedWatchThreatPayload,
} from "@/app/lib/watch-verification";
import { OverlayCanvas } from "@/components/OverlayCanvas";

function formatMs(value: number | null | undefined): string {
  return typeof value === "number" ? `${value.toFixed(0)}ms` : "—";
}

function getWatchStatusTone(result: WatchResult | null): {
  readonly label: string;
  readonly color: string;
  readonly background: string;
  readonly border: string;
} {
  if (!result) {
    return {
      label: "No result",
      color: "#d1d5db",
      background: "rgba(107, 114, 128, 0.12)",
      border: "rgba(156, 163, 175, 0.25)",
    };
  }

  if (result.isHarm === true) {
    return {
      label: "Harm detected",
      color: "#fecaca",
      background: "rgba(239, 68, 68, 0.14)",
      border: "rgba(248, 113, 113, 0.35)",
    };
  }

  if (result.isHarm === false) {
    return {
      label: "Safe / filtered",
      color: "#bbf7d0",
      background: "rgba(34, 197, 94, 0.14)",
      border: "rgba(74, 222, 128, 0.35)",
    };
  }

  return {
    label: "Uncertain",
    color: "#fde68a",
    background: "rgba(245, 158, 11, 0.14)",
    border: "rgba(251, 191, 36, 0.35)",
  };
}

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

export interface OperationsCameraCardProps {
  readonly label: string;
  readonly cameraIndex: number;
  readonly isPaused?: boolean;
  /** Fires once per watch request when verification confirms a harm classification. */
  readonly onVerifiedThreat?: (payload: VerifiedWatchThreatPayload) => void;
}

function formatDetectionModel(model: DetectionModel): string {
  return model === "yolo" ? "YOLO" : "RF-DETR";
}

export function OperationsCameraCard({
  label,
  cameraIndex,
  isPaused = false,
  onVerifiedThreat,
}: OperationsCameraCardProps): React.JSX.Element {
  const webcamRef = useRef<InstanceType<typeof Webcam> | null>(null);
  const cameraSourceRef = useRef<CameraSourceRef | null>(null);
  // If a local video file is selected for testing, `localVideoRef` points at
  // the HTMLVideoElement and `cameraSourceRef.current` becomes a wrapper that
  // implements `getScreenshot()` and exposes `video`.
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [useLocalVideo, setUseLocalVideo] = useState(false);
  const [localVideoSrc, setLocalVideoSrc] = useState<string | null>(null);

  const {
    devices,
    isLoading: isLoadingDevices,
    error: devicesError,
  } = useCameraDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isDetectionActive, setIsDetectionActive] = useState(true);
  const [isWatchActive, setIsWatchActive] = useState(false);
  const [detectionModel, setDetectionModel] =
    useState<DetectionModel>("rfdetr");
  const [isSessionReady, setIsSessionReady] = useState(false);

  // New state: whether to show watch debug panel
  const [showWatchDebug, setShowWatchDebug] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storageKey = `camx2.operations.card.${cameraIndex}`;

    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored) as Partial<{
        selectedDeviceId: string | null;
        isCameraActive: boolean;
        isDetectionActive: boolean;
        isWatchActive: boolean;
        detectionModel: DetectionModel;
      }>;

      setSelectedDeviceId(parsed.selectedDeviceId ?? null);
      setIsCameraActive(Boolean(parsed.isCameraActive));
      setIsDetectionActive(parsed.isDetectionActive ?? true);
      setIsWatchActive(Boolean(parsed.isWatchActive));
      if (
        parsed.detectionModel === "yolo" ||
        parsed.detectionModel === "rfdetr"
      ) {
        setDetectionModel(parsed.detectionModel);
      }
    } catch {
      // Ignore malformed session state and continue with defaults.
    }

    setIsSessionReady(true);
  }, [cameraIndex]);

  useEffect(() => {
    if (!isSessionReady) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const storageKey = `camx2.operations.card.${cameraIndex}`;
    const snapshot = {
      selectedDeviceId,
      isCameraActive,
      isDetectionActive,
      isWatchActive,
      detectionModel,
    };

    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch {
      // Ignore storage quota / access failures.
    }
  }, [
    cameraIndex,
    detectionModel,
    isCameraActive,
    isDetectionActive,
    isWatchActive,
    selectedDeviceId,
    isSessionReady,
  ]);

  const isCameraRunning = isCameraActive && !isPaused;

  // Auto-select device by index when devices are loaded
  useEffect(() => {
    if (!isSessionReady || isLoadingDevices || devices.length === 0) {
      return;
    }

    if (selectedDeviceId) {
      return;
    }

    const targetIndex = Math.min(cameraIndex, devices.length - 1);
    const targetDevice = devices[targetIndex];
    if (targetDevice) {
      setSelectedDeviceId(targetDevice.deviceId);
      setIsCameraActive(true);
    }
  }, [
    devices,
    isLoadingDevices,
    cameraIndex,
    selectedDeviceId,
    isSessionReady,
  ]);

  const {
    detections,
    detectionCount,
    lastLatency: detectLatency,
    isProcessing: isDetectProcessing,
    error: detectError,
    frameDimensions,
  } = useWebcamDetect(cameraSourceRef, isDetectionActive && isCameraRunning, {
    model: detectionModel,
  });

  // Include lastRequestId so we can display request-level debug info.
  const {
    latest: watchLatest,
    lastLatency: watchLatency,
    lastRequestId: watchRequestId,
    lastMeta: watchMeta,
    isProcessing: isWatchProcessing,
    error: watchError,
  } = useWebcamWatch(cameraSourceRef, isWatchActive && isCameraRunning);

  const lastEmittedVerifiedRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isWatchActive) {
      lastEmittedVerifiedRequestIdRef.current = null;
    }
  }, [isWatchActive]);

  useEffect(() => {
    if (!onVerifiedThreat || !watchRequestId || !watchLatest) return;
    if (lastEmittedVerifiedRequestIdRef.current === watchRequestId) return;
    if (!isVerifiedThreat(watchLatest, watchMeta?.verification)) return;

    lastEmittedVerifiedRequestIdRef.current = watchRequestId;

    const screenshot = cameraSourceRef.current?.getScreenshot() ?? null;
    const confidence =
      detections.length > 0
        ? Math.round(Math.max(...detections.map((d) => d.confidence)) * 100)
        : 90;

    onVerifiedThreat({
      requestId: watchRequestId,
      cameraLabel: label,
      cameraId: label,
      watchResult: watchLatest,
      verification: watchMeta?.verification ?? null,
      frameSrc: screenshot,
      confidence,
    });
  }, [
    detections,
    label,
    onVerifiedThreat,
    watchLatest,
    watchMeta?.verification,
    watchRequestId,
  ]);

  const toggleDetection = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDetectionActive((prev) => !prev);
  };

  const toggleWatch = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWatchActive((prev) => !prev);
  };

  const toggleCamera = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCameraActive((prev) => {
      const newState = !prev;
      if (!newState) {
        setIsDetectionActive(false);
        setIsWatchActive(false);
      }
      return newState;
    });
  };

  const toggleDetectionModel = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDetectionModel((prev) => (prev === "rfdetr" ? "yolo" : "rfdetr"));
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    setSelectedDeviceId(deviceId);
    setCameraError(null);
    if (deviceId) {
      setIsCameraActive(true);
    } else {
      setIsCameraActive(false);
    }
  };

  const handleUserMedia = () => {
    // Camera successfully accessed
    setCameraError(null);
    // If we successfully access a real camera, prefer it over any local video.
    setUseLocalVideo(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      // Clear local video selection
      if (localVideoSrc) {
        try {
          URL.revokeObjectURL(localVideoSrc);
        } catch {
          /* ignore */
        }
      }
      setLocalVideoSrc(null);
      setUseLocalVideo(false);
      return;
    }

    const url = URL.createObjectURL(file);
    // If previously had a blob URL, revoke it
    if (localVideoSrc) {
      try {
        URL.revokeObjectURL(localVideoSrc);
      } catch {
        /* ignore */
      }
    }

    setLocalVideoSrc(url);
    setUseLocalVideo(true);
    // When using a local video we don't use a camera device
    setSelectedDeviceId(null);
    setIsCameraActive(true);
    setCameraError(null);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the camera source ref must stay in sync with route and local-video state.
  useEffect(() => {
    if (useLocalVideo && localVideoRef.current) {
      cameraSourceRef.current = {
        video: localVideoRef.current,
        getScreenshot: () => {
          const videoEl = localVideoRef.current;
          if (!videoEl) return null;

          const canvas = document.createElement("canvas");
          canvas.width = VIDEO_WIDTH;
          canvas.height = VIDEO_HEIGHT;
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;

          try {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/jpeg");
          } catch {
            return null;
          }
        },
      };
      return;
    }

    cameraSourceRef.current = webcamRef.current;
  }, [isCameraRunning, selectedDeviceId, useLocalVideo, localVideoSrc]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the listener must follow the active video source.
  useEffect(() => {
    const video = cameraSourceRef.current?.video;
    if (!video) return;

    const handleError = () => {
      setCameraError("Failed to load camera stream");
      setIsCameraActive(false);
    };

    video.addEventListener("error", handleError);
    return () => {
      video.removeEventListener("error", handleError);
    };
  }, [isCameraRunning, selectedDeviceId]);

  const videoConstraints = selectedDeviceId
    ? {
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
        deviceId: { exact: selectedDeviceId },
      }
    : {
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
      };

  const hasDevices = devices.length > 0;
  const hasActiveSource = Boolean(selectedDeviceId) || useLocalVideo;
  const showEmptyState =
    !isLoadingDevices &&
    (!hasDevices || devicesError || (!hasActiveSource && !isCameraActive));

  const watchStatusTone = getWatchStatusTone(watchLatest);
  const verification = watchMeta?.verification ?? null;

  const verificationApplied = verification?.applied ?? false;
  const verificationOverturned = verification?.overturned ?? false;
  const verificationReason = verification?.reason ?? null;
  const verificationModelKey = verification?.modelKey ?? null;
  const verificationLatencyMs = verification?.latencyMs ?? null;

  const getWatchDebugObject = () => {
    return {
      requestId: watchRequestId ?? null,
      latencyMs: watchLatency ?? null,
      isProcessing: isWatchProcessing,
      error: watchError ?? null,
      result: watchLatest ?? null,
      meta: watchMeta ?? null,
    };
  };

  const verificationRawText =
    verification && typeof verification.rawText === "string"
      ? verification.rawText
      : null;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {/* Device Selection */}
      {hasDevices && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <label
            htmlFor={`camera-select-${cameraIndex}`}
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "#9ca3af",
              whiteSpace: "nowrap",
            }}
          >
            Camera:
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: 1,
            }}
          >
            <select
              id={`camera-select-${cameraIndex}`}
              value={selectedDeviceId || ""}
              onChange={handleDeviceChange}
              disabled={isLoadingDevices}
              style={{
                flex: 1,
                padding: "6px 10px",
                backgroundColor: "#1f2937",
                color: "#fff",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: isLoadingDevices ? "not-allowed" : "pointer",
                opacity: isLoadingDevices ? 0.5 : 1,
              }}
            >
              {isLoadingDevices ? (
                <option>Loading cameras...</option>
              ) : (
                <>
                  <option value="">Select camera...</option>
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </>
              )}
            </select>

            {/* File input for local video testing */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label
                htmlFor={`video-file-input-${cameraIndex}`}
                style={{
                  fontSize: "12px",
                  color: "#9ca3af",
                  whiteSpace: "nowrap",
                }}
              >
                Or use video:
              </label>
              <input
                id={`video-file-input-${cameraIndex}`}
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                style={{
                  backgroundColor: "#1f2937",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "6px",
                  fontSize: "12px",
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
                title="Use a local video file as the camera source for testing"
              />
            </div>
          </div>
        </div>
      )}

      <div style={{ position: "relative", display: "inline-block" }}>
        {showEmptyState ? (
          <div
            style={{
              width: VIDEO_WIDTH,
              height: VIDEO_HEIGHT,
              background: "linear-gradient(135deg, #1f2937 0%, #111827 100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
              fontSize: "14px",
              border: "2px dashed rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              gap: "12px",
            }}
          >
            <div
              style={{
                fontSize: "48px",
                opacity: 0.5,
              }}
            >
              📷
            </div>
            <div style={{ textAlign: "center", padding: "0 20px" }}>
              {isLoadingDevices ? (
                <div>Loading cameras...</div>
              ) : devicesError ? (
                <div>
                  <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                    Camera Access Error
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.8 }}>
                    {devicesError}
                  </div>
                </div>
              ) : !hasDevices ? (
                <div>
                  <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                    No Cameras Available
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.8 }}>
                    Please connect a camera or grant camera permissions
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                    Select a Camera
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.8 }}>
                    Choose a camera from the dropdown above
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isCameraRunning && useLocalVideo && localVideoSrc ? (
          <video
            ref={localVideoRef}
            src={localVideoSrc ?? undefined}
            width={VIDEO_WIDTH}
            height={VIDEO_HEIGHT}
            style={{ display: "block" }}
            autoPlay
            loop
            muted
            playsInline
          />
        ) : isCameraRunning && selectedDeviceId ? (
          <Webcam
            ref={webcamRef}
            width={VIDEO_WIDTH}
            height={VIDEO_HEIGHT}
            screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints}
            onUserMedia={handleUserMedia}
            style={{ display: "block" }}
          />
        ) : (
          <div
            style={{
              width: VIDEO_WIDTH,
              height: VIDEO_HEIGHT,
              background: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "18px",
            }}
          >
            Camera Stopped
          </div>
        )}
        {isCameraRunning && isDetectionActive && (
          <OverlayCanvas
            webcamRef={cameraSourceRef}
            detections={detections}
            frameDimensions={frameDimensions}
            detectionModel={detectionModel}
          />
        )}
        {/* Control Buttons */}
        {!showEmptyState && (
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={toggleDetection}
              disabled={!isCameraRunning || !hasActiveSource}
              style={{
                padding: "8px 14px",
                backgroundColor: isDetectionActive ? "#ef4444" : "#22c55e",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor:
                  isCameraRunning && hasActiveSource
                    ? "pointer"
                    : "not-allowed",
                fontSize: "11px",
                fontWeight: "600",
                transition: "all 0.2s",
                opacity: isCameraRunning && hasActiveSource ? 1 : 0.5,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
              onMouseEnter={(e) => {
                if (isCameraRunning && hasActiveSource) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 6px rgba(0, 0, 0, 0.3)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 2px 4px rgba(0, 0, 0, 0.2)";
              }}
            >
              {isDetectionActive ? "Stop Detect" : "Start Detect"}
            </button>
            <button
              type="button"
              onClick={toggleDetectionModel}
              style={{
                padding: "8px 14px",
                backgroundColor: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: "600",
                transition: "all 0.2s",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 4px 6px rgba(0, 0, 0, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 2px 4px rgba(0, 0, 0, 0.2)";
              }}
            >
              Switch to {detectionModel === "rfdetr" ? "YOLO" : "RF-DETR"}
            </button>
            <button
              type="button"
              onClick={toggleWatch}
              disabled={!isCameraRunning || !hasActiveSource}
              style={{
                padding: "8px 14px",
                backgroundColor: isWatchActive ? "#ef4444" : "#22c55e",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor:
                  isCameraRunning && hasActiveSource
                    ? "pointer"
                    : "not-allowed",
                fontSize: "11px",
                fontWeight: "600",
                transition: "all 0.2s",
                opacity: isCameraRunning && hasActiveSource ? 1 : 0.5,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
              onMouseEnter={(e) => {
                if (isCameraRunning && hasActiveSource) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 6px rgba(0, 0, 0, 0.3)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 2px 4px rgba(0, 0, 0, 0.2)";
              }}
            >
              {isWatchActive ? "Stop Watch" : "Start Watch"}
            </button>
            <button
              type="button"
              onClick={() => setShowWatchDebug((s) => !s)}
              disabled={!isCameraRunning || !hasActiveSource}
              title="Toggle Watch API debug info"
              style={{
                padding: "8px 10px",
                backgroundColor: showWatchDebug ? "#7c3aed" : "#374151",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor:
                  isCameraRunning && hasActiveSource
                    ? "pointer"
                    : "not-allowed",
                fontSize: "11px",
                fontWeight: "600",
                transition: "all 0.2s",
                opacity: isCameraRunning && hasActiveSource ? 1 : 0.5,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
            >
              {showWatchDebug ? "Hide Debug" : "Watch Debug"}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              disabled={!hasActiveSource}
              style={{
                padding: "8px 14px",
                backgroundColor: isCameraActive ? "#ef4444" : "#22c55e",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: hasActiveSource ? "pointer" : "not-allowed",
                fontSize: "11px",
                fontWeight: "600",
                transition: "all 0.2s",
                opacity: hasActiveSource ? 1 : 0.5,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
              onMouseEnter={(e) => {
                if (hasActiveSource) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 6px rgba(0, 0, 0, 0.3)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 2px 4px rgba(0, 0, 0, 0.2)";
              }}
            >
              {isCameraActive ? "Stop" : "Start"}
            </button>
          </div>
        )}
        {/* Status Overlay */}
        {!showEmptyState && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "rgba(0, 0, 0, 0.85)",
              color: "#00ff00",
              padding: "8px 12px",
              borderRadius: "6px",
              fontFamily: "monospace",
              fontSize: "11px",
              maxWidth: 320,
              backdropFilter: "blur(4px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <div
              style={{
                fontWeight: "600",
                marginBottom: "6px",
                color: "#fff",
                fontSize: "12px",
              }}
            >
              {label}
            </div>
            {cameraError && (
              <div
                style={{
                  color: "#ff4444",
                  marginBottom: "6px",
                  fontSize: "10px",
                }}
              >
                ⚠ {cameraError}
              </div>
            )}
            <div style={{ opacity: 0.9 }}>
              Model: {formatDetectionModel(detectionModel)}
            </div>
            <div style={{ opacity: 0.9 }}>Detections: {detectionCount}</div>
            {detectLatency !== null && (
              <div style={{ opacity: 0.9 }}>
                Detect: {detectLatency.toFixed(0)}ms
              </div>
            )}
            {watchLatency !== null && (
              <div style={{ opacity: 0.9 }}>
                Watch: {watchLatency.toFixed(0)}ms
              </div>
            )}
            {(isDetectProcessing || isWatchProcessing) && (
              <div style={{ color: "#60a5fa", marginTop: "4px" }}>
                ⏳ Processing...
              </div>
            )}
            {detectError && (
              <div
                style={{ color: "#ff4444", marginTop: "4px", fontSize: "10px" }}
              >
                Detect: {detectError}
              </div>
            )}
            {watchError && (
              <div
                style={{ color: "#ff4444", marginTop: "4px", fontSize: "10px" }}
              >
                Watch: {watchError}
              </div>
            )}

            {/* Watch debug panel (collapsible) */}
            {showWatchDebug && (
              <div
                style={{
                  marginTop: "8px",
                  background:
                    "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.96) 100%)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  padding: "10px",
                  borderRadius: "10px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#c7d2fe",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      Watch Debug
                    </div>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#94a3b8",
                        marginTop: "2px",
                      }}
                    >
                      Verification-first view for harm review
                    </div>
                  </div>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 8px",
                      borderRadius: "999px",
                      color: watchStatusTone.color,
                      background: watchStatusTone.background,
                      border: `1px solid ${watchStatusTone.border}`,
                      fontSize: "10px",
                      fontWeight: 700,
                    }}
                  >
                    {watchStatusTone.label}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "8px",
                      padding: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#94a3b8",
                        marginBottom: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Request
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#fff",
                        wordBreak: "break-word",
                      }}
                    >
                      {watchRequestId ?? "—"}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "8px",
                      padding: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#94a3b8",
                        marginBottom: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Watch latency
                    </div>
                    <div style={{ fontSize: "11px", color: "#fff" }}>
                      {formatMs(watchLatency)}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "8px",
                    padding: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      flexWrap: "wrap",
                      marginBottom: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      Verification
                    </div>

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 8px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: verificationApplied
                          ? verificationOverturned
                            ? "#fecaca"
                            : "#bbf7d0"
                          : "#d1d5db",
                        background: verificationApplied
                          ? verificationOverturned
                            ? "rgba(239, 68, 68, 0.14)"
                            : "rgba(34, 197, 94, 0.14)"
                          : "rgba(107, 114, 128, 0.14)",
                        border: verificationApplied
                          ? verificationOverturned
                            ? "1px solid rgba(248, 113, 113, 0.35)"
                            : "1px solid rgba(74, 222, 128, 0.35)"
                          : "1px solid rgba(156, 163, 175, 0.25)",
                      }}
                    >
                      {!verificationApplied
                        ? "Not run"
                        : verificationOverturned
                          ? "Overturned"
                          : "Passed"}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        background: "rgba(2,6,23,0.45)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        borderRadius: "8px",
                        padding: "8px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#94a3b8",
                          marginBottom: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Verifier latency
                      </div>
                      <div style={{ fontSize: "11px", color: "#fff" }}>
                        {formatMs(verificationLatencyMs)}
                      </div>
                    </div>

                    <div
                      style={{
                        background: "rgba(2,6,23,0.45)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        borderRadius: "8px",
                        padding: "8px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#94a3b8",
                          marginBottom: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Verifier model
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#fff",
                          wordBreak: "break-word",
                        }}
                      >
                        {verificationModelKey ?? "—"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "8px",
                      borderRadius: "8px",
                      padding: "9px",
                      background: verificationOverturned
                        ? "rgba(127, 29, 29, 0.22)"
                        : verificationApplied
                          ? "rgba(20, 83, 45, 0.2)"
                          : "rgba(30, 41, 59, 0.45)",
                      border: verificationOverturned
                        ? "1px solid rgba(248, 113, 113, 0.18)"
                        : verificationApplied
                          ? "1px solid rgba(74, 222, 128, 0.18)"
                          : "1px solid rgba(148, 163, 184, 0.12)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#94a3b8",
                        marginBottom: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Verification reason
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#e5e7eb",
                        lineHeight: 1.5,
                      }}
                    >
                      {verificationReason ??
                        (verificationApplied
                          ? "No reason returned."
                          : "Second-pass verification only runs when the initial watch result says harm is true.")}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "8px",
                    padding: "10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#fff",
                      fontWeight: 700,
                      marginBottom: "6px",
                    }}
                  >
                    Final result
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#e5e7eb",
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: "#94a3b8" }}>isHarm:</span>{" "}
                    {watchLatest?.isHarm === null
                      ? "null"
                      : String(watchLatest?.isHarm ?? null)}
                    <br />
                    <span style={{ color: "#94a3b8" }}>description:</span>{" "}
                    {watchLatest?.description ?? "—"}
                  </div>
                </div>

                {verificationApplied && (
                  <details
                    style={{
                      background: "rgba(0,0,0,0.35)",
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.05)",
                      overflow: "hidden",
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        listStyle: "none",
                        padding: "10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#cbd5e1",
                        userSelect: "none",
                      }}
                    >
                      Verifier raw response
                    </summary>
                    <div
                      style={{
                        maxHeight: 140,
                        overflowY: "auto",
                        borderTop: "1px solid rgba(255,255,255,0.05)",
                        padding: "10px",
                      }}
                    >
                      <pre
                        style={{
                          margin: 0,
                          fontFamily: "monospace",
                          fontSize: "11px",
                          color: "#e5e7eb",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {verificationRawText ?? "—"}
                      </pre>
                    </div>
                  </details>
                )}

                <details
                  style={{
                    background: "rgba(0,0,0,0.35)",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.05)",
                    overflow: "hidden",
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      listStyle: "none",
                      padding: "10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#cbd5e1",
                      userSelect: "none",
                    }}
                  >
                    Raw debug payload
                  </summary>
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: "auto",
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      padding: "10px",
                    }}
                  >
                    <pre
                      style={{
                        margin: 0,
                        fontFamily: "monospace",
                        fontSize: "11px",
                        color: "#e5e7eb",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {JSON.stringify(getWatchDebugObject(), null, 2)}
                    </pre>
                  </div>
                </details>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
