export function RegistryStatusFooter() {
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-op-border bg-op-base px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 bg-op-nominal" />
          <span className="font-mono text-[8px] uppercase text-op-text-sec">
            VLM ENGINE: NOMINAL
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 bg-op-nominal" />
          <span className="font-mono text-[8px] uppercase text-op-text-sec">
            DB CONNECTED: SECURE
          </span>
        </div>
      </div>
      <div className="font-mono text-[8px] text-op-text-muted">
        CAMX2_OS_V4.2 // SYSTEM_TIME: 2024-05-22 14:48:02 // LATENCY: 12ms
      </div>
    </footer>
  );
}
