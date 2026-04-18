import { promises as fs } from "node:fs";
import type { PersistedLmJobRuntime } from "@/app/lib/lm-studio-runtime";
import type { VideoWatchFrameResult } from "@/app/lib/video-watch-types";
import { ensureCacheDir, readAllFrameResults, writeFrameResult } from "./cache";
import {
  parseNarrativeAnalysisFromResponseRaw,
  parseTrackingObjectsFromResponseRaw,
} from "./frame-llm-parse";
import {
  getClientForJobRuntime,
  mimeTypeToFileName,
  resolveModelKey,
} from "./llm-client";
import { defaultJobRuntimeFromEnv } from "./lm-runtime-defaults";
import {
  applyAuthoritativePriorFields,
  PRIOR_FRAME_SENTINEL,
} from "./prior-frame";
import { persistState } from "./state-persist";
import type {
  InternalJob,
  PersistedFrameInfo,
  PersistedManifest,
} from "./types-internal";

const NARRATIVE_RESPONSE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    analysis: {
      type: "string",
      minLength: 1,
    },
  },
  required: ["analysis"],
  additionalProperties: false,
} as const;

const TRACKING_RESPONSE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    objects: {
      type: "object",
      additionalProperties: {
        type: "string",
        minLength: 1,
      },
    },
  },
  required: ["objects"],
  additionalProperties: false,
} as const;

interface AnalyzeFrameContext {
  /** Used only for tracking ids + server-side prior fields; not sent to the narrative model. */
  readonly previousFrame: VideoWatchFrameResult | null;
}

interface NarrativeRun {
  readonly modelKey: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly responseRaw: string;
  readonly analysis: string;
}

async function runNarrativeAnalysis(
  rt: PersistedLmJobRuntime,
  frame: PersistedFrameInfo,
  resolvedModelKey: string,
): Promise<NarrativeRun> {
  const client = getClientForJobRuntime(rt);
  const model = await client.llm.model(resolvedModelKey);
  const imageBuffer = await fs.readFile(frame.imagePath);
  const image = await client.files.prepareImageBase64(
    mimeTypeToFileName("image/png"),
    imageBuffer.toString("base64"),
  );

  const systemPrompt = [
    "You describe a single CCTV still frame. You receive only this image — no prior frames or earlier text.",
    "Cover: setting, how many people are visible, posture, clothing only if it helps tell people apart, handheld objects, and any clear interaction or movement visible in this frame.",
    "Stay factual; do not invent actions not visible in the image.",
  ].join(" ");

  const userPrompt = [
    `Frame time: ${frame.timestampLabel}.`,
    "",
    'Describe what this frame shows. Output JSON with a single field "analysis" (string).',
  ].join("\n");

  const response = await model.respond(
    [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
        images: [image],
      },
    ],
    {
      temperature: 0,
      maxTokens: 900,
      structured: {
        type: "json",
        jsonSchema: NARRATIVE_RESPONSE_SCHEMA,
      },
    },
  );

  const responseRaw = response?.content?.trim();
  if (!responseRaw) {
    throw new Error("LM Studio returned empty narrative response");
  }

  const analysis = parseNarrativeAnalysisFromResponseRaw(responseRaw);

  return {
    modelKey: resolvedModelKey,
    systemPrompt,
    userPrompt,
    responseRaw,
    analysis,
  };
}

interface TrackingRun {
  readonly modelKey: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly responseRaw: string;
  readonly objects: Record<string, string>;
}

async function runTrackingAnalysis(
  rt: PersistedLmJobRuntime,
  frame: PersistedFrameInfo,
  context: AnalyzeFrameContext,
  resolvedModelKey: string,
): Promise<TrackingRun> {
  const client = getClientForJobRuntime(rt);
  const model = await client.llm.model(resolvedModelKey);
  const imageBuffer = await fs.readFile(frame.imagePath);
  const image = await client.files.prepareImageBase64(
    mimeTypeToFileName("image/png"),
    imageBuffer.toString("base64"),
  );

  const priorObjects = context.previousFrame?.objects ?? {};

  const systemPrompt = [
    "You assign stable object IDs for a CCTV frame.",
    "Use lowercase ids like person_01, vehicle_01, object_01.",
    "You receive the previous frame's id-to-description map.",
    "When an entity in the current frame is the same as one in the prior map, reuse the exact same id.",
    "Create a new id only for genuinely new entities.",
    "Return strict JSON with a single field: objects (string keys to short factual descriptions).",
  ].join(" ");

  const userPrompt = [
    `Frame time: ${frame.timestampLabel}.`,
    "",
    "Previous frame object map (reuse ids when the same entity appears):",
    JSON.stringify(priorObjects, null, 2),
    "",
    "Update the map for what is visible in THIS frame.",
  ].join("\n");

  const response = await model.respond(
    [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
        images: [image],
      },
    ],
    {
      temperature: 0,
      maxTokens: 420,
      structured: {
        type: "json",
        jsonSchema: TRACKING_RESPONSE_SCHEMA,
      },
    },
  );

  const responseRaw = response?.content?.trim();
  if (!responseRaw)
    throw new Error("LM Studio returned empty tracking response");
  const objects = parseTrackingObjectsFromResponseRaw(responseRaw);

  return {
    modelKey: resolvedModelKey,
    systemPrompt,
    userPrompt,
    responseRaw,
    objects,
  };
}

