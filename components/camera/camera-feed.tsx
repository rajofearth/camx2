import type * as React from "react";
import { MonoLabel } from "@/components/ui/mono-label";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

interface CameraFeedProps extends React.ComponentProps<"div"> {
  cameraId: string;
  /** Optional image src for the feed */
  src?: string;
  /** Show LIVE indicator */
  live?: boolean;
  /** VLM analysis status */
  vlmStatus?: "NOMINAL" | "ANALYZING" | "THREAT" | "OFFLINE";
  /** Overlay children (bounding boxes, etc.) */
  overlays?: React.ReactNode;
  /** Compact mini-card for grid view */
  mini?: boolean;
}

/**
 * CameraFeed — camera panel with standard header bar, video area, and overlays.
 *
 * Primary variant: 60% width main feed with full header
 * Mini variant: compact grid cell with gradient overlay label
 */
function CameraFeed({
  cameraId,
  src,
  live = false,
  vlmStatus,
  overlays,
  mini = false,
  className,
  children,
  ...props
}: CameraFeedProps) {
  if (mini) {
    return (
      <div
        data-slot="camera-feed"
        data-variant="mini"
        className={cn(
          "relative flex flex-col overflow-hidden rounded-sm border border-op-border bg-op-surface",
          className,
        )}
        {...props}
      >
        {/* Gradient label overlay */}
        <div className="absolute inset-x-0 top-0 z-10 flex justify-between bg-linear-to-b from-black/80 to-transparent p-1.5">
          <span className="bg-black/50 px-1 font-mono text-[9px] text-op-silver">
            {cameraId}
          </span>
        </div>

        {/* Feed / placeholder */}
        {src ? (
          // biome-ignore lint/performance/noImgElement: camera feeds use dynamic runtime stream and preview URLs that should render without Next.js image optimization
          <img
            src={src}
            alt={`Camera ${cameraId}`}
            className="h-full w-full object-cover grayscale opacity-70"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-black">
            <span className="material-symbols-outlined text-[24px] text-op-border">
              videocam_off
            </span>
          </div>
        )}

        {overlays}
      </div>
    );
  }

  const vlmColor = {
    NOMINAL: "text-op-silver",
    ANALYZING: "text-op-warning",
    THREAT: "text-op-critical",
    OFFLINE: "text-op-text-sec",
  }[vlmStatus ?? "NOMINAL"];

  return (
    <div
      data-slot="camera-feed"
      data-variant="primary"
      className={cn(
        "flex flex-col overflow-hidden rounded-sm border border-op-border bg-op-surface",
        className,
      )}
      {...props}
    >
      {/* Header bar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-op-border bg-op-surface px-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-op-text-sec">
            videocam
          </span>
          <MonoLabel variant="silver">{cameraId}</MonoLabel>
        </div>

        {live && (
          <div className="flex items-center gap-1.5">
            <StatusDot variant="silver" pulse size="xs" />
            <MonoLabel variant="silver">LIVE</MonoLabel>
          </div>
        )}
      </div>

      {/* Video area */}
      <div className="group relative flex-1 bg-black">
        {src ? (
          // biome-ignore lint/performance/noImgElement: camera feeds use dynamic runtime stream and preview URLs that should render without Next.js image optimization
          <img
            src={src}
            alt={`Camera ${cameraId}`}
            className="h-full w-full object-cover opacity-80 mix-blend-luminosity"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="material-symbols-outlined text-[48px] text-op-border">
              videocam_off
            </span>
          </div>
        )}

        {/* Bounding box overlays */}
        {overlays}

        {/* VLM status chip */}
        {vlmStatus && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2 border border-op-border bg-op-elevated px-2 py-1">
            <span className="material-symbols-outlined text-[14px] text-op-text-sec">
              neurology
            </span>
            <div className="flex flex-col">
              <MonoLabel size="2xs">VLM_ANALYSIS</MonoLabel>
              <MonoLabel size="xs" className={vlmColor}>
                {vlmStatus}
              </MonoLabel>
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

export { CameraFeed };
