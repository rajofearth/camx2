import { promises as fs } from "node:fs";
import { createLmStudioClientForRequest } from "@/app/lib/lmstudio-client-factory";
import type {
  VideoAnalysisChatMessage,
  VideoAnalysisProviderConfig,
  VideoAnalysisSummaryArtifact,
  VideoAnalysisTimelineEntry,
} from "@/types/video-analysis";
import {
  chatMessageSchema,
  frameAnalysisResponseSchema,
} from "../contracts/schemas";
import { dedupeStrings, normalizeWhitespace } from "../utils/text";
import type { ProviderFrameInput, VideoAnalysisProvider } from "./types";

function buildTimelineText(
  timeline: readonly VideoAnalysisTimelineEntry[],
): string {
  return timeline
    .map((entry) =>
      entry.startTimestampLabel === entry.endTimestampLabel
        ? `${entry.startTimestampLabel}: ${entry.summary}`
        : `${entry.startTimestampLabel}-${entry.endTimestampLabel}: ${entry.summary}`,
    )
    .join("\n");
}

function buildTimelineExcerpt(
  timeline: readonly VideoAnalysisTimelineEntry[],
  question: string,
  maxEntries = 12,
): string {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);

  const scored = timeline.map((entry, index) => {
    const haystack =
      `${entry.summary} ${entry.visibleObjects.join(" ")} ${entry.events.join(" ")}`.toLowerCase();
    const score = terms.reduce(
      (total, term) => total + (haystack.includes(term) ? 1 : 0),
      0,
    );
    return { entry, index, score };
  });

  const selected = scored
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxEntries);

  const fallback = selected.length > 0 ? selected : scored.slice(-maxEntries);
  return fallback
    .sort((left, right) => left.index - right.index)
    .map(({ entry }) => {
      const range =
        entry.startTimestampLabel === entry.endTimestampLabel
          ? entry.startTimestampLabel
          : `${entry.startTimestampLabel}-${entry.endTimestampLabel}`;
      return `${range}: ${entry.summary}`;
    })
    .join("\n");
}

export class LmStudioVideoAnalysisProvider implements VideoAnalysisProvider {
  readonly kind = "lmstudio" as const;
  private readonly client;

  constructor(private readonly config: VideoAnalysisProviderConfig) {
    this.client = createLmStudioClientForRequest(
      config.baseUrl,
      config.apiToken.trim() === "" ? undefined : config.apiToken,
    );
  }

  async analyzeFrame(input: ProviderFrameInput) {
    const model = await this.client.llm.model(this.config.frameModelKey);
    const imageBuffer = await fs.readFile(input.imagePath);
    const image = await this.client.files.prepareImageBase64(
      "frame.png",
      imageBuffer.toString("base64"),
    );
    const response = await model.respond(
      [
        {
          role: "system",
          content: [
            "You analyze one CCTV frame and use short recent context carefully.",
            "Return strict JSON only.",
            "Be factual and concise.",
            "Do not invent details that are not visible in the image.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Frame time: ${input.timestampLabel}.`,
            input.previousSummary
              ? `Previous frame summary: ${input.previousSummary}`
              : "Previous frame summary: none.",
            input.recentTimeline.length > 0
              ? `Recent context:\n${input.recentTimeline.join("\n")}`
              : "Recent context: none.",
            "",
            "Return JSON with:",
            "- sceneSummary: short paragraph about what is visible now",
            "- visibleObjects: distinct visible people, vehicles, or items",
            "- events: important actions or changes happening now",
            "- continuityNotes: how this frame continues, changes, or ends recent activity",
          ].join("\n"),
          images: [image],
        },
      ],
      {
        temperature: 0,
        maxTokens: 700,
        structured: {
          type: "json",
          jsonSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              sceneSummary: { type: "string", minLength: 1 },
              visibleObjects: { type: "array", items: { type: "string" } },
              events: { type: "array", items: { type: "string" } },
              continuityNotes: { type: "array", items: { type: "string" } },
            },
            required: [
              "sceneSummary",
              "visibleObjects",
              "events",
              "continuityNotes",
            ],
            additionalProperties: false,
          },
        },
      },
    );

    const rawText = response?.content?.trim();
    if (!rawText) {
      throw new Error("LM Studio returned empty frame analysis response");
    }

    const parsed = frameAnalysisResponseSchema.parse(JSON.parse(rawText));
    return {
      sceneSummary: normalizeWhitespace(parsed.sceneSummary),
      visibleObjects: dedupeStrings(parsed.visibleObjects, 12),
      events: dedupeStrings(parsed.events, 12),
      continuityNotes: dedupeStrings(parsed.continuityNotes, 8),
      rawText,
      modelKey: this.config.frameModelKey,
    };
  }

  async summarizeTimeline(
    timeline: readonly VideoAnalysisTimelineEntry[],
  ): Promise<VideoAnalysisSummaryArtifact> {
    const model = await this.client.llm.model(this.config.summaryModelKey);
    const timelineText = buildTimelineText(timeline);
    const response = await model.respond(
      [
        {
          role: "system",
          content: [
            "You summarize analyzed CCTV footage into a practical operator brief.",
            "Be chronological, compact, and grounded in the supplied timeline only.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            "Write 2 to 4 short paragraphs.",
            "Focus on what changed, when it changed, and what remains uncertain.",
            "",
            timelineText || "No timeline entries available.",
          ].join("\n"),
        },
      ],
      {
        temperature: 0.15,
        maxTokens: 1200,
      },
    );

    const rawText = response?.content?.trim();
    if (!rawText) {
      throw new Error("LM Studio returned empty summary response");
    }

    return {
      timelineText,
      summaryText: rawText,
      modelKey: this.config.summaryModelKey,
      rawText,
    };
  }

  async answerQuestion(input: {
    readonly summary: VideoAnalysisSummaryArtifact;
    readonly timeline: readonly VideoAnalysisTimelineEntry[];
    readonly question: string;
    readonly messages: readonly VideoAnalysisChatMessage[];
  }): Promise<{ readonly answer: string; readonly modelKey: string }> {
    const model = await this.client.llm.model(this.config.summaryModelKey);
    const normalizedMessages = input.messages.map((message) =>
      chatMessageSchema.parse(message),
    );
    const excerpt = buildTimelineExcerpt(input.timeline, input.question);
    const response = await model.respond(
      [
        {
          role: "system",
          content: [
            "Answer questions about analyzed CCTV footage using only the supplied evidence.",
            "Use timestamps when supported.",
            "If the evidence is insufficient, say so clearly.",
            "",
            "Summary:",
            input.summary.summaryText,
            "",
            "Relevant timeline entries:",
            excerpt || "No relevant timeline entries available.",
          ].join("\n"),
        },
        ...normalizedMessages,
        {
          role: "user",
          content: input.question,
        },
      ],
      {
        temperature: 0.1,
        maxTokens: 1000,
        contextOverflowPolicy: "rollingWindow",
      },
    );

    const answer = response?.content?.trim();
    if (!answer) {
      throw new Error("LM Studio returned empty chat response");
    }

    return {
      answer,
      modelKey: this.config.summaryModelKey,
    };
  }
}
