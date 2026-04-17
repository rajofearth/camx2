import * as React from "react"

import { cn } from "@/lib/utils"

interface ConfidenceBarProps extends React.ComponentProps<"div"> {
  /** 0–100 */
  value: number
  /** Show the numeric label */
  showLabel?: boolean
  /** Color variant based on confidence level or explicit override */
  variant?: "auto" | "silver" | "warning" | "critical" | "muted"
  /** Bar height — defaults to thin (h-0.5) */
  thick?: boolean
}

function ConfidenceBar({
  value,
  showLabel = true,
  variant = "auto",
  thick = false,
  className,
  ...props
}: ConfidenceBarProps) {
  const clamped = Math.min(100, Math.max(0, value))

  const resolvedVariant =
    variant === "auto"
      ? clamped >= 90
        ? "silver"
        : clamped >= 70
          ? "warning"
          : "muted"
      : variant

  const fillColor = {
    silver:   "bg-op-silver",
    warning:  "bg-op-warning",
    critical: "bg-op-critical",
    muted:    "bg-op-text-sec",
  }[resolvedVariant]

  const labelColor = {
    silver:   "text-op-silver",
    warning:  "text-op-warning",
    critical: "text-op-critical",
    muted:    "text-op-text-sec",
  }[resolvedVariant]

  return (
    <div
      data-slot="confidence-bar"
      className={cn("flex items-center gap-2", className)}
      {...props}
    >
      {showLabel && (
        <span className={cn("w-8 font-mono text-[10px] tabular-nums", labelColor)}>
          {clamped}%
        </span>
      )}
      <div className={cn("flex-1 bg-op-text-muted", thick ? "h-1" : "h-0.5")}>
        <div
          className={cn("h-full transition-all duration-300", fillColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

export { ConfidenceBar }
