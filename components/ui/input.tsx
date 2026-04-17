import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-7 w-full min-w-0 rounded-sm border border-op-border bg-op-base px-2.5 py-1 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-op-text-sec focus:border-op-silver disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-op-critical",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
