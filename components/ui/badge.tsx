import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Base: sharp, flat, mono font, uppercase — Operational Goth aesthetic
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        // Default: silver fill — primary label
        default:
          "border-transparent bg-op-silver text-op-base",
        // Neutral/muted — category tags, zone labels
        muted:
          "border-op-border-active bg-op-elevated text-op-text-sec",
        // Bordered neutral — generic outlined
        outline:
          "border-op-border bg-transparent text-foreground",
        // Nominal / active — green status
        nominal:
          "border-transparent bg-op-nominal text-foreground",
        // Nominal outline — active status with dot
        "outline-nominal":
          "border-op-nominal bg-transparent text-op-nominal",
        // Warning — amber threat level
        warning:
          "border-transparent bg-op-warning/20 text-op-warning",
        // Warning outline — loitering, suspected
        "outline-warning":
          "border-op-warning bg-transparent text-op-warning",
        // Critical — red threat / offline
        critical:
          "border-transparent bg-op-critical text-foreground",
        // Critical outline — unauthorized, breach
        "outline-critical":
          "border-op-critical bg-transparent text-foreground",
        // Secondary (destructive-style, softer)
        destructive:
          "border-op-critical/50 bg-op-critical/10 text-foreground",
        // Alias kept for backward-compat with data-table components
        secondary:
          "border-op-border-active bg-op-elevated text-op-text-sec",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
