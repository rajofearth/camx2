import { cpus } from "node:os";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Approximate total CPU usage (all cores) for the host running the Next.js server.
 * Uses two `os.cpus()` samples; Windows-compatible (unlike `loadavg()`).
 */
export async function GET() {
  const start = cpus();
  await sleep(280);
  const end = cpus();

  let idleDiff = 0;
  let totalDiff = 0;

  for (let i = 0; i < start.length; i++) {
    const s = start[i].times;
    const e = end[i].times;
    idleDiff += e.idle - s.idle;
    totalDiff +=
      e.user -
      s.user +
      (e.nice - s.nice) +
      (e.sys - s.sys) +
      (e.idle - s.idle) +
      (e.irq - s.irq);
  }

  const load = totalDiff > 0 ? Math.round(100 * (1 - idleDiff / totalDiff)) : 0;

  return NextResponse.json({
    load: Math.min(100, Math.max(0, load)),
  });
}
