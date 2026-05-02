import { z } from "zod";

export const providerConfigSchema = z.object({
  provider: z.literal("lmstudio"),
  baseUrl: z.string().min(1),
  apiToken: z.string(),
  frameModelKey: z.string().min(1),
  summaryModelKey: z.string().min(1),
});

export const progressSchema = z.object({
  stage: z.enum([
    "queued",
    "extracting",
    "analyzing",
    "summarizing",
    "completed",
    "error",
  ]),
  totalFrames: z.number().int().nonnegative(),
  completedFrames: z.number().int().nonnegative(),
  completionRatio: z.number().min(0).max(1),
});

export const frameArtifactSchema = z.object({
  frameIndex: z.number().int().nonnegative(),
  timestampMs: z.number().nonnegative(),
  timestampLabel: z.string().min(1),
  sceneSummary: z.string().min(1),
  visibleObjects: z.array(z.string()),
  events: z.array(z.string()),
  continuityNotes: z.array(z.string()),
  rawText: z.string(),
  modelKey: z.string().min(1),
  latencyMs: z.number().nonnegative(),
  imagePath: z.string().min(1),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

export const timelineEntrySchema = z.object({
  id: z.string().min(1),
  startFrameIndex: z.number().int().nonnegative(),
  endFrameIndex: z.number().int().nonnegative(),
  startTimestampMs: z.number().nonnegative(),
  endTimestampMs: z.number().nonnegative(),
  startTimestampLabel: z.string().min(1),
  endTimestampLabel: z.string().min(1),
  summary: z.string().min(1),
  visibleObjects: z.array(z.string()),
  events: z.array(z.string()),
  continuityNotes: z.array(z.string()),
});

export const summaryArtifactSchema = z.object({
  timelineText: z.string(),
  summaryText: z.string().min(1),
  modelKey: z.string().min(1),
  rawText: z.string().min(1),
});

export const jobRecordSchema = z.object({
  ok: z.literal(true),
  jobId: z.string().min(1),
  fingerprint: z.string().min(1),
  sourceFileName: z.string().min(1),
  status: progressSchema.shape.stage,
  progress: progressSchema,
  provider: z.literal("lmstudio"),
  providerConfig: providerConfigSchema,
  cache: z.object({
    fingerprint: z.string().min(1),
    cacheHit: z.boolean(),
    source: z.enum(["memory", "disk", "upload"]),
  }),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  summary: summaryArtifactSchema.optional(),
  error: z.string().optional(),
});

export const persistedJobRecordSchema = jobRecordSchema;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1),
});

export const chatRequestSchema = z.object({
  question: z.string().trim().min(1),
  messages: z.array(chatMessageSchema).optional(),
});

export const uploadRequestMetaSchema = z.object({
  clientFingerprint: z.string().trim().min(1).optional(),
  forceRefresh: z.boolean().optional(),
});

export const frameAnalysisResponseSchema = z.object({
  sceneSummary: z.string().min(1),
  visibleObjects: z.array(z.string().min(1)).max(12),
  events: z.array(z.string().min(1)).max(12),
  continuityNotes: z.array(z.string().min(1)).max(8),
});
