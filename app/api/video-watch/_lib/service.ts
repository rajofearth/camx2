import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LMStudioClient } from "@lmstudio/sdk";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import type {
  VideoWatchChatMessage,
  VideoWatchFrameResult,
  VideoWatchJob,
  VideoWatchPhase,
  VideoWatchSummary,
} from "@/app/lib/video-watch-types";

const CACHE_ROOT = path.join(process.cwd(), "tmp", "video-watch-cache");
const CONFIG_VERSION = "video-watch-v2-1fps";
const MAX_CONCURRENCY = 8;
const SAMPLE_FPS = 1;
const FRAME_MODEL_KEY =
  process.env.VIDEO_WATCH_FRAME_MODEL_KEY ?? "lfm-ucf-400m";
const SUMMARY_MODEL_KEY =
  process.env.VIDEO_WATCH_SUMMARY_MODEL_KEY ?? "google/gemma-4-e4b";
const LMSTUDIO_BASE_URL =
  process.env.LMSTUDIO_BASE_URL ?? "ws://127.0.0.1:1234";
const CHAT_CONTEXT_BUFFER_TOKENS = 128;
const CHAT_MAX_RESPONSE_TOKENS = 300;
const MIN_CHAT_PROMPT_TOKENS = 512;
const MIN_TIMELINE_LINE_LIMIT = 6;
const MIN_SUMMARY_CHAR_LIMIT = 160;
const CHAT_STOPWORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "any",
  "are",
  "at",
  "be",
  "can",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
  "you",
]);

const FRAME_RESPONSE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    description: {
      type: "string",
      minLength: 1,
    },
  },
  required: ["description"],
  additionalProperties: false,
} as const;

interface PersistedFrameInfo {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly timestampLabel: string;
  readonly imagePath: string;
  readonly checksum: string;
  readonly width: number | null;
  readonly height: number | null;
}

interface PersistedManifest {
  readonly videoFingerprint: string;
  readonly sourceFileName: string;
  readonly sourceByteLength: number;
  readonly videoPath: string;
  readonly frameCount: number;
  readonly frames: PersistedFrameInfo[];
  readonly createdAt: string;
}

interface PersistedState {
  readonly jobId: string;
  readonly fingerprint: string;
  readonly sourceFileName: string;
  readonly totalFrames: number;
  readonly analyzedFrames: number;
  readonly status: VideoWatchPhase;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly error?: string;
}

interface PersistedSummaryFile {
  readonly summary: VideoWatchSummary;
}

interface InternalJob {
  id: string;
  fingerprint: string;
  sourceFileName: string;
  status: VideoWatchPhase;
  totalFrames: number;
  analyzedFrames: number;
  createdAt: string;
  updatedAt: string;
  cache: VideoWatchJob["cache"];
  error?: string;
  summary?: VideoWatchSummary;
  runPromise?: Promise<void>;
}

const jobsById = new Map<string, InternalJob>();
const jobsByFingerprint = new Map<string, InternalJob>();

let cachedClient: LMStudioClient | null = null;
const resolvedModelKeys = new Map<string, string>();

type LoadedLlmHandle = Awaited<
  ReturnType<LMStudioClient["llm"]["listLoaded"]>
>[number];

function getClient(): LMStudioClient {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new LMStudioClient({
    baseUrl: LMSTUDIO_BASE_URL,
    verboseErrorMessages: true,
  });

  return cachedClient;
}

async function resolveExecutablePath(
  preferredCommand: string,
  explicitPath: string | undefined,
  packagedPath: string | null | undefined,
): Promise<string> {
  if (explicitPath) {
    return explicitPath;
  }

  try {
    await runCommand(preferredCommand, ["-version"]);
    return preferredCommand;
  } catch {
    if (packagedPath) {
      try {
        await fs.access(packagedPath);
        return packagedPath;
      } catch {
        // Fall through to the final error.
      }
    }
  }

  throw new Error(
    `Required executable "${preferredCommand}" was not found. Install it or set ${preferredCommand.toUpperCase()}_PATH.`,
  );
}

function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  return (
    lower.includes("econnrefused") ||
    lower.includes("connect") ||
    lower.includes("websocket") ||
    lower.includes("127.0.0.1:1234") ||
    lower.includes("localhost") ||
    lower.includes("not running")
  );
}

