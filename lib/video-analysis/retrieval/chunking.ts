import type {
  VideoAnalysisEntityKind,
  VideoAnalysisRetrievalChunk,
  VideoAnalysisRetrievalEntity,
  VideoAnalysisTimelineEntry,
} from "@/types/video-analysis";
import { dedupeStrings, normalizeWhitespace } from "../utils/text";

function normalizeTokenKey(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return normalizeTokenKey(value).replace(/\s+/g, "-") || "unknown";
}

function classifyEntity(value: string): VideoAnalysisEntityKind {
  const normalized = normalizeTokenKey(value);
  if (
    /\b(person|people|man|men|woman|women|human|subject|individual|guard|worker|pedestrian)\b/.test(
      normalized,
    )
  ) {
    return "person";
  }
  if (
    /\b(car|truck|van|vehicle|bus|bike|bicycle|motorcycle|forklift)\b/.test(
      normalized,
    )
  ) {
    return "vehicle";
  }
  if (
    /\b(corridor|door|gate|entrance|exit|room|hallway|parking|bay|dock)\b/.test(
      normalized,
    )
  ) {
    return "location";
  }
  if (normalized.length === 0) {
    return "unknown";
  }
  return "item";
}

function buildEmbeddingText(entry: VideoAnalysisTimelineEntry): string {
  const lines = [
    `Time range: ${entry.startTimestampLabel} to ${entry.endTimestampLabel}`,
    `Summary: ${entry.summary}`,
  ];

  if (entry.visibleObjects.length > 0) {
    lines.push(`Visible objects: ${entry.visibleObjects.join(", ")}`);
  }
  if (entry.events.length > 0) {
    lines.push(`Events: ${entry.events.join("; ")}`);
  }
  if (entry.continuityNotes.length > 0) {
    lines.push(`Continuity: ${entry.continuityNotes.join("; ")}`);
  }
  return lines.join("\n");
}

export function normalizeEventKey(value: string): string {
  return slugify(value);
}

export function buildRetrievalArtifacts(
  timeline: readonly VideoAnalysisTimelineEntry[],
): {
  readonly chunks: readonly VideoAnalysisRetrievalChunk[];
  readonly entities: readonly VideoAnalysisRetrievalEntity[];
} {
  const entityMap = new Map<
    string,
    {
      readonly id: string;
      readonly label: string;
      readonly normalizedLabel: string;
      readonly kind: VideoAnalysisEntityKind;
      mentions: number;
      chunkIds: Set<string>;
    }
  >();

  const chunks = timeline.map<VideoAnalysisRetrievalChunk>((entry) => {
    const entityIds: string[] = [];
    const objectLabels = dedupeStrings(entry.visibleObjects, 20);
    for (const label of objectLabels) {
      const normalizedLabel = normalizeTokenKey(label);
      if (!normalizedLabel) continue;
      const kind = classifyEntity(label);
      const entityId = `entity:${kind}:${slugify(label)}`;
      entityIds.push(entityId);

      const existing = entityMap.get(entityId);
      if (existing) {
        existing.mentions += 1;
        existing.chunkIds.add(entry.id);
      } else {
        entityMap.set(entityId, {
          id: entityId,
          label,
          normalizedLabel,
          kind,
          mentions: 1,
          chunkIds: new Set([entry.id]),
        });
      }
    }

    return {
      id: entry.id,
      timelineEntryId: entry.id,
      startFrameIndex: entry.startFrameIndex,
      endFrameIndex: entry.endFrameIndex,
      startTimestampMs: entry.startTimestampMs,
      endTimestampMs: entry.endTimestampMs,
      startTimestampLabel: entry.startTimestampLabel,
      endTimestampLabel: entry.endTimestampLabel,
      summary: entry.summary,
      visibleObjects: objectLabels,
      events: dedupeStrings(entry.events, 20),
      continuityNotes: dedupeStrings(entry.continuityNotes, 16),
      entityIds: dedupeStrings(entityIds, 20),
      eventKeys: dedupeStrings(entry.events.map(normalizeEventKey), 20),
      embeddingText: buildEmbeddingText(entry),
    };
  });

  const entities: VideoAnalysisRetrievalEntity[] = [...entityMap.values()]
    .map((entity) => ({
      id: entity.id,
      label: entity.label,
      normalizedLabel: entity.normalizedLabel,
      kind: entity.kind,
      mentions: entity.mentions,
      chunkIds: [...entity.chunkIds].sort(),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return { chunks, entities };
}
