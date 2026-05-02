import type {
  GraphMatch,
  RetrievedEvidenceChunk,
  VideoQueryContextResult,
} from "@/types/video-analysis";

export function renderEvidenceChunk(chunk: RetrievedEvidenceChunk): string {
  const timeRange =
    chunk.startTimestampLabel === chunk.endTimestampLabel
      ? chunk.startTimestampLabel
      : `${chunk.startTimestampLabel}-${chunk.endTimestampLabel}`;

  const lines = [`${timeRange}: ${chunk.summary}`];
  if (chunk.visibleObjects.length > 0) {
    lines.push(`Objects: ${chunk.visibleObjects.join(", ")}`);
  }
  if (chunk.events.length > 0) {
    lines.push(`Events: ${chunk.events.join("; ")}`);
  }
  if (chunk.continuityNotes.length > 0) {
    lines.push(`Continuity: ${chunk.continuityNotes.join("; ")}`);
  }
  return lines.join("\n");
}

export function renderGraphMatch(match: GraphMatch): string {
  return `${match.nodeKind}: ${match.label} (${match.reason})`;
}

export function buildQueryContextBlock(
  context: VideoQueryContextResult,
): string {
  const lines = [
    `Coverage: ${context.coverage}`,
    context.resolvedTimeRange
      ? `Resolved time window: ${context.resolvedTimeRange.startMs}-${context.resolvedTimeRange.endMs}ms`
      : "Resolved time window: none",
    `Insufficient evidence: ${context.insufficientEvidence ? "yes" : "no"}`,
    "",
    "Question-aware summary:",
    context.summary,
    "",
    "Evidence:",
    context.evidence.map(renderEvidenceChunk).join("\n\n") ||
      "No evidence retrieved.",
  ];

  if (context.graphMatches.length > 0) {
    lines.push(
      "",
      "Related graph matches:",
      context.graphMatches.map(renderGraphMatch).join("\n"),
    );
  }

  return lines.join("\n");
}