async function resolveModelKey(modelKey: string): Promise<string> {
  const client = getClient();
  const cached = resolvedModelKeys.get(modelKey);

  const loadedModels = await (async () => {
    try {
      return await client.llm.listLoaded();
    } catch (error) {
      if (isConnectionError(error)) {
        throw new Error(
          "LM Studio local server is not running or is unreachable at ws://127.0.0.1:1234",
        );
      }
      throw error;
    }
  })();

  const findLoadedTarget = (
    candidateKey: string,
  ): LoadedLlmHandle | undefined =>
    loadedModels.find(
      (model) =>
        model.modelKey === candidateKey || model.identifier === candidateKey,
    );

  const loadedTarget = [cached, modelKey]
    .filter((value): value is string => !!value)
    .map((candidateKey) => findLoadedTarget(candidateKey))
    .find((value): value is LoadedLlmHandle => value !== undefined);

  if (loadedTarget) {
    const loadedInfo = await loadedTarget.getModelInfo();

    if (loadedInfo.contextLength < loadedInfo.maxContextLength) {
      await loadedTarget.unload();

      const reloadedModel = await client.llm.load(loadedInfo.modelKey, {
        identifier: loadedInfo.identifier,
        config: {
          contextLength: loadedInfo.maxContextLength,
        },
      });
      const reloadedInfo = await reloadedModel.getModelInfo();
      resolvedModelKeys.set(modelKey, reloadedInfo.modelKey);
      return reloadedInfo.modelKey;
    }

    resolvedModelKeys.set(modelKey, loadedInfo.modelKey);
    return loadedInfo.modelKey;
  }

  const downloadedModels = await client.system.listDownloadedModels("llm");
  const downloadedTarget = downloadedModels.find(
    (model) => model.modelKey === cached || model.modelKey === modelKey,
  );

  if (!downloadedTarget) {
    throw new Error(
      `Required LM Studio model "${modelKey}" is not loaded and not available locally`,
    );
  }

  const loadedModel = await client.llm.load(downloadedTarget.modelKey, {
    config: {
      contextLength: downloadedTarget.maxContextLength,
    },
  });
  const loadedInfo = await loadedModel.getModelInfo();
  resolvedModelKeys.set(modelKey, loadedInfo.modelKey);
  return loadedInfo.modelKey;
}

function mimeTypeToFileName(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "frame.png";
    case "image/webp":
      return "frame.webp";
    default:
      return "frame.jpg";
  }
}

function toTimestampLabel(timestampMs: number): string {
  const totalMs = Math.max(0, Math.round(timestampMs));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const millis = totalMs % 1_000;
  const base = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${base}`;
  }

  return base;
}

async function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${code}: ${stderr.trim() || stdout.trim()}`,
        ),
      );
    });
  });
}

