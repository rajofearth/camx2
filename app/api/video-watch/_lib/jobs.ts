import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import type { PersistedLmJobRuntime } from "@/app/lib/lm-studio-runtime";
import type {
  VideoWatchJob,
  VideoWatchSummary,
} from "@/app/lib/video-watch-types";
import {
  computeProcessingVersionHash,
  ensureCacheDir,
  fileExists,
  findFingerprintByJobId,
  hashVideoBuffer,
  readJson,
  removeCacheDir,
} from "./cache";
import { CACHE_ROOT } from "./config";
import { runFrameQueue } from "./frame-analysis";
import { defaultJobRuntimeFromEnv } from "./lm-runtime-defaults";
import { statePath, summaryPath, versionPath, videoPath } from "./paths";
import { persistState } from "./state-persist";
import type {
  InternalJob,
  PersistedState,
  PersistedSummaryFile,
} from "./types-internal";
import { extractFrames } from "./video-extract";
import { finalizeJob } from "./video-synthesis";

const jobsById = new Map<string, InternalJob>();
const jobsByFingerprint = new Map<string, InternalJob>();

export function removeJobFromMemory(job?: InternalJob): void {
  if (!job) return;
  jobsById.delete(job.id);
  jobsByFingerprint.delete(job.fingerprint);
}

function toPublicJob(job: InternalJob): VideoWatchJob {
  return {
    ok: true,
    jobId: job.id,
    status: job.status,
    fingerprint: job.fingerprint,
    sourceFileName: job.sourceFileName,
    totalFrames: job.totalFrames,
    analyzedFrames: job.analyzedFrames,
    cache: job.cache,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    summary: job.summary,
    error: job.error,
  };
}

export async function loadJobFromDisk(
  fingerprint: string,
): Promise<InternalJob | null> {
  const cacheDir = await ensureCacheDir(fingerprint);
  const [currentVersion, storedVersion] = await Promise.all([
    computeProcessingVersionHash(),
    fs.readFile(versionPath(cacheDir), "utf8").catch(() => null),
  ]);
  if (storedVersion?.trim() !== currentVersion) {
    await removeCacheDir(fingerprint);
    return null;
  }
  const [state, summaryFile] = await Promise.all([
    readJson<PersistedState>(statePath(cacheDir)),
    readJson<PersistedSummaryFile>(summaryPath(cacheDir)),
  ]);
  if (!state) return null;
  const job: InternalJob = {
    id: state.jobId,
    fingerprint: state.fingerprint,
    sourceFileName: state.sourceFileName,
    status: state.status,
    totalFrames: state.totalFrames,
    analyzedFrames: state.analyzedFrames,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    cache: { fingerprint, cacheHit: true, source: "disk" },
    error: state.error,
    summary: summaryFile?.summary,
    lmRuntime: state.lmRuntime ?? defaultJobRuntimeFromEnv(),
  };
  jobsById.set(job.id, job);
  jobsByFingerprint.set(job.fingerprint, job);
  return job;
}

async function processVideoJob(
  job: InternalJob,
  sourceVideoPath: string,
  sourceByteLength: number,
): Promise<void> {
  try {
    job.status = "extracting";
    job.updatedAt = new Date().toISOString();
    await persistState(job);

    const manifest = await extractFrames(
      job.fingerprint,
      sourceVideoPath,
      job.sourceFileName,
      sourceByteLength,
    );

    job.totalFrames = manifest.frameCount;
    job.status = "analyzing";
    job.updatedAt = new Date().toISOString();
    await persistState(job);

    await runFrameQueue(job, manifest);

    job.status = "combining";
    job.updatedAt = new Date().toISOString();
    await persistState(job);

    await finalizeJob(job, manifest);
  } catch (error) {
    job.status = "error";
    job.error =
      error instanceof Error ? error.message : "Unknown video watch error";
    job.updatedAt = new Date().toISOString();
    await persistState(job);
  }
}

