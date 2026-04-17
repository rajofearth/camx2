import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base: flat, sharp corners, mono font, fast transition — Operational Goth aesthetic
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border font-mono text-xs uppercase tracking-wider whitespace-nowrap transition-colors duration-75 outline-none select-none focus-visible:ring-1 focus-visible:ring-op-silver disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        // Silver fill — primary CTAs (ADD, CONFIRM, DISPATCH)
        default:
          "border-transparent bg-op-silver text-op-base hover:bg-white active:bg-op-silver",
        // Bordered, transparent — secondary actions (SYNC, EXPORT)
        outline:
          "border-op-border bg-transparent text-foreground hover:bg-op-elevated hover:border-op-border-active",
        // Elevated fill — acknowledgement / muted actions
        secondary:
          "border-op-border bg-op-elevated text-foreground hover:bg-muted hover:border-op-border-active",
        // No border, no fill — icon buttons, ghost actions
        ghost:
          "border-transparent bg-transparent text-op-text-sec hover:bg-op-elevated hover:text-foreground",
        // Critical / destructive — DISPATCH, hard-delete
        destructive:
          "border-transparent bg-op-critical text-foreground hover:bg-red-900 active:bg-op-critical",
        // Text link
        link: "border-transparent bg-transparent text-op-silver underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 px-4",
        sm: "h-6 px-3 text-[10px]",
        lg: "h-9 px-6",
        icon: "size-7 p-0",
        "icon-sm": "size-6 p-0",
        "icon-lg": "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