async function ensureCacheDir(fingerprint: string): Promise<string> {
  const dir = path.join(CACHE_ROOT, fingerprint);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function statePath(cacheDir: string): string {
  return path.join(cacheDir, "state.json");
}

function manifestPath(cacheDir: string): string {
  return path.join(cacheDir, "frames.json");
}

function resultsDir(cacheDir: string): string {
  return path.join(cacheDir, "frame-results");
}

function framesDir(cacheDir: string): string {
  return path.join(cacheDir, "frames");
}

function summaryPath(cacheDir: string): string {
  return path.join(cacheDir, "summary.json");
}

function timelinePath(cacheDir: string): string {
  return path.join(cacheDir, "timeline.txt");
}

function versionPath(cacheDir: string): string {
  return path.join(cacheDir, "processing-version.txt");
}

function videoPath(cacheDir: string, sourceFileName: string): string {
  const ext = path.extname(sourceFileName || "video.bin") || ".bin";
  return path.join(cacheDir, `source${ext}`);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hashBuffer(input: Buffer | string): Promise<string> {
  return createHash("sha256").update(input).digest("hex");
}

async function hashVideoBuffer(videoBuffer: Buffer): Promise<string> {
  return createHash("sha256").update(videoBuffer).digest("hex");
}

async function computeProcessingVersionHash(): Promise<string> {
  return createHash("sha256").update(CONFIG_VERSION).digest("hex");
}

async function persistState(job: InternalJob): Promise<void> {
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
  };
  await writeJson(statePath(cacheDir), state);
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

async function loadJobFromDisk(
  fingerprint: string,
): Promise<InternalJob | null> {
  const cacheDir = await ensureCacheDir(fingerprint);
  const currentVersion = await computeProcessingVersionHash();
  const storedVersion = await fs
    .readFile(versionPath(cacheDir), "utf8")
    .catch(() => null);
  if (storedVersion?.trim() !== currentVersion) {
    await removeCacheDir(fingerprint);
    return null;
  }

  const [state, summaryFile] = await Promise.all([
    readJson<PersistedState>(statePath(cacheDir)),
    readJson<PersistedSummaryFile>(summaryPath(cacheDir)),
  ]);

  if (!state) {
    return null;
  }

  const job: InternalJob = {
    id: state.jobId,
    fingerprint: state.fingerprint,
    sourceFileName: state.sourceFileName,
    status: state.status,
    totalFrames: state.totalFrames,
    analyzedFrames: state.analyzedFrames,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    cache: {
      fingerprint,
      cacheHit: true,
      source: "disk",
    },
    error: state.error,
    summary: summaryFile?.summary,
  };

  jobsById.set(job.id, job);
  jobsByFingerprint.set(job.fingerprint, job);
  return job;
}

async function removeCacheDir(fingerprint: string): Promise<void> {
  await fs.rm(path.join(CACHE_ROOT, fingerprint), {
    recursive: true,
    force: true,
  });
}

function removeJobFromMemory(job: InternalJob | undefined): void {
  if (!job) {
    return;
  }

  jobsById.delete(job.id);
  jobsByFingerprint.delete(job.fingerprint);
}

async function findFingerprintByJobId(jobId: string): Promise<string | null> {
  const cacheDirs = await fs.readdir(CACHE_ROOT).catch(() => []);

  for (const dirName of cacheDirs) {
    const state = await readJson<PersistedState>(
      statePath(path.join(CACHE_ROOT, dirName)),
    );
    if (state?.jobId === jobId) {
      return state.fingerprint;
    }
  }

  return null;
}

async function readSummaryForJob(
  jobId: string,
): Promise<VideoWatchSummary | null> {
  const job = jobsById.get(jobId);
  if (job?.summary) {
    return job.summary;
  }

  const fingerprint = await findFingerprintByJobId(jobId);
  const target =
    job ?? (fingerprint ? await loadJobFromDisk(fingerprint) : null);
  if (!target) {
    return null;
  }

  return target.summary ?? null;
}

async function probeFrames(sourceVideoPath: string): Promise<{
  width: number | null;
  height: number | null;
}> {
  const ffprobePath = await resolveExecutablePath(
    "ffprobe",
    process.env.FFPROBE_PATH,
    ffprobeStatic.path,
  );

  const { stdout } = await runCommand(ffprobePath, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    sourceVideoPath,
  ]);

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
  };

  const stream = parsed.streams?.[0];

  return {
    width: typeof stream?.width === "number" ? stream.width : null,
    height: typeof stream?.height === "number" ? stream.height : null,
  };
}

async function extractFrames(
  fingerprint: string,
  sourceVideoPath: string,
  sourceFileName: string,
  sourceByteLength: number,
): Promise<PersistedManifest> {
  const cacheDir = await ensureCacheDir(fingerprint);
  const manifestFile = manifestPath(cacheDir);
  const existingManifest = await readJson<PersistedManifest>(manifestFile);
  if (existingManifest?.frames?.length) {
    return existingManifest;
  }

  const targetFramesDir = framesDir(cacheDir);
  await fs.mkdir(targetFramesDir, { recursive: true });

  const existingFiles = await fs.readdir(targetFramesDir).catch(() => []);
  await Promise.all(
    existingFiles.map((fileName) =>
      fs.rm(path.join(targetFramesDir, fileName), { force: true }),
    ),
  );

  const probe = await probeFrames(sourceVideoPath);

  const ffmpegPath = await resolveExecutablePath(
    "ffmpeg",
    process.env.FFMPEG_PATH,
    ffmpegStatic,
  );

  await runCommand(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sourceVideoPath,
    "-vf",
    `fps=${SAMPLE_FPS}`,
    path.join(targetFramesDir, "frame-%06d.jpg"),
  ]);

  const frameFileNames = (await fs.readdir(targetFramesDir))
    .filter((fileName) => fileName.toLowerCase().endsWith(".jpg"))
    .sort();

  const frameInfos = await Promise.all(
    frameFileNames.map(async (fileName, index) => {
      const imagePath = path.join(targetFramesDir, fileName);
      const buffer = await fs.readFile(imagePath);
      const timestampMs = Math.round((index * 1000) / SAMPLE_FPS);

      return {
        frameIndex: index,
        timestampMs,
        timestampLabel: toTimestampLabel(timestampMs),
        imagePath,
        checksum: await hashBuffer(buffer),
        width: probe.width,
        height: probe.height,
      } satisfies PersistedFrameInfo;
    }),
  );

  const manifest: PersistedManifest = {
    videoFingerprint: fingerprint,
    sourceFileName,
    sourceByteLength,
    videoPath: sourceVideoPath,
    frameCount: frameInfos.length,
    frames: frameInfos,
    createdAt: new Date().toISOString(),
  };

  await writeJson(manifestFile, manifest);
  return manifest;
}

