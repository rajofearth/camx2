import type { VectorStoreService } from "@/lib/rag/vector-store.service";
import type { AnalysisRepository } from "@/lib/video-analysis/analysis-repository";
import { embedText } from "@/lib/video-analysis/lmstudio";
import type {
  CompactTimeline,
  EmbeddingMetadata,
  GlobalEntityRegistry,
} from "@/lib/video-analysis/types";

const DEFAULT_TOP_K = 8;
const HIGH_SIMILARITY_THRESHOLD = 0.9;

function parseTimestampToMs(value: string): number | null {
  const parts = value.split(":").map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) {
    return null;
  }

  if (parts.length === 2) {
    const [minutesPart, secondsPart] = parts;
    const [seconds, millis = "0"] = secondsPart.split(".");
    const minutes = Number(minutesPart);
    if (!Number.isFinite(minutes)) {
      return null;
    }

    return (
      minutes * 60_000 +
      Number(seconds) * 1000 +
      Number(millis.padEnd(3, "0").slice(0, 3))
    );
  }

  if (parts.length === 3) {
    const [hoursPart, minutesPart, secondsPart] = parts;
    const [seconds, millis = "0"] = secondsPart.split(".");
    const hours = Number(hoursPart);
    const minutes = Number(minutesPart);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    return (
      hours * 3_600_000 +
      minutes * 60_000 +
      Number(seconds) * 1000 +
      Number(millis.padEnd(3, "0").slice(0, 3))
    );
  }

  return null;
}

function extractTimeRange(
  question: string,
): { startMs: number; endMs: number } | null {
  const matches = [
    ...question.matchAll(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\b/g),
  ]
    .map((match) => parseTimestampToMs(match[0]))
    .filter((value): value is number => value !== null);

  if (matches.length >= 2) {
    return {
      startMs: Math.min(matches[0], matches[1]),
      endMs: Math.max(matches[0], matches[1]),
    };
  }

  if (matches.length === 1) {
    return {
      startMs: Math.max(0, matches[0] - 30_000),
      endMs: matches[0] + 30_000,
    };
  }

  return null;
}

function extractKeywords(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3),
    ),
  ];
}

function withinTimeRange(
  metadata: EmbeddingMetadata,
  range: { startMs: number; endMs: number } | null,
): boolean {
  if (!range || metadata.timestampMs < 0) {
    return true;
  }
  return (
    metadata.timestampMs >= range.startMs && metadata.timestampMs <= range.endMs
  );
}

function matchesKeywords(
  metadata: EmbeddingMetadata,
  keywords: readonly string[],
): boolean {
  if (keywords.length === 0) {
    return true;
  }

  const haystack = `${metadata.text} ${metadata.keywords}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function formatRegistrySummary(registry: GlobalEntityRegistry | null): string {
  if (!registry || registry.entities.length === 0) {
    return "No persistent entities were recorded.";
  }

  return registry.entities
    .slice(0, 10)
    .map(
      (entity) =>
        `${entity.id} (${entity.label}) first seen ${entity.firstSeenLabel}, last seen ${entity.lastSeenLabel}, mentions ${entity.totalMentions}`,
    )
    .join("\n");
}

function formatTimelineSummary(timeline: CompactTimeline | null): string {
  if (!timeline || timeline.entries.length === 0) {
    return "No compact timeline is available.";
  }

  const entries = timeline.entries;
  const checkpoints = [
    entries[0],
    entries[Math.floor(entries.length / 2)],
    entries.at(-1),
  ].filter(
    (value): value is CompactTimeline["entries"][number] => value !== undefined,
  );

  return checkpoints
    .map((entry) => `${entry.timestampLabel}: ${entry.text}`)
    .join("\n");
}

export class ChatContextBuilder {
  constructor(
    private readonly repository: AnalysisRepository,
    private readonly vectorStore: VectorStoreService,
  ) {}

  async buildContext(input: {
    readonly jobId: string;
    readonly question: string;
  }): Promise<string> {
    const fingerprint = await this.repository.resolveFingerprintByJobId(
      input.jobId,
    );
    if (!fingerprint) {
      throw new Error("Video analysis is not ready yet");
    }

    const questionHash = this.repository.questionHash(input.question);
    const cached = await this.repository.readCachedQuestionContext<{
      context: string;
    }>(fingerprint, questionHash);
    if (cached?.context) {
      return cached.context;
    }

    const [registry, timeline, reference] = await Promise.all([
      this.repository.loadRegistryByJobId(input.jobId),
      this.repository.loadCompactTimelineByJobId(input.jobId),
      this.repository.resolveReference({ jobId: input.jobId }),
    ]);
    if (!reference) {
      throw new Error("Video analysis is not ready yet");
    }

    const queryEmbedding = await embedText(input.question);
    const timeRange = extractTimeRange(input.question);
    const keywords = extractKeywords(input.question);
    const rawResults = await this.vectorStore.query(
      reference.fingerprint,
      queryEmbedding,
      input.question,
      DEFAULT_TOP_K,
    );

    const filteredResults = rawResults.filter(
      (result) =>
        withinTimeRange(result.metadata, timeRange) &&
        matchesKeywords(result.metadata, keywords),
    );
    const highConfidence = filteredResults.filter(
      (result) => result.score >= HIGH_SIMILARITY_THRESHOLD,
    );
    const selectedSource =
      highConfidence.length > 0
        ? highConfidence
        : filteredResults.length > 0
          ? filteredResults
          : rawResults;
    const selected = selectedSource.slice(0, 5).map((result) => {
      const prefix =
        result.metadata.timestampLabel &&
        !result.metadata.text.startsWith(result.metadata.timestampLabel)
          ? `${result.metadata.timestampLabel}: `
          : "";
      return `${prefix}${result.metadata.text}`;
    });

    const context = [
      "Persistent entities:",
      formatRegistrySummary(registry),
      "",
      "Compact timeline checkpoints:",
      formatTimelineSummary(timeline),
      "",
      "Retrieved evidence:",
      selected.length > 0
        ? selected.join("\n")
        : "No high-confidence evidence retrieved.",
    ].join("\n");

    await this.repository.writeCachedQuestionContext(
      fingerprint,
      questionHash,
      {
        context,
      },
    );
    return context;
  }
}
