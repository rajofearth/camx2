import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Panel — the universal surface container.
 * bg-op-surface, 1px border-op-border, rounded-sm (2px).
 * Composes with PanelHeader + PanelContent for the standard panel layout.
 */
function Panel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel"
      className={cn(
        "flex flex-col overflow-hidden rounded-sm border border-op-border bg-op-surface",
        className,
      )}
      {...props}
    />
  )
}

/**
 * PanelHeader — fixed-height top bar for panels.
 * Mono uppercase label on the left, optional right slot.
 * Standard sizes: sm (h-8) | default (h-10).
 */
function PanelHeader({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & { size?: "sm" | "default" }) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex shrink-0 items-center justify-between border-b border-op-border bg-op-elevated px-3",
        size === "sm" ? "h-8" : "h-10",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * PanelLabel — mono uppercase label used inside PanelHeader.
 */
function PanelLabel({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="panel-label"
      className={cn(
        "font-mono text-[10px] uppercase tracking-widest text-op-text-sec",
        className,
      )}
      {...props}
    />
  )
}

/**
 * PanelContent — scrollable flex-1 inner area.
 */
function PanelContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-content"
      className={cn("flex-1 overflow-auto p-3", className)}
      {...props}
    />
  )
}

export { Panel, PanelHeader, PanelLabel, PanelContent }