async function analyzeFrame(
  frame: PersistedFrameInfo,
): Promise<Omit<VideoWatchFrameResult, "fromCache">> {
  const client = getClient();
  const resolvedFrameModelKey = await resolveModelKey(FRAME_MODEL_KEY);
  const model = await client.llm.model(resolvedFrameModelKey);
  const imageBuffer = await fs.readFile(frame.imagePath);
  const image = await client.files.prepareImageBase64(
    mimeTypeToFileName("image/jpeg"),
    imageBuffer.toString("base64"),
  );

  const start = performance.now();
  const response = await model.respond(
    [
      {
        role: "system",
        content:
          "You describe individual CCTV video frames. Return only a concise factual description of visible activity and scene changes. Mention people, objects, motion, hazards, and transitions. Do not speculate beyond what is visible.",
      },
      {
        role: "user",
        content: `Describe the frame at ${frame.timestampLabel}.`,
        images: [image],
      },
    ],
    {
      temperature: 0,
      maxTokens: 120,
      structured: {
        type: "json",
        jsonSchema: FRAME_RESPONSE_SCHEMA,
      },
    },
  );
  const latencyMs = performance.now() - start;

  const rawText = response?.content?.trim();
  if (!rawText) {
    throw new Error("LM Studio returned empty frame response");
  }

  const parsed = JSON.parse(rawText) as { description?: unknown };
  const description =
    typeof parsed.description === "string" &&
    parsed.description.trim().length > 0
      ? parsed.description.trim()
      : "No meaningful visual change detected.";

  return {
    frameIndex: frame.frameIndex,
    timestampMs: frame.timestampMs,
    timestampLabel: frame.timestampLabel,
    description,
    rawText,
    modelKey: resolvedFrameModelKey,
    latencyMs,
    error: null,
  };
}

async function summarizeTimeline(
  timelineText: string,
): Promise<VideoWatchSummary> {
  const resolvedSummaryModelKey = await resolveModelKey(SUMMARY_MODEL_KEY);
  const model = await getClient().llm.model(resolvedSummaryModelKey);

  const response = await model.respond(
    [
      {
        role: "system",
        content:
          "You combine ordered frame descriptions into a concise surveillance summary. Respect chronology, call out notable actions, and avoid inventing details.",
      },
      {
        role: "user",
        content: `Combine these frame descriptions into a coherent summary:\n\n${timelineText}`,
      },
    ],
    {
      temperature: 0.1,
      maxTokens: 400,
    },
  );

  const rawText = response?.content?.trim();
  if (!rawText) {
    throw new Error("LM Studio returned empty summary response");
  }

  return {
    timelineText,
    summaryText: rawText,
    modelKey: resolvedSummaryModelKey,
    rawText,
  };
}

