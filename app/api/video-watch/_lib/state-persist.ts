import { ensureCacheDir, writeJson } from "./cache";
import { statePath } from "./paths";
import type { InternalJob, PersistedState } from "./types-internal";

export async function persistState(job: InternalJob): Promise<void> {
  const cacheDir = await ensureCacheDir(job.fingerprint);
  const state: PersistedState = {
    jobId: job.id,
    fingerprint: job.fingerprint,
    sourceFileName: job.sourceFileName,
    totalFrames: job.totalFrames,
    analyzedFrames: job.analyzedFrames,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
    ...(job.lmRuntime ? { lmRuntime: job.lmRuntime } : {}),
  };
  await writeJson(statePath(cacheDir), state);
}
