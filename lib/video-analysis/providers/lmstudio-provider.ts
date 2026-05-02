import { promises as fs } from "node:fs";
import { createLmStudioClientForRequest } from "@/app/lib/lmstudio-client-factory";
import type {
  GraphMatch,
  RetrievedEvidenceChunk,
  VideoAnalysisChatMessage,
  VideoAnalysisProviderConfig,
  VideoAnalysisResolvedTimeRange,
  VideoAnalysisSummaryArtifact,
  VideoAnalysisTimelineEntry,
  VideoQueryContextResult,
} from "@/types/video-analysis";
import {
  chatMessageSchema,
  frameAnalysisResponseSchema,
} from "../contracts/schemas";
import {
  buildQueryContextBlock,
  renderEvidenceChunk,
  renderGraphMatch,
} from "../retrieval/summarize-context";
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

function renderResolvedTimeRange(
  resolvedTimeRange: VideoAnalysisResolvedTimeRange | null,
): string {
  if (!resolvedTimeRange) {
    return "No explicit time range requested.";
  }
  return `Requested window: ${resolvedTimeRange.startMs}ms to ${resolvedTimeRange.endMs}ms.`;
}

function renderEvidenceList(
  evidence: readonly RetrievedEvidenceChunk[],
): string {
  return (
    evidence.map(renderEvidenceChunk).join("\n\n") || "No evidence retrieved."
  );
}

function renderGraphMatchList(matches: readonly GraphMatch[]): string {
  return matches.map(renderGraphMatch).join("\n") || "No graph matches.";
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

  async embedTexts(inputs: readonly string[]): Promise<readonly number[][]> {
    const model = await this.client.embedding.model(
      this.config.embeddingModelKey,
    );
    const response = await model.embed([...inputs]);
    const normalized = Array.isArray(response) ? response : [response];
    return normalized.map((entry) => entry.embedding);
  }

  async summarizeQueryContext(input: {
    readonly question: string;
    readonly summary: VideoAnalysisSummaryArtifact;
    readonly resolvedTimeRange: VideoAnalysisResolvedTimeRange | null;
    readonly evidence: readonly RetrievedEvidenceChunk[];
    readonly graphMatches: readonly GraphMatch[];
    readonly conversation: readonly VideoAnalysisChatMessage[];
    readonly insufficientEvidence: boolean;
  }): Promise<{ readonly summary: string; readonly modelKey: string }> {
    const model = await this.client.llm.model(this.config.summaryModelKey);
    const conversationBlock =
      input.conversation.length > 0
        ? input.conversation
            .slice(-4)
            .map((message) => `${message.role}: ${message.content}`)
            .join("\n")
        : "No prior conversation context.";
    const response = await model.respond(
      [
        {
          role: "system",
          content: [
            "You prepare compact retrieval summaries for a CCTV question-answering agent.",
            "Use only the supplied evidence.",
            "Respect the requested question and time range.",
            "If evidence is weak, say so plainly.",
            "Return plain text only.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Question: ${input.question}`,
            renderResolvedTimeRange(input.resolvedTimeRange),
            `Insufficient evidence flag: ${input.insufficientEvidence ? "yes" : "no"}`,
            "",
            "Global video summary:",
            input.summary.summaryText,
            "",
            "Relevant evidence:",
            renderEvidenceList(input.evidence),
            "",
            "Graph matches:",
            renderGraphMatchList(input.graphMatches),
            "",
            "Recent conversation:",
            conversationBlock,
            "",
            "Write a 1-2 paragraph context summary for another agent. Include timestamps when supported.",
          ].join("\n"),
        },
      ],
      {
        temperature: 0.1,
        maxTokens: 700,
      },
    );

    const summary = response?.content?.trim();
    if (!summary) {
      throw new Error("LM Studio returned empty query context summary");
    }

    return {
      summary,
      modelKey: this.config.summaryModelKey,
    };
  }

  async answerQuestion(input: {
    readonly question: string;
    readonly messages: readonly VideoAnalysisChatMessage[];
    readonly queryContext: VideoQueryContextResult;
  }): Promise<{ readonly answer: string; readonly modelKey: string }> {
    const model = await this.client.llm.model(this.config.summaryModelKey);
    const normalizedMessages = input.messages.map((message) =>
      chatMessageSchema.parse(message),
    );
    const response = await model.respond(
      [
        {
          role: "system",
          content: [
            "Answer questions about analyzed CCTV footage using only the supplied retrieved context.",
            "Use timestamps when supported.",
            "If the evidence is insufficient, say so clearly.",
          ].join("\n"),
        },
        {
          role: "system",
          content: buildQueryContextBlock(input.queryContext),
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
