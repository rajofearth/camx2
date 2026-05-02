import type {
  GraphMatch,
  RetrievedEvidenceChunk,
  VideoAnalysisChatMessage,
  VideoAnalysisGraphArtifact,
  VideoAnalysisGraphNode,
  VideoAnalysisRetrievalChunk,
  VideoAnalysisRetrievalEntity,
  VideoAnalysisSummaryArtifact,
  VideoAnalysisTimelineEntry,
  VideoQueryContextInput,
  VideoQueryContextResult,
} from "@/types/video-analysis";
import { VideoAnalysisError } from "../contracts/error-codes";
import type { PersistedVideoAnalysisJob } from "../domain/internal";
import type { VideoAnalysisProvider } from "../providers/types";
import type { VideoAnalysisStore } from "../storage/types";
import { normalizeWhitespace } from "../utils/text";
import { buildRetrievalArtifacts } from "./chunking";
import { buildRetrievalGraph } from "./graph-builder";
import { resolveTimeRange, timeRangeIntersects } from "./time-range";
import { LocalVectraStore } from "./vectra-store";

function buildSemanticQuery(
  question: string,
  conversation: readonly VideoAnalysisChatMessage[],
): string {
  const hints = conversation
    .slice(-4)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  return hints ? `${question}\n\nRecent conversation:\n${hints}` : question;
}

function intersectsRequestedRange(
  chunk: VideoAnalysisRetrievalChunk,
  startMs: number,
  endMs: number,
): boolean {
  return timeRangeIntersects(
    { startMs, endMs },
    {
      startMs: chunk.startTimestampMs,
      endMs: chunk.endTimestampMs,
    },
  );
}

function toEvidenceChunk(
  chunk: VideoAnalysisRetrievalChunk,
  score: number | null,
  reasons: readonly string[],
): RetrievedEvidenceChunk {
  return {
    chunkId: chunk.id,
    startTimestampLabel: chunk.startTimestampLabel,
    endTimestampLabel: chunk.endTimestampLabel,
    startTimestampMs: chunk.startTimestampMs,
    endTimestampMs: chunk.endTimestampMs,
    summary: chunk.summary,
    visibleObjects: chunk.visibleObjects,
    events: chunk.events,
    continuityNotes: chunk.continuityNotes,
    score,
    reasons,
  };
}

function graphNodeIndex(
  graph: VideoAnalysisGraphArtifact,
): Map<string, VideoAnalysisGraphNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function collectGraphMatches(input: {
  readonly graph: VideoAnalysisGraphArtifact;
  readonly semanticScores: ReadonlyMap<string, number>;
  readonly selectedChunkIds: ReadonlySet<string>;
}): readonly GraphMatch[] {
  const nodeById = graphNodeIndex(input.graph);
  const matches = new Map<string, GraphMatch>();

  for (const [chunkId, score] of input.semanticScores) {
    const chunkNode = nodeById.get(chunkId);
    if (chunkNode) {
      matches.set(chunkNode.id, {
        nodeId: chunkNode.id,
        nodeKind: chunkNode.kind,
        label: chunkNode.label,
        score,
        reason: "semantic match",
        linkedChunkIds: chunkNode.chunkIds,
      });
    }

    for (const edge of input.graph.edges) {
      if (edge.from !== chunkId && edge.to !== chunkId) continue;
      const neighborId = edge.from === chunkId ? edge.to : edge.from;
      const node = nodeById.get(neighborId);
      if (!node) continue;

      const linkedChunkIds = node.chunkIds.filter((id) =>
        input.selectedChunkIds.has(id),
      );
      if (linkedChunkIds.length === 0 && node.kind !== "chunk") {
        linkedChunkIds.push(...node.chunkIds.slice(0, 3));
      }

      matches.set(neighborId, {
        nodeId: neighborId,
        nodeKind: node.kind,
        label: node.label,
        score: Math.max(score * Math.max(edge.weight, 1), 0.01),
        reason:
          edge.kind === "continuity"
            ? "continuity neighbor"
            : edge.kind === "temporal"
              ? "temporal neighbor"
              : "related co-occurrence",
        linkedChunkIds,
      });
    }
  }

  return [...matches.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 12);
}

export async function ensureRetrievalArtifacts(input: {
  readonly fingerprint: string;
  readonly timeline: readonly VideoAnalysisTimelineEntry[];
  readonly store: VideoAnalysisStore;
  readonly provider: VideoAnalysisProvider;
}): Promise<{
  readonly chunks: readonly VideoAnalysisRetrievalChunk[];
  readonly entities: readonly VideoAnalysisRetrievalEntity[];
  readonly graph: VideoAnalysisGraphArtifact;
}> {
  let [chunks, entities, graph] = await Promise.all([
    input.store.readRetrievalChunks(input.fingerprint),
    input.store.readRetrievalEntities(input.fingerprint),
    input.store.readRetrievalGraph(input.fingerprint),
  ]);

  const vectraStore = new LocalVectraStore(input.fingerprint);
  const shouldRebuildArtifacts =
    chunks.length === 0 || entities.length === 0 || graph === null;

  if (shouldRebuildArtifacts) {
    const built = buildRetrievalArtifacts(input.timeline);
    graph = buildRetrievalGraph(built);
    chunks = built.chunks;
    entities = built.entities;
    await Promise.all([
      input.store.saveRetrievalChunks(input.fingerprint, chunks),
      input.store.saveRetrievalEntities(input.fingerprint, entities),
      input.store.saveRetrievalGraph(input.fingerprint, graph),
    ]);
  }

  if (chunks.length === 0 || graph === null) {
    return { chunks: [], entities: [], graph: { nodes: [], edges: [] } };
  }

  if (shouldRebuildArtifacts || !(await vectraStore.isCreated())) {
    const vectors = await input.provider.embedTexts(
      chunks.map((chunk) => chunk.embeddingText),
    );
    await vectraStore.rebuild(chunks, vectors);
  }

  return { chunks, entities, graph };
}

