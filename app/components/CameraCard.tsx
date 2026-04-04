"use client";

import type React from "react";
import { useRef, useState, useEffect } from "react";
import Webcam from "react-webcam";
import { useWebcamDetect } from "@/app/hooks/useWebcamDetect";
import { useWebcamWatch } from "@/app/hooks/useWebcamWatch";
import { useCameraDevices } from "@/app/hooks/useCameraDevices";
import type { DetectionModel } from "@/app/lib/types";
import { OverlayCanvas } from "./OverlayCanvas";
import type { WatchResult } from "@/app/lib/watch-types";

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

export interface CameraCardProps {
  readonly label: string;
  readonly cameraIndex: number;
  readonly onHarmDetected?: (result: WatchResult, cameraLabel: string) => void;
}

function formatDetectionModel(model: DetectionModel): string {
  return model === "yolo" ? "YOLO" : "RF-DETR";
}

export function CameraCard({
  label,
  cameraIndex,
  onHarmDetected,
}: CameraCardProps): React.JSX.Element {
  const webcamRef = useRef<Webcam>(null);
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

  // New state: whether to show watch debug panel
  const [showWatchDebug, setShowWatchDebug] = useState(false);

  // Auto-select device by index when devices are loaded
  useEffect(() => {
    if (!isLoadingDevices && devices.length > 0) {
      const targetIndex = Math.min(cameraIndex, devices.length - 1);
      const targetDevice = devices[targetIndex];
      if (targetDevice && selectedDeviceId !== targetDevice.deviceId) {
        setSelectedDeviceId(targetDevice.deviceId);
        setIsCameraActive(true);
      }
    }
  }, [devices, isLoadingDevices, cameraIndex, selectedDeviceId]);

  const {
    detections,
    detectionCount,
    lastLatency: detectLatency,
    isProcessing: isDetectProcessing,
    error: detectError,
    frameDimensions,
  } = useWebcamDetect(webcamRef, isDetectionActive && isCameraActive, {
    model: detectionModel,
  });

  // Include lastRequestId so we can display request-level debug info.
  const {
    latest: watchLatest,
    lastLatency: watchLatency,
    lastRequestId: watchRequestId,
    isProcessing: isWatchProcessing,
    error: watchError,
  } = useWebcamWatch(webcamRef, isWatchActive && isCameraActive);

  // Check for harm detection and trigger callback
  useEffect(() => {
    if (watchLatest && onHarmDetected) {
      const hasHarm = watchLatest.isHarm.some((harm) => harm === true);
      if (hasHarm && watchLatest.DescriptionOfSituationOnlyIfFoundHarm) {
        onHarmDetected(watchLatest, label);
      }
    }
  }, [watchLatest, onHarmDetected, label]);

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
  };

  // Monitor webcam video element for errors
  useEffect(() => {
    const video = webcamRef.current?.video;
    if (!video) return;

    const handleError = () => {
      setCameraError("Failed to load camera stream");
      setIsCameraActive(false);
    };

    video.addEventListener("error", handleError);
    return () => {
      video.removeEventListener("error", handleError);
    };
  }, [isCameraActive, selectedDeviceId]);

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
  const showEmptyState =
    !isLoadingDevices &&
    (!hasDevices || devicesError || (!selectedDeviceId && !isCameraActive));

  // Small helper to produce debug JSON for watch API
  const getWatchDebugObject = () => {
    return {
      requestId: watchRequestId ?? null,
      latencyMs: watchLatency ?? null,
      isProcessing: isWatchProcessing,
      error: watchError ?? null,
      result: watchLatest ?? null,
    };
  };

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
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "#9ca3af",
              whiteSpace: "nowrap",
            }}
          >
            Camera:
          </label>
          <select
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
        ) : isCameraActive && selectedDeviceId ? (
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
        {isCameraActive && isDetectionActive && (
          <OverlayCanvas
            webcamRef={webcamRef}
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
              disabled={!isCameraActive || !selectedDeviceId}
              style={{
                padding: "8px 14px",
                backgroundColor: isDetectionActive ? "#ef4444" : "#22c55e",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor:
                  isCameraActive && selectedDeviceId
                    ? "pointer"
                    : "not-allowed",
                fontSize: "11px",
                fontWeight: "600",
                transition: "all 0.2s",
                opacity: isCameraActive && selectedDeviceId ? 1 : 0.5,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
              onMouseEnter={(e) => {
                if (isCameraActive && selectedDeviceId) {
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
              disabled={!isCameraActive || !selectedDeviceId}
              style={{
                padding: "8px 14px",
                backgroundColor: isWatchActive ? "#ef4444" : "#22c55e",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor:
                  isCameraActive && selectedDeviceId
                    ? "pointer"
                    : "not-allowed",
                fontSize: "11px",
                fontWeight: "600",
                transition: "all 0.2s",
                opacity: isCameraActive && selectedDeviceId ? 1 : 0.5,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
              onMouseEnter={(e) => {
                if (isCameraActive && selectedDeviceId) {
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
              disabled={!isCameraActive || !selectedDeviceId}
              title="Toggle Watch API debug info"
              style={{
                padding: "8px 10px",
                backgroundColor: showWatchDebug ? "#7c3aed" : "#374151",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor:
                  isCameraActive && selectedDeviceId
                    ? "pointer"
                    : "not-allowed",
                fontSize: "11px",
                fontWeight: "600",
                transition: "all 0.2s",
                opacity: isCameraActive && selectedDeviceId ? 1 : 0.5,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
            >
              {showWatchDebug ? "Hide Debug" : "Watch Debug"}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              disabled={!selectedDeviceId}
              style={{
                padding: "8px 14px",
                backgroundColor: isCameraActive ? "#ef4444" : "#22c55e",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: selectedDeviceId ? "pointer" : "not-allowed",
                fontSize: "11px",
                fontWeight: "600",
                transition: "all 0.2s",
                opacity: selectedDeviceId ? 1 : 0.5,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
              onMouseEnter={(e) => {
                if (selectedDeviceId) {
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
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  padding: "8px",
                  borderRadius: "6px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#c7d2fe",
                    marginBottom: "6px",
                    fontWeight: 600,
                  }}
                >
                  Watch API Debug
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    marginBottom: "6px",
                  }}
                >
                  Request:{" "}
                  <span style={{ color: "#fff" }}>{watchRequestId ?? "—"}</span>
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    marginBottom: "6px",
                  }}
                >
                  Latency:{" "}
                  <span style={{ color: "#fff" }}>
                    {watchLatency !== null
                      ? `${watchLatency.toFixed(0)}ms`
                      : "—"}
                  </span>
                </div>

                <div
                  style={{
                    maxHeight: 160,
                    overflowY: "auto",
                    background: "rgba(0,0,0,0.5)",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid rgba(255,255,255,0.02)",
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
