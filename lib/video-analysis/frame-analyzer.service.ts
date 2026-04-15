import { promises as fs } from "node:fs";
import {
  FRAME_MODEL_KEY,
  getFrameModel,
  getLmStudioClient,
  resolveLlmModelKey,
} from "@/lib/video-analysis/lmstudio";
import type {
  FrameAnalysis,
  FrameEvent,
  TrackedObject,
  VideoState,
} from "@/lib/video-analysis/types";

const FRAME_RESPONSE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    sceneChanged: { type: "boolean" },
    summaryText: { type: "string", minLength: 1 },
    newOrUpdatedObjects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          label: { type: "string", minLength: 1 },
          confidence: { type: "number" },
          attributes: {
            type: "array",
            items: { type: "string" },
          },
          status: {
            type: "string",
            enum: ["active", "inactive"],
          },
        },
        required: ["id", "label", "confidence", "attributes", "status"],
        additionalProperties: false,
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          objectIds: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["type", "description", "objectIds"],
        additionalProperties: false,
      },
    },
    anomalies: {
      type: "array",
      items: { type: "string" },
    },
    updatedRollingSummary: { type: "string", minLength: 1 },
  },
  required: [
    "sceneChanged",
    "summaryText",
    "newOrUpdatedObjects",
    "events",
    "anomalies",
    "updatedRollingSummary",
  ],
  additionalProperties: false,
} as const;

const FRAME_PROMPT_TEMPLATE = [
  "You analyze CCTV video frames with persistent temporal continuity.",
  "Re-use existing object IDs from the provided VideoState whenever the same entity remains visible.",
  "Only create a new object ID if the entity is genuinely new.",
  "Carry ongoing anomalies forward when they persist, and mention exact visible evidence only.",
  "Return strict JSON matching the schema. Do not wrap in markdown.",
].join(" ");

type VisionFrameModel = {
  readonly respond: (
    history: readonly unknown[],
    options: Readonly<Record<string, unknown>>,
  ) => Promise<{ readonly content?: string }>;
};

function normalizeTrackedObject(
  input: Record<string, unknown>,
  timestampMs: number,
  timestampLabel: string,
): TrackedObject | null {
  if (
    typeof input.id !== "string" ||
    typeof input.label !== "string" ||
    typeof input.confidence !== "number" ||
    !Array.isArray(input.attributes) ||
    (input.status !== "active" && input.status !== "inactive")
  ) {
    return null;
  }

  const attributes = input.attributes.filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  return {
    id: input.id.trim(),
    label: input.label.trim(),
    confidence: Math.max(0, Math.min(1, input.confidence)),
    attributes,
    firstSeenMs: timestampMs,
    firstSeenLabel: timestampLabel,
    lastSeenMs: timestampMs,
    lastSeenLabel: timestampLabel,
    status: input.status,
  };
}

function normalizeEvent(input: Record<string, unknown>): FrameEvent | null {
  if (
    typeof input.type !== "string" ||
    typeof input.description !== "string" ||
    !Array.isArray(input.objectIds)
  ) {
    return null;
  }

  const objectIds = input.objectIds.filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  return {
    type: input.type.trim(),
    description: input.description.trim(),
    objectIds,
  };
}

export class FrameAnalyzerService {
  async analyzeFrame(input: {
    readonly frameIndex: number;
    readonly timestampMs: number;
    readonly timestampLabel: string;
    readonly imagePath: string;
    readonly currentState: VideoState;
  }): Promise<FrameAnalysis> {
    const client = getLmStudioClient();
    const model = (await getFrameModel()) as VisionFrameModel;
    const resolvedFrameModelKey = await resolveLlmModelKey(FRAME_MODEL_KEY);
    const imageBuffer = await fs.readFile(input.imagePath);
    const image = await client.files.prepareImageBase64(
      "frame.png",
      imageBuffer.toString("base64"),
    );

    const promptState = JSON.stringify(input.currentState, null, 2);
    const start = performance.now();
    const response = await model.respond(
      [
        {
          role: "system",
          content: FRAME_PROMPT_TEMPLATE,
        },
        {
          role: "user",
          content: [
            `Timestamp: ${input.timestampLabel} (${input.timestampMs} ms)`,
            "",
            "Current VideoState JSON:",
            promptState,
            "",
            "Return JSON with this meaning:",
            "- sceneChanged: whether this frame materially changes the scene context",
            "- summaryText: one concise factual summary line for this frame",
            "- newOrUpdatedObjects: visible persistent entities using stable IDs",
            "- events: temporal events happening at this timestamp",
            "- anomalies: visible suspicious or unresolved anomalies",
            "- updatedRollingSummary: short running summary across all frames so far",
          ].join("\n"),
          images: [image],
        },
      ],
      {
        temperature: 0,
        maxTokens: 500,
        structured: {
          type: "json",
          jsonSchema: FRAME_RESPONSE_SCHEMA,
        },
      },
    );
    const latencyMs = performance.now() - start;

    const rawResponse = response?.content?.trim();
    if (!rawResponse) {
      throw new Error("LM Studio returned empty frame analysis output");
    }

    const parsed = JSON.parse(rawResponse) as Record<string, unknown>;
    const newOrUpdatedObjects = Array.isArray(parsed.newOrUpdatedObjects)
      ? parsed.newOrUpdatedObjects
          .map((value) =>
            typeof value === "object" && value !== null
              ? normalizeTrackedObject(
                  value as Record<string, unknown>,
                  input.timestampMs,
                  input.timestampLabel,
                )
              : null,
          )
          .filter((value): value is TrackedObject => value !== null)
      : [];
    const events = Array.isArray(parsed.events)
      ? parsed.events
          .map((value) =>
            typeof value === "object" && value !== null
              ? normalizeEvent(value as Record<string, unknown>)
              : null,
          )
          .filter((value): value is FrameEvent => value !== null)
      : [];
    const anomalies = Array.isArray(parsed.anomalies)
      ? parsed.anomalies.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
      : [];

    const summaryText =
      typeof parsed.summaryText === "string" &&
      parsed.summaryText.trim().length > 0
        ? parsed.summaryText.trim()
        : "No meaningful visual change detected.";
    const updatedRollingSummary =
      typeof parsed.updatedRollingSummary === "string" &&
      parsed.updatedRollingSummary.trim().length > 0
        ? parsed.updatedRollingSummary.trim()
        : input.currentState.rollingSummary;

    return {
      frameIndex: input.frameIndex,
      timestampMs: input.timestampMs,
      timestampLabel: input.timestampLabel,
      sceneChanged: parsed.sceneChanged === true,
      skipped: false,
      summaryText,
      newOrUpdatedObjects,
      events,
      anomalies,
      updatedRollingSummary,
      rawResponse,
      modelKey: resolvedFrameModelKey,
      latencyMs,
      error: null,
    };
  }

  createSkippedFrameAnalysis(input: {
    readonly frameIndex: number;
    readonly timestampMs: number;
    readonly timestampLabel: string;
    readonly currentState: VideoState;
    readonly reason: string;
  }): FrameAnalysis {
    return {
      frameIndex: input.frameIndex,
      timestampMs: input.timestampMs,
      timestampLabel: input.timestampLabel,
      sceneChanged: false,
      skipped: true,
      summaryText: `Skipped static scene: ${input.reason}`,
      newOrUpdatedObjects: [],
      events: [],
      anomalies: [],
      updatedRollingSummary: input.currentState.rollingSummary,
      rawResponse: "",
      modelKey: FRAME_MODEL_KEY,
      latencyMs: 0,
      error: null,
    };
  }
}
