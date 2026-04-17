import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const statusDotVariants = cva(
  "inline-block shrink-0 rounded-full",
  {
    variants: {
      variant: {
        nominal:   "bg-op-nominal border border-[#2A5A38]",
        warning:   "bg-op-warning",
        critical:  "bg-op-critical",
        silver:    "bg-op-silver",
        muted:     "bg-op-text-sec",
        inactive:  "bg-op-border-active",
      },
      size: {
        xs: "size-1",
        sm: "size-1.5",
        default: "size-2",
        lg: "size-2.5",
      },
      pulse: {
        true: "animate-pulse",
        false: "",
      },
    },
    defaultVariants: {
      variant: "nominal",
      size: "sm",
      pulse: false,
    },
  },
)

export interface StatusDotProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof statusDotVariants> {}

function StatusDot({ className, variant, size, pulse, ...props }: StatusDotProps) {
  return (
    <span
      data-slot="status-dot"
      className={cn(statusDotVariants({ variant, size, pulse }), className)}
      {...props}
    />
  )
}

/**
 * StatusIndicator — dot + label pair used in tables and panels.
 * e.g. <StatusIndicator variant="nominal">ACTIVE</StatusIndicator>
 */
function StatusIndicator({
  className,
  variant = "nominal",
  pulse = false,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusDotVariants>) {
  const textColor = {
    nominal:  "text-foreground",
    warning:  "text-op-warning",
    critical: "text-op-critical",
    silver:   "text-op-silver",
    muted:    "text-op-text-sec",
    inactive: "text-op-text-sec",
  }[variant ?? "nominal"]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-xs uppercase",
        textColor,
        className,
      )}
      {...props}
    >
      <StatusDot variant={variant} pulse={pulse ?? false} />
      {children}
    </span>
  )
}

export { StatusDot, StatusIndicator, statusDotVariants }
