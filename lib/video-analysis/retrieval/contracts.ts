import { z } from "zod";

export const retrievalEntitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  normalizedLabel: z.string().min(1),
  kind: z.enum(["person", "vehicle", "item", "location", "unknown"]),
  mentions: z.number().int().positive(),
  chunkIds: z.array(z.string().min(1)),
});

export const retrievalChunkSchema = z.object({
  id: z.string().min(1),
  timelineEntryId: z.string().min(1),
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
  entityIds: z.array(z.string().min(1)),
  eventKeys: z.array(z.string().min(1)),
  embeddingText: z.string().min(1),
});

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["chunk", "entity", "event"]),
  label: z.string().min(1),
  chunkIds: z.array(z.string().min(1)),
});

export const graphEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(["temporal", "co_occurs", "continuity"]),
  weight: z.number().nonnegative(),
});

export const graphArtifactSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

export const timeRangeInputSchema = z.object({
  start: z.string().trim().min(1),
  end: z.string().trim().min(1),
});

export const queryContextRequestSchema = z.object({
  jobId: z.string().trim().min(1),
  question: z.string().trim().min(1),
  timeRange: timeRangeInputSchema.optional(),
  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1),
      }),
    )
    .optional(),
});
