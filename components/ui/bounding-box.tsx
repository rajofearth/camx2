import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const boundingBoxVariants = cva(
  "absolute pointer-events-none border bg-transparent",
  {
    variants: {
      variant: {
        // Silver/nominal — standard YOLO detection
        default:  "border-op-silver bg-op-silver/10",
        // Nominal green — confirmed safe
        nominal:  "border-op-nominal bg-op-nominal/10",
        // Warning amber — suspicious
        warning:  "border-op-warning bg-op-warning/10",
        // Critical red — threat / unauthorized
        critical: "border-op-critical bg-op-critical/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

interface BoundingBoxProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof boundingBoxVariants> {
  /** Label shown above the box (e.g. "PERSON 98%") */
  label?: string
  /** Show crosshair lines (used in alert modal) */
  crosshair?: boolean
}

function BoundingBox({
  variant,
  label,
  crosshair = false,
  className,
  children,
  ...props
}: BoundingBoxProps) {
  const labelColor = {
    default:  "border-op-silver bg-op-elevated text-op-silver",
    nominal:  "border-op-nominal bg-op-elevated text-foreground",
    warning:  "border-op-warning bg-op-elevated text-op-warning",
    critical: "border-op-critical bg-op-critical text-foreground",
  }[variant ?? "default"]

  return (
    <div
      data-slot="bounding-box"
      className={cn(boundingBoxVariants({ variant }), className)}
      {...props}
    >
      {label && (
        <div
          className={cn(
            "absolute -top-5 left-[-1px] border px-1 py-0.5 font-mono text-[9px] uppercase leading-none",
            labelColor,
          )}
        >
          {label}
        </div>
      )}

      {crosshair && (
        <>
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-current opacity-40" />
          <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current opacity-40" />
        </>
      )}

      {children}
    </div>
  )
}

export { BoundingBox, boundingBoxVariants }