async function writeFrameResult(
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

async function readExistingFrameResult(
  cacheDir: string,
  frameIndex: number,
): Promise<VideoWatchFrameResult | null> {
  return await readJson<VideoWatchFrameResult>(
    path.join(
      resultsDir(cacheDir),
      `frame-${String(frameIndex).padStart(6, "0")}.json`,
    ),
  );
}

async function readAllFrameResults(
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

  return results.filter(
    (value): value is VideoWatchFrameResult => value !== null,
  );
}

async function runFrameQueue(
  job: InternalJob,
  manifest: PersistedManifest,
): Promise<void> {
  const cacheDir = await ensureCacheDir(job.fingerprint);
  const tasks = await Promise.all(
    manifest.frames.map(async (frame) => {
      const existing = await readExistingFrameResult(
        cacheDir,
        frame.frameIndex,
      );
      return { frame, existing };
    }),
  );

  job.totalFrames = manifest.frameCount;
  job.analyzedFrames = tasks.filter(({ existing }) => existing !== null).length;
  job.updatedAt = new Date().toISOString();
  await persistState(job);

  const pendingFrames = tasks
    .filter(({ existing }) => existing === null)
    .map(({ frame }) => frame);

  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < pendingFrames.length) {
      const current = pendingFrames[nextIndex];
      nextIndex += 1;

      let result: VideoWatchFrameResult;
      try {
        const analyzed = await analyzeFrame(current);
        result = {
          ...analyzed,
          fromCache: false,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown frame analysis error";
        result = {
          frameIndex: current.frameIndex,
          timestampMs: current.timestampMs,
          timestampLabel: current.timestampLabel,
          description: `Frame analysis failed: ${message}`,
          rawText: "",
          modelKey: FRAME_MODEL_KEY,
          latencyMs: 0,
          fromCache: false,
          error: message,
        };
      }

      await writeFrameResult(cacheDir, result);
      job.analyzedFrames += 1;
      job.updatedAt = new Date().toISOString();
      await persistState(job);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENCY, pendingFrames.length) },
      () => worker(),
    ),
  );
}

async function finalizeJob(
  job: InternalJob,
  manifest: PersistedManifest,
): Promise<void> {
  const cacheDir = await ensureCacheDir(job.fingerprint);
  const orderedResults = (await readAllFrameResults(cacheDir)).sort(
    (a, b) => a.frameIndex - b.frameIndex,
  );

  const timelineText = orderedResults
    .map((frame) => `${frame.timestampLabel}: ${frame.description}`)
    .join("\n");

  await fs.writeFile(timelinePath(cacheDir), timelineText, "utf8");
  const summary = await summarizeTimeline(timelineText);
  job.summary = summary;
  job.totalFrames = manifest.frameCount;
  job.analyzedFrames = orderedResults.length;
  job.status = "completed";
  job.updatedAt = new Date().toISOString();
  await writeJson(summaryPath(cacheDir), {
    summary,
  } satisfies PersistedSummaryFile);
  await persistState(job);
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
}): Promise<VideoWatchJob> {
  await fs.mkdir(CACHE_ROOT, { recursive: true });

  const fingerprint = await hashVideoBuffer(input.videoBuffer);
  const processingVersion = await computeProcessingVersionHash();
  const existingJob =
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
    existingJob.cache = {
      fingerprint,
      cacheHit: true,
      source: "memory",
    };
    return toPublicJob(existingJob);
  }

  const cacheDir = await ensureCacheDir(fingerprint);
  await fs.writeFile(
    path.join(cacheDir, "processing-version.txt"),
    processingVersion,
    "utf8",
  );
  const targetVideoPath = videoPath(cacheDir, input.sourceFileName);
  if (!(await fileExists(targetVideoPath))) {
    await fs.writeFile(targetVideoPath, input.videoBuffer);
  }

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
      cache: {
        fingerprint,
        cacheHit: false,
        source: "upload",
      },
    } satisfies InternalJob);

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
    .catch(() => {
      // Process errors are captured into job state already.
    })
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

  if (!fingerprint) {
    return null;
  }

  removeJobFromMemory(jobsByFingerprint.get(fingerprint));
  await removeCacheDir(fingerprint);
  return fingerprint;
}

export async function getVideoJobStatus(input: {
  readonly jobId?: string | null;
  readonly fingerprint?: string | null;
}): Promise<VideoWatchJob | null> {
  const byJobId = input.jobId ? jobsById.get(input.jobId) : null;
  if (byJobId) {
    return toPublicJob(byJobId);
  }

  const byFingerprint = input.fingerprint
    ? jobsByFingerprint.get(input.fingerprint)
    : null;
  if (byFingerprint) {
    return toPublicJob(byFingerprint);
  }

  const fingerprint =
    input.fingerprint ||
    (input.jobId ? await findFingerprintByJobId(input.jobId) : null);
  if (!fingerprint) {
    return null;
  }

  const loaded = await loadJobFromDisk(fingerprint);
  return loaded ? toPublicJob(loaded) : null;
}

type LlmChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};

