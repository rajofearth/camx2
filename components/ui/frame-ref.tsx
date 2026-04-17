import * as React from "react"

import { cn } from "@/lib/utils"

interface FrameRefProps extends React.ComponentProps<"div"> {
  /** Frame identifier label (e.g. "LDK_CAM_04_A") */
  id: string
  /** Thumbnail image src */
  src?: string
  /** Alt text for thumbnail */
  alt?: string
  /** Border color on thumbnail overlay — matches threat variant */
  variant?: "default" | "warning" | "critical"
}

/**
 * FrameRef — clickable VLM frame reference chip.
 * Shows a thumbnail, frame ID, and an external link icon.
 * Used inside AI chat responses to reference specific captured frames.
 */
function FrameRef({
  id,
  src,
  alt = "Security frame capture",
  variant = "default",
  className,
  ...props
}: FrameRefProps) {
  const overlayColor = {
    default:  "border-op-silver",
    warning:  "border-op-warning",
    critical: "border-op-critical",
  }[variant]

  return (
    <div
      data-slot="frame-ref"
      className={cn(
        "inline-flex w-fit cursor-pointer items-center gap-3 border border-op-border bg-op-elevated p-2 transition-colors hover:border-op-border-active",
        className,
      )}
      role="button"
      tabIndex={0}
      {...props}
    >
      {/* Thumbnail */}
      <div className="relative size-16 h-10 shrink-0 overflow-hidden bg-op-border">
        {src && (
          <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover opacity-70 mix-blend-luminosity"
          />
        )}
        {/* Threat overlay border inside thumbnail */}
        <div className={cn("absolute inset-1 border", overlayColor)} />
      </div>

      {/* Labels */}
      <div className="flex flex-col">
        <span className="font-mono text-[9px] uppercase text-op-text-sec">
          FRAME REF
        </span>
        <span className="font-mono text-[11px] text-op-silver">{id}</span>
      </div>

      {/* External link */}
      <span className="material-symbols-outlined ml-2 text-[14px] text-op-text-sec">
        open_in_new
      </span>
    </div>
  )
}

export { FrameRef }
