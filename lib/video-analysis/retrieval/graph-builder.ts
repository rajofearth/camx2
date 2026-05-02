import type {
  VideoAnalysisGraphArtifact,
  VideoAnalysisGraphEdge,
  VideoAnalysisGraphNode,
  VideoAnalysisRetrievalChunk,
  VideoAnalysisRetrievalEntity,
} from "@/types/video-analysis";
import { normalizeEventKey } from "./chunking";

function eventNodeId(eventKey: string): string {
  return `event:${eventKey}`;
}

function eventLabel(key: string): string {
  return key.replace(/-/g, " ");
}

export function buildRetrievalGraph(input: {
  readonly chunks: readonly VideoAnalysisRetrievalChunk[];
  readonly entities: readonly VideoAnalysisRetrievalEntity[];
}): VideoAnalysisGraphArtifact {
  const nodes: VideoAnalysisGraphNode[] = [];
  const edges: VideoAnalysisGraphEdge[] = [];
  const eventChunks = new Map<string, Set<string>>();

  for (const chunk of input.chunks) {
    nodes.push({
      id: chunk.id,
      kind: "chunk",
      label:
        chunk.startTimestampLabel === chunk.endTimestampLabel
          ? chunk.startTimestampLabel
          : `${chunk.startTimestampLabel}-${chunk.endTimestampLabel}`,
      chunkIds: [chunk.id],
    });

    for (const event of chunk.events) {
      const key = normalizeEventKey(event);
      if (!key) continue;
      const existing = eventChunks.get(key);
      if (existing) {
        existing.add(chunk.id);
      } else {
        eventChunks.set(key, new Set([chunk.id]));
      }
    }
  }

  for (const entity of input.entities) {
    nodes.push({
      id: entity.id,
      kind: "entity",
      label: entity.label,
      chunkIds: entity.chunkIds,
    });
    for (const chunkId of entity.chunkIds) {
      edges.push({
        id: `edge:${chunkId}:${entity.id}`,
        from: chunkId,
        to: entity.id,
        kind: "co_occurs",
        weight: 1,
      });
    }
  }

  for (const [key, chunkIds] of eventChunks) {
    const nodeId = eventNodeId(key);
    const linkedChunkIds = [...chunkIds].sort();
    nodes.push({
      id: nodeId,
      kind: "event",
      label: eventLabel(key),
      chunkIds: linkedChunkIds,
    });
    for (const chunkId of linkedChunkIds) {
      edges.push({
        id: `edge:${chunkId}:${nodeId}`,
        from: chunkId,
        to: nodeId,
        kind: "co_occurs",
        weight: 1,
      });
    }
  }

  for (let index = 0; index < input.chunks.length - 1; index += 1) {
    const current = input.chunks[index];
    const next = input.chunks[index + 1];
    edges.push({
      id: `edge:${current.id}:${next.id}:temporal`,
      from: current.id,
      to: next.id,
      kind: "temporal",
      weight: 1,
    });

    const sharedEntities = current.entityIds.filter((entityId) =>
      next.entityIds.includes(entityId),
    ).length;
    const sharedEvents = current.eventKeys.filter((eventKey) =>
      next.eventKeys.includes(eventKey),
    ).length;
    const continuityWeight = sharedEntities + sharedEvents;
    if (continuityWeight > 0) {
      edges.push({
        id: `edge:${current.id}:${next.id}:continuity`,
        from: current.id,
        to: next.id,
        kind: "continuity",
        weight: continuityWeight,
      });
    }
  }

  return { nodes, edges };
}