type ContextAwareModel = {
  readonly applyPromptTemplate: (
    history: readonly LlmChatMessage[],
  ) => Promise<string>;
  readonly countTokens: (inputString: string) => Promise<number>;
  readonly getModelInfo: () => Promise<{
    readonly contextLength: number;
    readonly maxContextLength: number;
  }>;
  readonly respond: (
    history: readonly LlmChatMessage[],
    opts: {
      readonly temperature: number;
      readonly maxTokens: number;
      readonly contextOverflowPolicy: "rollingWindow";
    },
  ) => Promise<{ readonly content?: string }>;
};

function normalizeChatHistory(
  messages: readonly VideoWatchChatMessage[] | undefined,
  question: string,
): VideoWatchChatMessage[] {
  const normalized =
    messages?.flatMap((message) => {
      const content = message.content.trim();
      if (!content) {
        return [];
      }

      return [
        {
          role: message.role,
          content,
        } satisfies VideoWatchChatMessage,
      ];
    }) ?? [];

  if (!normalized.length) {
    return [
      {
        role: "user",
        content: question,
      },
    ];
  }

  const latestMessage = normalized.at(-1);
  if (latestMessage?.role === "user" && latestMessage.content === question) {
    return normalized;
  }

  return [
    ...normalized,
    {
      role: "user",
      content: question,
    },
  ];
}

function trimTextToCharLimit(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  if (limit <= 1) {
    return text.slice(0, limit);
  }

  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function extractSearchTerms(text: string): string[] {
  const uniqueTerms = new Set<string>();

  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < 3 || CHAT_STOPWORDS.has(token)) {
      continue;
    }

    uniqueTerms.add(token);
  }

  return [...uniqueTerms];
}

function scoreTimelineLine(line: string, terms: readonly string[]): number {
  const normalized = line.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (normalized.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function buildTimelineExcerpt(
  timelineText: string,
  queryText: string,
  lineLimit: number,
): string {
  const lines = timelineText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return "No timeline entries available.";
  }

  if (lines.length <= lineLimit) {
    return lines.join("\n");
  }

  const terms = extractSearchTerms(queryText);
  const selected = new Set<number>();
  const addIndex = (index: number) => {
    if (index < 0 || index >= lines.length || selected.size >= lineLimit) {
      return;
    }

    selected.add(index);
  };

  addIndex(0);
  addIndex(1);

  for (
    let index = Math.max(0, lines.length - 6);
    index < lines.length;
    index += 1
  ) {
    addIndex(index);
  }

  const scored = lines
    .map((line, index) => ({
      index,
      score: scoreTimelineLine(line, terms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.index - right.index;
    });

  for (const entry of scored) {
    addIndex(entry.index);
    addIndex(entry.index - 1);
    addIndex(entry.index + 1);
  }

  for (
    let index = lines.length - 1;
    index >= 0 && selected.size < lineLimit;
    index -= 1
  ) {
    addIndex(index);
  }

  for (
    let index = 0;
    index < lines.length && selected.size < lineLimit;
    index += 1
  ) {
    addIndex(index);
  }

  const ordered = [...selected].sort((left, right) => left - right);
  const excerpt: string[] = [];
  let previousIndex = -1;

  for (const index of ordered) {
    if (previousIndex >= 0 && index - previousIndex > 1) {
      excerpt.push(`[${index - previousIndex - 1} timeline entries omitted]`);
    }

    excerpt.push(lines[index]);
    previousIndex = index;
  }

  return excerpt.join("\n");
}

function buildVideoEvidenceBlock(input: {
  readonly summary: VideoWatchSummary;
  readonly queryText: string;
  readonly summaryCharLimit: number;
  readonly timelineLineLimit: number;
}): string {
  const trimmedSummary = trimTextToCharLimit(
    input.summary.summaryText.trim(),
    input.summaryCharLimit,
  );
  const timelineExcerpt = buildTimelineExcerpt(
    input.summary.timelineText,
    input.queryText,
    input.timelineLineLimit,
  );

  return [
    "Video summary:",
    trimmedSummary || "No summary available.",
    "",
    "Relevant timeline excerpts:",
    timelineExcerpt,
  ].join("\n");
}

function buildPromptMessages(input: {
  readonly evidenceBlock: string;
  readonly history: readonly VideoWatchChatMessage[];
  readonly latestQuestion: string;
}): LlmChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You answer questions about analyzed CCTV footage using only the supplied evidence and chat history.",
        "Use earlier turns to resolve follow-up questions, but let the supplied video evidence overrule prior assistant guesses.",
        "Give direct answers, mention timestamps when supported, and say clearly when the evidence does not support a claim.",
        "",
        input.evidenceBlock,
      ].join("\n"),
    },
    ...input.history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user",
      content: input.latestQuestion,
    },
  ];
}

