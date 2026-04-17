"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { StatusDot } from "./status-dot"

interface SessionCardProps extends React.ComponentProps<"div"> {
  title: string
  timestamp: string
  messageCount: number
  /** Active session (silver border + elevated bg) */
  active?: boolean
  /** Status of the session */
  status?: "nominal" | "warning" | "critical" | "inactive"
  onMore?: (e: React.MouseEvent) => void
}

function SessionCard({
  title,
  timestamp,
  messageCount,
  active = false,
  status = "inactive",
  onMore,
  className,
  ...props
}: SessionCardProps) {
  return (
    <div
      data-slot="session-card"
      className={cn(
        "cursor-pointer rounded-sm border p-3.5 transition-all duration-75",
        active
          ? "border-op-silver bg-op-elevated hover:border-white"
          : "border-op-border bg-transparent hover:border-op-border-active hover:bg-op-elevated/70",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 font-mono text-[13px] leading-snug text-foreground">
          {title}
        </span>
        <button
          className="shrink-0 text-op-text-sec hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onMore?.(e)
          }}
          aria-label="More options"
        >
          <span className="material-symbols-outlined text-[16px]">more_vert</span>
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-op-text-sec">
        <span>{timestamp}</span>
        <span className="flex items-center gap-1">
          {status !== "inactive" && (
            <StatusDot variant={status} size="xs" />
          )}
          {messageCount} MSGS
        </span>
      </div>
    </div>
  )
}

export { SessionCard }
