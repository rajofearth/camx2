import type * as React from "react";

import { cn } from "@/lib/utils";

interface ModelConfigSectionProps extends React.ComponentProps<"section"> {
  /** Right-side mono meta label (e.g. channel flags) */
  meta?: string;
  title: string;
}

/**
 * Bordered settings panel with mono uppercase title strip (design reference).
 */
export function ModelConfigSection({
  title,
  meta,
  className,
  children,
  ...props
}: ModelConfigSectionProps) {
  return (
    <section
      className={cn(
        "flex flex-col border border-op-border bg-op-surface p-0",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-op-border px-6 py-3">
        <h3 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-white">
          <span className="size-1.5 bg-op-silver" aria-hidden />
          {title}
        </h3>
        {meta ? (
          <span className="font-mono text-[9px] text-op-text-sec">{meta}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
