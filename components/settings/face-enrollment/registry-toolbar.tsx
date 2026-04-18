import Link from "next/link";

export function RegistryToolbar({
  totalEntries,
  onExportCsv,
  onEnroll,
}: {
  totalEntries: number;
  onExportCsv: () => void;
  onEnroll: () => void;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-op-border bg-op-surface px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-medium uppercase tracking-tight text-foreground">
          Enrollment Registry
        </h1>
        <span className="border border-op-border bg-op-elevated px-2 py-0.5 font-mono text-[10px] text-op-text-sec">
          TOTAL_ENTRIES: {totalEntries.toLocaleString("en-US")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          className="flex items-center gap-2 border border-op-border px-3 py-1.5 font-sans text-[10px] font-bold uppercase tracking-widest text-op-text-sec transition-colors hover:bg-op-elevated hover:text-foreground"
          href="/settings/face-enrollment/conflict"
        >
          <span className="material-symbols-outlined text-[16px]">
            upload_file
          </span>
          IMPORT CSV
        </Link>
        <button
          type="button"
          onClick={onExportCsv}
          className="flex items-center gap-2 border border-op-border px-3 py-1.5 font-sans text-[10px] font-bold uppercase tracking-widest text-op-text-sec transition-colors hover:bg-op-elevated hover:text-foreground"
        >
          <span className="material-symbols-outlined text-[16px]">
            download
          </span>
          EXPORT CSV
        </button>
        <button
          type="button"
          onClick={onEnroll}
          className="flex items-center gap-2 bg-op-silver px-4 py-1.5 font-sans text-[10px] font-bold uppercase tracking-widest text-op-base transition-colors hover:bg-white"
        >
          <span className="material-symbols-outlined text-[16px]">
            person_add
          </span>
          ENROLL NEW SUBJECT
        </button>
      </div>
    </div>
  );
}
