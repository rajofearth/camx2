import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { VideoWatchFrameResult } from "@/app/lib/video-watch-types";
import { CACHE_ROOT, CONFIG_VERSION } from "./config";
import {
  normalizeFrameResult,
  repairOrderedResultsPriorFields,
} from "./frame-normalize";
import { resultsDir } from "./paths";
import type { PersistedState } from "./types-internal";

export async function ensureCacheDir(fingerprint: string): Promise<string> {
  const dir = path.join(CACHE_ROOT, fingerprint);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeJson(
  filePath: string,
  value: unknown,
): Promise<void> {
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

export async function hashBuffer(input: Buffer | string): Promise<string> {
  return createHash("sha256").update(input).digest("hex");
}

export async function hashVideoBuffer(videoBuffer: Buffer): Promise<string> {
  return createHash("sha256").update(videoBuffer).digest("hex");
}

export async function computeProcessingVersionHash(): Promise<string> {
  return createHash("sha256").update(CONFIG_VERSION).digest("hex");
}

export async function removeCacheDir(fingerprint: string): Promise<void> {
  await fs.rm(path.join(CACHE_ROOT, fingerprint), {
    recursive: true,
    force: true,
  });
}

export async function findFingerprintByJobId(
  jobId: string,
): Promise<string | null> {
  const cacheDirs = await fs.readdir(CACHE_ROOT).catch(() => []);

  for (const dirName of cacheDirs) {
    const state = await readJson<PersistedState>(
      path.join(CACHE_ROOT, dirName, "state.json"),
    );
    if (state?.jobId === jobId) {
      return state.fingerprint;
    }
  }

  return null;
}

export async function writeFrameResult(
  cacheDir: string,
  result: VideoWatchFrameResult,
): Promise<void> {
  const dir = resultsDir(cacheDir);
  await fs.mkdir(dir, { recursive: true });
  await writeJson(
    path.join(dir, `frame-${String(result.frameIndex).padStart(6, "0")}.json`),
    result,
  );
}

export async function readAllFrameResults(
  cacheDir: string,
): Promise<VideoWatchFrameResult[]> {
  const dir = resultsDir(cacheDir);
  const entries = await fs.readdir(dir).catch(() => []);
  const results = await Promise.all(
    entries
      .filter((fileName) => fileName.endsWith(".json"))
      .sort()
      .map(async (fileName) =>
        readJson<VideoWatchFrameResult>(path.join(dir, fileName)),
      ),
  );

  const sorted = results
    .filter((value): value is VideoWatchFrameResult => value !== null)
    .map((value) => normalizeFrameResult(value))
    .sort((a, b) => a.frameIndex - b.frameIndex);

  return repairOrderedResultsPriorFields(sorted);
}
