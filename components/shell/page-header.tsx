import * as React from "react"

import { cn } from "@/lib/utils"

interface PageHeaderProps extends React.ComponentProps<"header"> {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

/**
 * PageHeader — page title bar with subtitle and right-side action buttons.
 * Used at the top of main content areas (Camera Management, Threat Log, etc.).
 */
function PageHeader({ title, subtitle, actions, className, ...props }: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex shrink-0 items-end justify-between border-b border-op-border px-6 py-5",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="font-mono text-xs text-op-text-sec">{subtitle}</p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-3">{actions}</div>
      )}
    </header>
  )
}

export { PageHeader }
