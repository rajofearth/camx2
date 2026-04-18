"use client";

import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import Webcam from "react-webcam";
import type { CameraSourceRef } from "@/app/lib/camera-source";
import {
  buildCameraPlaybackDescriptor,
  describeCameraStreamSource,
} from "@/app/lib/camera-stream";
import type { CameraSettingsRow } from "@/app/lib/camera-settings-store";
import { MonoLabel } from "@/components/ui/mono-label";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

const VIDEO_W = 640;
const VIDEO_H = 480;

export interface CameraStreamSurfaceProps {
  readonly camera: CameraSettingsRow | null;
  readonly isPrimary?: boolean;
  readonly isSelected?: boolean;
  readonly isReady?: boolean;
  readonly error?: string | null;
  readonly sourceRef?: React.RefObject<CameraSourceRef | null>;
  readonly onSelect?: (cameraId: string) => void;
  readonly onReady?: () => void;
  readonly onError?: (message: string) => void;
  readonly overlays?: React.ReactNode;
  readonly footer?: React.ReactNode;
}

function getSourceKindLabel(camera: CameraSettingsRow | null): string {
  if (!camera) return "NO SOURCE";
  if (camera.sourceType === "device") return "DEVICE";

  const descriptor = describeCameraStreamSource(camera.sourceUrl);

  if (descriptor.kind === "http" || descriptor.kind === "https") {
    return descriptor.isDirectBrowserPlayable
      ? "URL"
      : descriptor.protocolLabel;
  }

  if (descriptor.kind === "file") {
    return "LOCAL";
  }

  return descriptor.protocolLabel;
}

function getStatusLabel(
  camera: CameraSettingsRow | null,
  isReady: boolean,
  error: string | null | undefined,
): string {
  if (!camera) return "EMPTY";
  if (!camera.enabled) return "DISABLED";
  if (error) return "ERROR";
  if (isReady) return "LIVE";
  return camera.liveStatus === "active" ? "READY" : "OFFLINE";
}

function getPlaceholderMessage(
  camera: CameraSettingsRow | null,
  hasPlaybackSource: boolean,
  error: string | null | undefined,
): string {
  if (!camera) return "No camera assigned to this slot.";
  if (!camera.enabled) return "This camera is disabled in camera management.";
  if (error) return error;
  if (camera.sourceType === "device") {
    return "Waiting for local device stream.";
  }
  if (hasPlaybackSource) {
    return "Connecting to managed stream source.";
  }
  return "No stream source is available for this camera.";
}

