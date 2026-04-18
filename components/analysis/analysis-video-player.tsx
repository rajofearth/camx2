"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MonoLabel } from "@/components/ui/mono-label";
import { cn } from "@/lib/utils";

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;
}

export function AnalysisVideoPlayer({
  src,
  title,
  overlays,
  statusLabel = "REC",
  timelineMarkers = [],
  className,
}: {
  readonly src: string | null;
  readonly title: string;
  readonly overlays?: React.ReactNode;
  readonly statusLabel?: string;
  readonly timelineMarkers?: readonly number[];
  readonly className?: string;
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const handleLoadedMetadata = () => {
      setDuration(videoElement.duration || 0);
    };
    const handleTimeUpdate = () => {
      setCurrentTime(videoElement.currentTime || 0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", handlePause);

    return () => {
      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("play", handlePlay);
      videoElement.removeEventListener("pause", handlePause);
    };
  }, []);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    videoElement.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || src) {
      return;
    }

    videoElement.pause();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  const progressPercentage = useMemo(() => {
    if (duration <= 0) {
      return 0;
    }

    return Math.min(100, (currentTime / duration) * 100);
  }, [currentTime, duration]);

  const togglePlayback = async () => {
    const videoElement = videoRef.current;
    if (!videoElement || !src) {
      return;
    }

    if (videoElement.paused) {
      await videoElement.play();
      return;
    }

    videoElement.pause();
  };

  const handleTimelineChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const nextValue = Number(event.target.value);
    videoElement.currentTime = nextValue;
    setCurrentTime(nextValue);
  };

  const toggleFullscreen = async () => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await videoElement.requestFullscreen();
  };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-sm border border-op-border bg-op-surface",
        className,
      )}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-linear-to-b from-black/80 via-black/35 to-transparent px-3 py-2">
          <MonoLabel variant="silver">{title}</MonoLabel>
          <div className="inline-flex items-center gap-1.5 border border-op-critical/40 bg-op-base/80 px-2 py-1">
            <span className="size-2 animate-pulse rounded-full bg-op-critical" />
            <MonoLabel variant="critical">{statusLabel}</MonoLabel>
          </div>
        </div>

        {src ? (
          <>
            {/* biome-ignore lint/a11y/useMediaCaption: analysis preview videos are user-supplied evidence clips without authored caption tracks */}
            <video
              ref={videoRef}
              src={src}
              className="h-full w-full object-contain grayscale"
              playsInline
              preload="metadata"
            />
          </>
        ) : (
          <div className="flex h-full min-h-80 w-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="material-symbols-outlined text-5xl text-op-text-muted">
                video_library
              </span>
              <MonoLabel className="text-op-text-sec">
                Attach a source video to preview analysis playback.
              </MonoLabel>
            </div>
          </div>
        )}

        {src ? (
          <div className="pointer-events-none absolute inset-0">{overlays}</div>
        ) : null}
      </div>

      {/* Scrubber Console – h-12 compact strip matching reference */}
      <div className="h-12 bg-op-base border-t border-op-border flex flex-col px-4 justify-center gap-1 shrink-0">
        {/* Timeline bar */}
        <div className="relative h-2 bg-op-border-active w-full rounded-full overflow-hidden cursor-pointer">
          {/* Played track */}
          <div
            className="absolute top-0 left-0 h-full bg-op-silver rounded-full"
            style={{ width: `${progressPercentage}%` }}
          />
          {/* Threat markers – variable widths matching reference */}
          {timelineMarkers.map((marker, i) => (
            <div
              key={marker}
              className={`absolute top-0 h-full bg-op-critical pointer-events-none ${
                i === 0 ? "w-px" : i === 1 ? "w-1.75" : "w-px"
              }`}
              style={{ left: `${marker}%` }}
            />
          ))}
          {/* Seek range (invisible, overlay for interaction) */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={handleTimelineChange}
            disabled={!src || duration <= 0}
            className="absolute inset-0 h-2 w-full cursor-pointer appearance-none bg-transparent opacity-0"
          />
        </div>

        {/* Controls + timestamps */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void togglePlayback();
              }}
              disabled={!src}
              className="text-foreground hover:text-op-silver disabled:opacity-40 flex items-center"
            >
              <span className="material-symbols-outlined text-[20px]">
                {isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>
            <span className="font-mono text-[10px] text-foreground">
              {formatVideoTime(currentTime)}
            </span>
            <span className="font-mono text-[10px] text-op-text-sec">
              / {formatVideoTime(duration)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              disabled={!src}
              className="text-op-text-sec hover:text-foreground disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isMuted ? "volume_off" : "volume_up"}
              </span>
            </button>
            <button
              type="button"
              disabled
              className="text-op-text-sec hover:text-foreground disabled:opacity-40"
              title="Speed (not implemented)"
            >
              <span className="material-symbols-outlined text-[16px]">
                speed
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                void toggleFullscreen();
              }}
              disabled={!src}
              className="text-op-text-sec hover:text-foreground disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">
                fullscreen
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