export async function resolveVideoQueryContext(input: {
  readonly job: PersistedVideoAnalysisJob;
  readonly store: VideoAnalysisStore;
  readonly provider: VideoAnalysisProvider;
  readonly summary: VideoAnalysisSummaryArtifact;
  readonly timeline: readonly VideoAnalysisTimelineEntry[];
  readonly request: Omit<VideoQueryContextInput, "jobId">;
}): Promise<VideoQueryContextResult> {
  const normalizedQuestion = normalizeWhitespace(input.request.question);
  if (!normalizedQuestion) {
    throw new VideoAnalysisError("BAD_REQUEST", 400, "Question is required");
  }

  const resolvedTimeRange = resolveTimeRange(
    input.request.timeRange,
    normalizedQuestion,
  );
  const retrieval = await ensureRetrievalArtifacts({
    fingerprint: input.job.fingerprint,
    timeline: input.timeline,
    store: input.store,
    provider: input.provider,
  });

  if (retrieval.chunks.length === 0) {
    return {
      summary: "No retrieval artifacts are available for this video yet.",
      normalizedQuestion,
      resolvedTimeRange,
      evidence: [],
      graphMatches: [],
      coverage: resolvedTimeRange ? "time_range" : "semantic",
      insufficientEvidence: true,
      summaryModelKey: input.summary.modelKey,
    };
  }

  const semanticQuery = buildSemanticQuery(
    normalizedQuestion,
    input.request.conversation ?? [],
  );
  const [queryVector] = await input.provider.embedTexts([semanticQuery]);
  const vectraStore = new LocalVectraStore(input.job.fingerprint);
  const semanticResults = await vectraStore.query(queryVector, 6);
  const chunkById = new Map(retrieval.chunks.map((chunk) => [chunk.id, chunk]));
  const selection = new Map<
    string,
    { score: number | null; reasons: Set<string> }
  >();
  const semanticScores = new Map<string, number>();

  for (const result of semanticResults) {
    const chunkId = result.item.metadata.chunkId;
    const current = selection.get(chunkId) ?? {
      score: result.score,
      reasons: new Set<string>(),
    };
    current.score =
      current.score === null
        ? result.score
        : Math.max(current.score, result.score);
    current.reasons.add("semantic match");
    selection.set(chunkId, current);
    semanticScores.set(chunkId, result.score);
  }

  if (resolvedTimeRange) {
    for (const chunk of retrieval.chunks) {
      if (
        intersectsRequestedRange(
          chunk,
          resolvedTimeRange.startMs,
          resolvedTimeRange.endMs,
        )
      ) {
        const current = selection.get(chunk.id) ?? {
          score: null,
          reasons: new Set<string>(),
        };
        current.reasons.add("requested time range");
        selection.set(chunk.id, current);
      }
    }
  }

  const graphMatches = collectGraphMatches({
    graph: retrieval.graph,
    semanticScores,
    selectedChunkIds: new Set(selection.keys()),
  });

  for (const match of graphMatches) {
    for (const chunkId of match.linkedChunkIds) {
      if (!chunkById.has(chunkId)) continue;
      const current = selection.get(chunkId) ?? {
        score: null,
        reasons: new Set<string>(),
      };
      current.score =
        current.score === null
          ? match.score
          : Math.max(current.score, match.score);
      current.reasons.add(match.reason);
      selection.set(chunkId, current);
    }
  }

  const evidence = [...selection.entries()]
    .map(([chunkId, value]) => {
      const chunk = chunkById.get(chunkId);
      if (!chunk) return null;
      return toEvidenceChunk(chunk, value.score, [...value.reasons]);
    })
    .filter((chunk): chunk is RetrievedEvidenceChunk => chunk !== null)
    .sort((left, right) => {
      if (resolvedTimeRange) {
        return left.startTimestampMs - right.startTimestampMs;
      }
      const rightScore = right.score ?? -1;
      const leftScore = left.score ?? -1;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return left.startTimestampMs - right.startTimestampMs;
    })
    .slice(0, 8);

  const coverage =
    resolvedTimeRange && semanticResults.length > 0
      ? "hybrid"
      : resolvedTimeRange
        ? "time_range"
        : "semantic";
  const insufficientEvidence = evidence.length === 0;
  const summaryResponse = await input.provider.summarizeQueryContext({
    question: normalizedQuestion,
    summary: input.summary,
    resolvedTimeRange,
    evidence,
    graphMatches,
    conversation: input.request.conversation ?? [],
    insufficientEvidence,
  });

  return {
    summary: summaryResponse.summary,
    normalizedQuestion,
    resolvedTimeRange,
    evidence,
    graphMatches,
    coverage,
    insufficientEvidence,
    summaryModelKey: summaryResponse.modelKey,
  };
}