export function CameraStreamSurface({
  camera,
  isPrimary = false,
  isSelected = false,
  isReady = false,
  error = null,
  sourceRef,
  onSelect,
  onReady,
  onError,
  overlays,
  footer,
}: CameraStreamSurfaceProps): React.JSX.Element {
  const webcamRef = useRef<InstanceType<typeof Webcam> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const isDeviceSource = camera?.sourceType === "device";
  const streamDescriptor = useMemo(
    () => (camera ? describeCameraStreamSource(camera.sourceUrl) : null),
    [camera],
  );
  const playback = useMemo(() => {
    if (!camera || camera.sourceType === "device") {
      return null;
    }

    return buildCameraPlaybackDescriptor(camera.sourceUrl);
  }, [camera]);
  const playbackSrc = playback?.src ?? null;
  const usesVideoElement = playback?.useVideoElement ?? false;
  const selectedDeviceId = isDeviceSource ? camera.sourceKey : null;
  const statusLabel = getStatusLabel(camera, isReady, error);
  const sourceKindLabel = getSourceKindLabel(camera);
  const placeholderMessage = getPlaceholderMessage(
    camera,
    playbackSrc !== null,
    error,
  );

  const streamKey = useMemo(() => {
    if (!camera) return "empty";

    return [
      camera.id,
      camera.sourceType,
      camera.sourceKey,
      camera.sourceUrl,
    ].join("::");
  }, [camera]);

  useEffect(() => {
    if (!sourceRef) return;

    if (!camera) {
      sourceRef.current = null;
      return;
    }

    if (isDeviceSource) {
      sourceRef.current = webcamRef.current;
      return;
    }

    const getScreenshot = () => {
      const imageEl = imageRef.current;
      const videoEl = videoRef.current;
      const sourceEl = videoEl ?? imageEl;

      if (!sourceEl) return null;

      const width = videoEl?.videoWidth ?? imageEl?.naturalWidth ?? VIDEO_W;
      const height = videoEl?.videoHeight ?? imageEl?.naturalHeight ?? VIDEO_H;

      if (width <= 0 || height <= 0) return null;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      try {
        ctx.drawImage(sourceEl, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", 0.8);
      } catch {
        return null;
      }
    };

    sourceRef.current = {
      video: videoRef.current,
      getScreenshot,
    };

    return () => {
      if (sourceRef.current?.video === videoRef.current) {
        sourceRef.current = null;
      }
    };
  }, [camera, isDeviceSource, sourceRef, streamKey]);

  const handleClick = () => {
    if (!camera || !onSelect) return;
    onSelect(camera.id);
  };

  const handleVideoReady = () => {
    onReady?.();
  };

  const handleVideoError = () => {
    onError?.("Video stream unavailable.");
  };

  const handleImageReady = () => {
    onReady?.();
  };

  const handleImageError = () => {
    onError?.("Stream relay unavailable.");
  };

  const chrome = isPrimary ? (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-op-border bg-op-surface px-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[16px] text-op-text-sec">
          videocam
        </span>
        <MonoLabel variant="silver">
          {camera?.cameraId ?? "NO_CAMERA"}
        </MonoLabel>
        {camera?.name && (
          <span className="truncate font-mono text-[10px] uppercase tracking-wider text-op-text-sec">
            {camera.name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {isReady && !error ? (
          <>
            <StatusDot variant="silver" pulse size="xs" />
            <MonoLabel variant="silver">LIVE</MonoLabel>
          </>
        ) : (
          <MonoLabel variant={error ? "critical" : "default"}>
            {statusLabel}
          </MonoLabel>
        )}
      </div>
    </div>
  ) : (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between bg-linear-to-b from-black/90 via-black/35 to-transparent p-1.5">
      <div className="flex flex-col gap-1">
        <span className="bg-black/60 px-1 font-mono text-[9px] text-op-silver">
          {camera?.cameraId ?? "UNASSIGNED"}
        </span>
        {camera?.name && (
          <span className="max-w-40 truncate bg-black/50 px-1 font-mono text-[9px] uppercase tracking-wider text-op-text-sec">
            {camera.name}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="bg-black/60 px-1 font-mono text-[9px] text-op-text-sec">
          {statusLabel}
        </span>
        <span className="bg-black/50 px-1 font-mono text-[9px] text-op-text-sec">
          {sourceKindLabel}
        </span>
      </div>
    </div>
  );

  return (
    <button
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden rounded-sm border border-op-border bg-op-surface text-left",
        !isPrimary && "cursor-pointer transition-colors hover:border-op-silver",
        isSelected &&
          "border-op-silver shadow-[inset_0_0_0_1px_rgba(192,192,192,0.35)]",
      )}
      onClick={handleClick}
      type="button"
    >
      {chrome}

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        {camera ? (
          isDeviceSource && selectedDeviceId ? (
            <Webcam
              key={streamKey}
              ref={webcamRef}
              width={VIDEO_W}
              height={VIDEO_H}
              audio={false}
              mirrored={false}
              screenshotFormat="image/jpeg"
              videoConstraints={{
                width: VIDEO_W,
                height: VIDEO_H,
                deviceId: { exact: selectedDeviceId },
              }}
              onUserMedia={handleVideoReady}
              onUserMediaError={(cause) =>
                onError?.(
                  cause instanceof Error
                    ? cause.message
                    : "Camera access denied or unavailable.",
                )
              }
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                opacity: 0.92,
                filter: isPrimary ? "grayscale(30%)" : "grayscale(45%)",
              }}
            />
          ) : playbackSrc ? (
            <div className="relative h-full w-full">
              {usesVideoElement ? (
                <video
                  key={`${streamKey}::video`}
                  ref={videoRef}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  crossOrigin="anonymous"
                  onCanPlay={handleVideoReady}
                  onLoadedData={handleVideoReady}
                  onError={handleVideoError}
                  src={playbackSrc}
                  className="h-full w-full object-cover"
                  style={{
                    opacity: 0.92,
                    filter: isPrimary ? "grayscale(30%)" : "grayscale(45%)",
                  }}
                />
              ) : (
                <>
                  <img
                    key={`${streamKey}::img`}
                    ref={imageRef}
                    alt={camera.cameraId}
                    onLoad={handleImageReady}
                    onError={handleImageError}
                    src={playbackSrc}
                    className="h-full w-full object-cover"
                    style={{
                      opacity: 0.92,
                      filter: isPrimary ? "grayscale(30%)" : "grayscale(45%)",
                    }}
                  />
                </>
              )}
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black px-4 text-center">
              <span className="material-symbols-outlined text-[32px] text-op-border">
                videocam_off
              </span>
              <MonoLabel variant="default">{statusLabel}</MonoLabel>
              <span className="font-mono text-[10px] text-op-text-sec">
                {placeholderMessage}
              </span>
            </div>
          )
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black px-4 text-center">
            <span className="material-symbols-outlined text-[32px] text-op-border">
              grid_view
            </span>
            <MonoLabel variant="default">UNASSIGNED</MonoLabel>
            <span className="font-mono text-[10px] text-op-text-sec">
              This slot is waiting for an active camera.
            </span>
          </div>
        )}

        {camera && overlays}

        {!isPrimary && camera && (
          <div className="pointer-events-none absolute bottom-2 left-2">
            <MonoLabel size="2xs" className="bg-black/60 px-1.5 py-0.5">
              CLICK TO PROMOTE
            </MonoLabel>
          </div>
        )}

        {isPrimary && footer && (
          <div className="absolute inset-x-0 bottom-0 z-10">{footer}</div>
        )}
      </div>
    </button>
  );
}
