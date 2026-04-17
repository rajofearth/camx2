import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * IntelLog — the scrolling terminal-style event stream.
 * Wraps a list of IntelLogEntry rows.
 */
function IntelLog({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="intel-log"
      className={cn(
        "flex flex-col gap-1.5 overflow-y-auto font-mono text-[10px]",
        className,
      )}
      {...props}
    />
  )
}

type LogSource = "SYS" | "VLM" | string

interface IntelLogEntryProps extends React.ComponentProps<"div"> {
  timestamp: string
  source: LogSource
  message: React.ReactNode
  /** Dim the row (old/processed events) */
  dimmed?: boolean
  /** Animate the cursor (last/live entry) */
  cursor?: boolean
}

function IntelLogEntry({
  timestamp,
  source,
  message,
  dimmed = false,
  cursor = false,
  className,
  ...props
}: IntelLogEntryProps) {
  const sourceColor =
    source === "SYS"
      ? "text-op-text-sec"
      : source === "VLM"
        ? "text-op-silver"
        : "text-op-silver"

  return (
    <div
      data-slot="intel-log-entry"
      className={cn(
        "flex gap-2 leading-relaxed",
        dimmed && "opacity-50",
        className,
      )}
      {...props}
    >
      {cursor ? (
        <span className="w-16 animate-pulse text-op-text-sec">_</span>
      ) : (
        <>
          <span className="w-16 shrink-0 text-op-text-sec">[{timestamp}]</span>
          <span className={cn("w-12 shrink-0", sourceColor)}>{source}</span>
          <span className="text-foreground">{message}</span>
        </>
      )}
    </div>
  )
}

/**
 * IntelTag — inline highlighted entity tag within a log message.
 * e.g. <IntelTag>PERSON</IntelTag>
 */
function IntelTag({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "border border-op-border bg-op-elevated px-1 font-mono text-[10px] uppercase",
        className,
      )}
      {...props}
    />
  )
}

export { IntelLog, IntelLogEntry, IntelTag }