export async function createOrResumeVideoJob(input: {
  readonly sourceFileName: string;
  readonly videoBuffer: Buffer;
  readonly clientFingerprint?: string | null;
  readonly forceRefresh?: boolean;
  readonly lmRuntime?: PersistedLmJobRuntime | null;
}): Promise<VideoWatchJob> {
  await fs.mkdir(CACHE_ROOT, { recursive: true });

  const fingerprint = await hashVideoBuffer(input.videoBuffer);
  const processingVersion = await computeProcessingVersionHash();
  let existingJob =
    jobsByFingerprint.get(fingerprint) ?? (await loadJobFromDisk(fingerprint));

  if (
    input.clientFingerprint &&
    input.clientFingerprint.length > 0 &&
    input.clientFingerprint !== fingerprint
  ) {
    throw new Error("Client fingerprint did not match uploaded video bytes");
  }

  if (input.forceRefresh) {
    removeJobFromMemory(existingJob ?? undefined);
    await removeCacheDir(fingerprint);
    existingJob = null;
  }

  if (existingJob?.status === "completed" && existingJob.summary) {
    existingJob.cache = {
      fingerprint,
      cacheHit: true,
      source: existingJob.cache.source === "memory" ? "memory" : "disk",
    };
    existingJob.updatedAt = new Date().toISOString();
    return toPublicJob(existingJob);
  }

  if (existingJob?.runPromise) {
    existingJob.cache = { fingerprint, cacheHit: true, source: "memory" };
    return toPublicJob(existingJob);
  }

  const cacheDir = await ensureCacheDir(fingerprint);
  await fs.writeFile(versionPath(cacheDir), processingVersion, "utf8");
  const targetVideoPath = videoPath(cacheDir, input.sourceFileName);
  if (!(await fileExists(targetVideoPath))) {
    await fs.writeFile(targetVideoPath, input.videoBuffer);
  }

  const runtime =
    input.lmRuntime ?? existingJob?.lmRuntime ?? defaultJobRuntimeFromEnv();

  const job =
    existingJob ??
    ({
      id: randomUUID(),
      fingerprint,
      sourceFileName: input.sourceFileName,
      status: "uploading",
      totalFrames: 0,
      analyzedFrames: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cache: { fingerprint, cacheHit: false, source: "upload" },
      lmRuntime: runtime,
    } as InternalJob);

  job.lmRuntime = runtime;
  job.sourceFileName = input.sourceFileName;
  job.updatedAt = new Date().toISOString();
  jobsById.set(job.id, job);
  jobsByFingerprint.set(fingerprint, job);
  await persistState(job);

  job.runPromise = processVideoJob(
    job,
    targetVideoPath,
    input.videoBuffer.length,
  )
    .catch(() => {})
    .finally(() => {
      job.runPromise = undefined;
    });

  return toPublicJob(job);
}

export async function clearVideoJobCache(input: {
  readonly jobId?: string | null;
  readonly fingerprint?: string | null;
}): Promise<string | null> {
  const fingerprint =
    input.fingerprint ||
    (input.jobId ? await findFingerprintByJobId(input.jobId) : null);
  if (!fingerprint) return null;
  removeJobFromMemory(jobsByFingerprint.get(fingerprint));
  await removeCacheDir(fingerprint);
  return fingerprint;
}

export async function getVideoJobStatus(input: {
  readonly jobId?: string | null;
  readonly fingerprint?: string | null;
}): Promise<VideoWatchJob | null> {
  const jobById = input.jobId ? jobsById.get(input.jobId) : undefined;
  if (jobById) return toPublicJob(jobById);

  const jobByFingerprint = input.fingerprint
    ? jobsByFingerprint.get(input.fingerprint)
    : undefined;
  if (jobByFingerprint) return toPublicJob(jobByFingerprint);

  const fingerprint =
    input.fingerprint ||
    (input.jobId ? await findFingerprintByJobId(input.jobId) : null);
  if (!fingerprint) return null;
  const loaded = await loadJobFromDisk(fingerprint);
  return loaded ? toPublicJob(loaded) : null;
}

// Returns summary for a given jobId from memory or disk.
export async function readSummaryForJob(
  jobId: string,
): Promise<VideoWatchSummary | null> {
  const job = jobsById.get(jobId);
  if (job?.summary) return job.summary;
  const fingerprint = await findFingerprintByJobId(jobId);
  const target =
    job ?? (fingerprint ? await loadJobFromDisk(fingerprint) : null);
  return target?.summary ?? null;
}

/** LM runtime persisted for the job (memory or disk) — for chat after reload. */
export async function getJobLmRuntimeForChat(
  jobId: string,
): Promise<PersistedLmJobRuntime> {
  const mem = jobsById.get(jobId);
  if (mem?.lmRuntime) return mem.lmRuntime;
  const fp = await findFingerprintByJobId(jobId);
  if (!fp) return defaultJobRuntimeFromEnv();
  const cacheDir = await ensureCacheDir(fp);
  const state = await readJson<PersistedState>(statePath(cacheDir));
  return state?.lmRuntime ?? defaultJobRuntimeFromEnv();
}
