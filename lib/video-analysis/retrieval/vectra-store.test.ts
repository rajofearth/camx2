import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import test from "node:test";
import { jobDir } from "../storage/paths";
import { LocalVectraStore } from "./vectra-store";

test("LocalVectraStore rebuilds and queries vectors", async () => {
  const fingerprint = `test-${randomUUID()}`;
  const store = new LocalVectraStore(fingerprint);

  try {
    await store.rebuild(
      [
        {
          id: "chunk-a",
          timelineEntryId: "chunk-a",
          startFrameIndex: 0,
          endFrameIndex: 0,
          startTimestampMs: 0,
          endTimestampMs: 0,
          startTimestampLabel: "00:00.000",
          endTimestampLabel: "00:00.000",
          summary: "Red car enters.",
          visibleObjects: ["car"],
          events: ["car enters"],
          continuityNotes: [],
          entityIds: ["entity:vehicle:car"],
          eventKeys: ["car-enters"],
          embeddingText: "Red car enters.",
        },
        {
          id: "chunk-b",
          timelineEntryId: "chunk-b",
          startFrameIndex: 1,
          endFrameIndex: 1,
          startTimestampMs: 1_000,
          endTimestampMs: 1_000,
          startTimestampLabel: "00:01.000",
          endTimestampLabel: "00:01.000",
          summary: "Person waits.",
          visibleObjects: ["person"],
          events: ["person waits"],
          continuityNotes: [],
          entityIds: ["entity:person:person"],
          eventKeys: ["person-waits"],
          embeddingText: "Person waits.",
        },
      ],
      [
        [1, 0, 0],
        [0, 1, 0],
      ],
    );

    const results = await store.query([0.9, 0.1, 0], 1);
    assert.equal(results[0]?.item.id, "chunk-a");
  } finally {
    await fs.rm(jobDir(fingerprint), { recursive: true, force: true });
  }
});
