import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  JobReference,
  PersistedJobState,
  PersistedManifest,
  PersistedSummary,
} from "@/lib/video-analysis/types";

export const VIDEO_ANALYSIS_SCHEMA_VERSION = 1;
export const VIDEO_ANALYSIS_PIPELINE_VERSION =
  "video-watch-v1-stateful-rag-square-png-1fps";
export const VIDEO_ANALYSIS_ROOT = path.join(
  process.cwd(),
  "data",
  "video-watch",
  "v1",
);

function fingerprintRoot(fingerprint: string): string {
  return path.join(VIDEO_ANALYSIS_ROOT, "jobs", fingerprint);
}

export function refsRoot(): string {
  return path.join(VIDEO_ANALYSIS_ROOT, "refs");
}

export function byJobIdPath(jobId: string): string {
  return path.join(refsRoot(), "by-job-id", `${jobId}.json`);
}

export function byFingerprintPath(fingerprint: string): string {
  return path.join(refsRoot(), "by-fingerprint", `${fingerprint}.json`);
}

export function statePath(fingerprint: string): string {
  return path.join(fingerprintRoot(fingerprint), "state.json");
}

export function manifestPath(fingerprint: string): string {
  return path.join(fingerprintRoot(fingerprint), "manifest.json");
}

export function summaryPath(fingerprint: string): string {
  return path.join(fingerprintRoot(fingerprint), "timeline", "summary.json");
}

export function compactTimelinePath(fingerprint: string): string {
  return path.join(fingerprintRoot(fingerprint), "timeline", "compact.json");
}

export function registryPath(fingerprint: string): string {
  return path.join(fingerprintRoot(fingerprint), "timeline", "registry.json");
}

export function framesDir(fingerprint: string): string {
  return path.join(fingerprintRoot(fingerprint), "frames");
}

export function analysesDir(fingerprint: string): string {
  return path.join(fingerprintRoot(fingerprint), "analyses");
}

export function sourceVideoPath(
  fingerprint: string,
  sourceFileName: string,
): string {
  const ext = path.extname(sourceFileName || "video.bin") || ".bin";
  return path.join(fingerprintRoot(fingerprint), `source-video${ext}`);
}

export function vectraDir(videoId: string): string {
  return path.join(VIDEO_ANALYSIS_ROOT, "vectra", videoId);
}

export function queryCacheDir(fingerprint: string): string {
  return path.join(fingerprintRoot(fingerprint), "rag", "query-cache");
}

export function queryCachePath(
  fingerprint: string,
  questionHash: string,
): string {
  return path.join(queryCacheDir(fingerprint), `${questionHash}.json`);
}

export async function ensureAnalysisRoot(): Promise<void> {
  await Promise.all([
    fs.mkdir(path.join(VIDEO_ANALYSIS_ROOT, "jobs"), { recursive: true }),
    fs.mkdir(path.join(refsRoot(), "by-job-id"), { recursive: true }),
    fs.mkdir(path.join(refsRoot(), "by-fingerprint"), { recursive: true }),
    fs.mkdir(path.join(VIDEO_ANALYSIS_ROOT, "vectra"), { recursive: true }),
  ]);
}

export async function ensureVideoDirs(fingerprint: string): Promise<void> {
  await Promise.all([
    fs.mkdir(fingerprintRoot(fingerprint), { recursive: true }),
    fs.mkdir(framesDir(fingerprint), { recursive: true }),
    fs.mkdir(analysesDir(fingerprint), { recursive: true }),
    fs.mkdir(path.dirname(summaryPath(fingerprint)), { recursive: true }),
    fs.mkdir(path.dirname(queryCachePath(fingerprint, "placeholder")), {
      recursive: true,
    }),
  ]);
}

export async function writeJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function hashSha256(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function persistReferences(
  reference: JobReference,
): Promise<void> {
  await Promise.all([
    writeJson(byJobIdPath(reference.jobId), reference),
    writeJson(byFingerprintPath(reference.fingerprint), reference),
  ]);
}

export async function readReferenceByJobId(
  jobId: string,
): Promise<JobReference | null> {
  return await readJson<JobReference>(byJobIdPath(jobId));
}

export async function readReferenceByFingerprint(
  fingerprint: string,
): Promise<JobReference | null> {
  return await readJson<JobReference>(byFingerprintPath(fingerprint));
}

export async function deleteReferenceFiles(
  reference: JobReference,
): Promise<void> {
  await Promise.all([
    fs.rm(byJobIdPath(reference.jobId), { force: true }),
    fs.rm(byFingerprintPath(reference.fingerprint), { force: true }),
  ]);
}

export async function removeVideoArtifacts(fingerprint: string): Promise<void> {
  await Promise.all([
    fs.rm(fingerprintRoot(fingerprint), {
      recursive: true,
      force: true,
    }),
    fs.rm(vectraDir(fingerprint), {
      recursive: true,
      force: true,
    }),
  ]);
  const reference = await readReferenceByFingerprint(fingerprint);
  if (reference) {
    await deleteReferenceFiles(reference);
  }
}

export async function readPersistedJobState(
  fingerprint: string,
): Promise<PersistedJobState | null> {
  return await readJson<PersistedJobState>(statePath(fingerprint));
}

export async function readPersistedManifest(
  fingerprint: string,
): Promise<PersistedManifest | null> {
  return await readJson<PersistedManifest>(manifestPath(fingerprint));
}

export async function readPersistedSummary(
  fingerprint: string,
): Promise<PersistedSummary | null> {
  return await readJson<PersistedSummary>(summaryPath(fingerprint));
}