async function countChatTokens(
  model: ContextAwareModel,
  history: readonly LlmChatMessage[],
): Promise<number> {
  const prompt = await model.applyPromptTemplate(history);
  return await model.countTokens(prompt);
}

async function buildChatPrompt(
  model: ContextAwareModel,
  summary: VideoWatchSummary,
  conversation: readonly VideoWatchChatMessage[],
): Promise<{ chat: LlmChatMessage[]; maxTokens: number }> {
  const latestQuestion = conversation.at(-1)?.content ?? "";
  const priorHistory = conversation.slice(0, -1);
  const modelInfo = await model.getModelInfo();
  const contextWindow = Math.max(
    MIN_CHAT_PROMPT_TOKENS + CHAT_CONTEXT_BUFFER_TOKENS,
    Math.min(modelInfo.contextLength, modelInfo.maxContextLength),
  );
  const maxTokens = Math.max(
    128,
    Math.min(CHAT_MAX_RESPONSE_TOKENS, Math.floor(contextWindow * 0.2)),
  );
  const promptBudget = Math.max(
    MIN_CHAT_PROMPT_TOKENS,
    contextWindow - maxTokens - CHAT_CONTEXT_BUFFER_TOKENS,
  );

  const totalTimelineLines = summary.timelineText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;
  let timelineLineLimit = Math.max(MIN_TIMELINE_LINE_LIMIT, totalTimelineLines);
  let summaryCharLimit = Math.max(
    MIN_SUMMARY_CHAR_LIMIT,
    summary.summaryText.trim().length,
  );
  let historyStartIndex = 0;
  const queryText = conversation.map((message) => message.content).join("\n");
  let fallbackChat = buildPromptMessages({
    evidenceBlock: buildVideoEvidenceBlock({
      summary,
      queryText,
      summaryCharLimit,
      timelineLineLimit,
    }),
    history: priorHistory.slice(historyStartIndex),
    latestQuestion,
  });

  while (true) {
    const evidenceBlock = buildVideoEvidenceBlock({
      summary,
      queryText,
      summaryCharLimit,
      timelineLineLimit,
    });
    const candidateChat = buildPromptMessages({
      evidenceBlock,
      history: priorHistory.slice(historyStartIndex),
      latestQuestion,
    });

    fallbackChat = candidateChat;

    if ((await countChatTokens(model, candidateChat)) <= promptBudget) {
      return {
        chat: candidateChat,
        maxTokens,
      };
    }

    if (timelineLineLimit > MIN_TIMELINE_LINE_LIMIT) {
      timelineLineLimit = Math.max(
        MIN_TIMELINE_LINE_LIMIT,
        Math.floor(timelineLineLimit * 0.7),
      );
      continue;
    }

    if (historyStartIndex < priorHistory.length) {
      historyStartIndex += 1;
      continue;
    }

    if (summaryCharLimit > MIN_SUMMARY_CHAR_LIMIT) {
      summaryCharLimit = Math.max(
        MIN_SUMMARY_CHAR_LIMIT,
        Math.floor(summaryCharLimit * 0.75),
      );
      continue;
    }

    return {
      chat: fallbackChat,
      maxTokens,
    };
  }
}

export async function answerQuestionAboutVideo(input: {
  readonly jobId: string;
  readonly question: string;
  readonly messages?: readonly VideoWatchChatMessage[];
}): Promise<{ answer: string; modelKey: string }> {
  const summary = await readSummaryForJob(input.jobId);
  if (!summary) {
    throw new Error("Video analysis is not ready yet");
  }

  const resolvedSummaryModelKey = await resolveModelKey(SUMMARY_MODEL_KEY);
  const model = (await getClient().llm.model(
    resolvedSummaryModelKey,
  )) as ContextAwareModel;
  const conversation = normalizeChatHistory(input.messages, input.question);
  const prompt = await buildChatPrompt(model, summary, conversation);

  const response = await model.respond(prompt.chat, {
    temperature: 0.1,
    maxTokens: prompt.maxTokens,
    contextOverflowPolicy: "rollingWindow",
  });

  const answer = response?.content?.trim();
  if (!answer) {
    throw new Error("LM Studio returned an empty answer");
  }

  return {
    answer,
    modelKey: resolvedSummaryModelKey,
  };
}