export function buildFrameFailureResult(
  frame: PersistedFrameInfo,
  message: string,
  modelKey: string,
): VideoWatchFrameResult {
  return {
    frameIndex: frame.frameIndex,
    timestampMs: frame.timestampMs,
    timestampLabel: frame.timestampLabel,
    frameAnalysis: `Frame analysis failed: ${message}`,
    priorFrameAnalysis: PRIOR_FRAME_SENTINEL,
    priorVisibleObjects: [],
    objects: {},
    rawText: "",
    modelKey,
    latencyMs: 0,
    fromCache: false,
    error: message,
    priorFieldsOrigin: "server",
  };
}

export async function analyzeFrame(
  rt: PersistedLmJobRuntime,
  frame: PersistedFrameInfo,
  context: AnalyzeFrameContext,
): Promise<Omit<VideoWatchFrameResult, "fromCache">> {
  const start = performance.now();

  const [resolvedNarrativeKey, resolvedTrackingKey] = await Promise.all([
    resolveModelKey(rt, rt.frameModelKey),
    resolveModelKey(rt, rt.trackingModelKey),
  ]);

  const [narrative, tracking] = await Promise.all([
    runNarrativeAnalysis(rt, frame, resolvedNarrativeKey),
    runTrackingAnalysis(rt, frame, context, resolvedTrackingKey),
  ]);

  const latencyMs = performance.now() - start;

  const authoritativePrior = applyAuthoritativePriorFields(
    context.previousFrame,
    [],
  );

  const rawText = JSON.stringify(
    {
      narrative: narrative.responseRaw,
      tracking: tracking.responseRaw,
    },
    null,
    2,
  );

  return {
    frameIndex: frame.frameIndex,
    timestampMs: frame.timestampMs,
    timestampLabel: frame.timestampLabel,
    frameAnalysis: narrative.analysis,
    priorFrameAnalysis: authoritativePrior.priorFrameAnalysis,
    priorVisibleObjects: authoritativePrior.priorVisibleObjects,
    objects: tracking.objects,
    rawText,
    modelKey: resolvedNarrativeKey,
    latencyMs,
    error: null,
    priorFieldsOrigin: "server",
    llm: {
      narrative: {
        modelKey: narrative.modelKey,
        systemPrompt: narrative.systemPrompt,
        userPrompt: narrative.userPrompt,
        responseRaw: narrative.responseRaw,
      },
      tracking: {
        modelKey: tracking.modelKey,
        systemPrompt: tracking.systemPrompt,
        userPrompt: tracking.userPrompt,
        responseRaw: tracking.responseRaw,
      },
    },
  };
}

// Runs frame analysis for all frames in manifest, skipping cached
export async function runFrameQueue(
  job: InternalJob,
  manifest: PersistedManifest,
): Promise<void> {
  const rt = job.lmRuntime ?? defaultJobRuntimeFromEnv();
  const cacheDir = await ensureCacheDir(job.fingerprint);
  const repairedOnDisk = await readAllFrameResults(cacheDir);
  const existingByIndex = new Map(
    repairedOnDisk.map((item) => [item.frameIndex, item]),
  );

  // Prepare tasks sorted by frame index
  const tasks = manifest.frames
    .slice()
    .sort((a, b) => a.frameIndex - b.frameIndex)
    .map((frame) => ({
      frame,
      existing: existingByIndex.get(frame.frameIndex) ?? null,
    }));

  job.totalFrames = manifest.frameCount;
  job.analyzedFrames = tasks.filter(({ existing }) => existing !== null).length;
  job.updatedAt = new Date().toISOString();
  await persistState(job);

  let lastFrame: VideoWatchFrameResult | null = null;

  for (const { frame, existing } of tasks) {
    if (existing) {
      lastFrame = existing;
      continue;
    }

    let result: VideoWatchFrameResult;
    try {
      const analyzed = await analyzeFrame(rt, frame, {
        previousFrame: lastFrame,
      });
      result = { ...analyzed, fromCache: false };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown frame analysis error";
      result = buildFrameFailureResult(frame, message, rt.frameModelKey);
    }

    await writeFrameResult(cacheDir, result);
    lastFrame = result;
    job.analyzedFrames += 1;
    job.updatedAt = new Date().toISOString();
    await persistState(job);
  }
}
