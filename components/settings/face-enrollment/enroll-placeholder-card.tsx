"use client";

export function EnrollPlaceholderCard({
  onOpenEnroll,
}: {
  onOpenEnroll: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpenEnroll}
      className="group flex cursor-pointer items-center justify-center border border-dashed border-op-border bg-op-surface p-8 text-center transition-colors hover:bg-op-elevated"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-op-border transition-colors group-hover:border-op-silver">
          <span className="material-symbols-outlined text-[32px] text-op-text-sec transition-colors group-hover:text-op-silver">
            add
          </span>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-op-text-sec transition-colors group-hover:text-foreground">
            Enroll New Subject
          </p>
          <p className="mt-1 font-mono text-[9px] text-op-text-muted">
            DRAG &amp; DROP IMAGE OR CLICK
          </p>
        </div>
      </div>
    </button>
  );
}
