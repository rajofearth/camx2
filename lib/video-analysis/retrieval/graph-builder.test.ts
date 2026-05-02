import assert from "node:assert/strict";
import test from "node:test";
import { buildRetrievalGraph } from "./graph-builder";

test("buildRetrievalGraph creates temporal, continuity, and co-occurrence edges", () => {
  const graph = buildRetrievalGraph({
    chunks: [
      {
        id: "chunk-1",
        timelineEntryId: "chunk-1",
        startFrameIndex: 0,
        endFrameIndex: 1,
        startTimestampMs: 0,
        endTimestampMs: 1_000,
        startTimestampLabel: "00:00.000",
        endTimestampLabel: "00:01.000",
        summary: "Person walks into corridor.",
        visibleObjects: ["person", "door"],
        events: ["person enters"],
        continuityNotes: ["new subject appears"],
        entityIds: ["entity:person:person", "entity:item:door"],
        eventKeys: ["person-enters"],
        embeddingText: "ignored",
      },
      {
        id: "chunk-2",
        timelineEntryId: "chunk-2",
        startFrameIndex: 2,
        endFrameIndex: 3,
        startTimestampMs: 2_000,
        endTimestampMs: 3_000,
        startTimestampLabel: "00:02.000",
        endTimestampLabel: "00:03.000",
        summary: "Person remains in corridor.",
        visibleObjects: ["person"],
        events: ["person pauses"],
        continuityNotes: ["same subject remains"],
        entityIds: ["entity:person:person"],
        eventKeys: ["person-pauses"],
        embeddingText: "ignored",
      },
    ],
    entities: [
      {
        id: "entity:person:person",
        label: "person",
        normalizedLabel: "person",
        kind: "person",
        mentions: 2,
        chunkIds: ["chunk-1", "chunk-2"],
      },
      {
        id: "entity:item:door",
        label: "door",
        normalizedLabel: "door",
        kind: "item",
        mentions: 1,
        chunkIds: ["chunk-1"],
      },
    ],
  });

  assert.ok(graph.nodes.some((node) => node.id === "chunk-1"));
  assert.ok(graph.nodes.some((node) => node.id === "entity:person:person"));
  assert.ok(graph.nodes.some((node) => node.id === "event:person-enters"));
  assert.ok(graph.edges.some((edge) => edge.kind === "temporal"));
  assert.ok(graph.edges.some((edge) => edge.kind === "continuity"));
  assert.ok(graph.edges.some((edge) => edge.kind === "co_occurs"));
});
