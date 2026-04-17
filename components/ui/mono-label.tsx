import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const monoLabelVariants = cva(
  "font-mono uppercase tracking-widest leading-none",
  {
    variants: {
      variant: {
        default:  "text-op-text-sec",
        silver:   "text-op-silver",
        muted:    "text-op-text-muted",
        warning:  "text-op-warning",
        critical: "text-op-critical",
        nominal:  "text-op-nominal",
        primary:  "text-foreground",
      },
      size: {
        "2xs": "text-[8px]",
        xs:    "text-[10px]",
        sm:    "text-xs",
        default: "text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "xs",
    },
  },
)

function MonoLabel({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof monoLabelVariants>) {
  return (
    <span
      data-slot="mono-label"
      className={cn(monoLabelVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { MonoLabel, monoLabelVariants }
