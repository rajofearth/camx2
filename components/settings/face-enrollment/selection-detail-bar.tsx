import { cn } from "@/lib/utils";
import { watchlistDetailClass } from "./threat-styles";
import type { EnrollmentSubject } from "./types";

export function SelectionDetailBar({
  subject,
  onViewDossier,
}: {
  subject: EnrollmentSubject | null;
  onViewDossier: () => void;
}) {
  if (!subject) {
    return (
      <div className="flex h-20 shrink-0 items-center border-t border-op-border bg-op-surface px-6">
        <p className="font-mono text-[10px] uppercase text-op-text-sec">
          Selected: none
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-20 shrink-0 items-center gap-6 border-t border-op-border bg-op-surface px-6">
      <div className="flex items-center gap-4 border-r border-op-border pr-6">
        <span className="font-mono text-[10px] uppercase text-op-text-sec">
          Selected:
        </span>
        <span className="font-mono text-xs font-bold text-op-silver">
          {subject.uid}
        </span>
      </div>
      <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-8 overflow-x-auto">
        <div className="flex flex-col">
          <span className="font-mono text-[8px] uppercase text-op-text-sec">
            Subject
          </span>
          <span className="font-mono text-[11px] text-foreground">
            {subject.name.toUpperCase()}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono text-[8px] uppercase text-op-text-sec">
            Watchlist
          </span>
          <span
            className={cn(
              "font-mono text-[11px] font-bold",
              watchlistDetailClass(subject.threatLevel),
            )}
          >
            {subject.watchlistCode}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono text-[8px] uppercase text-op-text-sec">
            Aliases
          </span>
          <span className="font-mono text-[11px] text-op-silver">
            {subject.aliasesDetail}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono text-[8px] uppercase text-op-text-sec">
            Last Seen
          </span>
          <span className="font-mono text-[11px] text-op-silver">
            {subject.lastSeen}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onViewDossier}
          className="border border-op-border px-3 py-1.5 font-sans text-[10px] font-bold uppercase tracking-widest text-op-silver transition-colors hover:bg-op-elevated"
        >
          View Dossier
        </button>
        <button
          type="button"
          className="border border-op-border px-3 py-1.5 font-sans text-[10px] font-bold uppercase tracking-widest text-op-critical transition-colors hover:bg-op-critical/10"
        >
          Issue Alert
        </button>
      </div>
    </div>
  );
}
