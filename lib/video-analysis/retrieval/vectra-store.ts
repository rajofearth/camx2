import { promises as fs } from "node:fs";
import type { QueryResult } from "vectra";
import { LocalIndex } from "vectra";
import type { VideoAnalysisRetrievalChunk } from "@/types/video-analysis";
import { vectraIndexDirPath } from "../storage/paths";

type RetrievalIndexMetadata = Record<string, string | number | boolean> & {
  readonly fingerprint: string;
  readonly chunkId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly summary: string;
};

export class LocalVectraStore {
  private readonly index: LocalIndex<RetrievalIndexMetadata>;

  constructor(private readonly fingerprint: string) {
    this.index = new LocalIndex<RetrievalIndexMetadata>(
      vectraIndexDirPath(fingerprint),
    );
  }

  async isCreated(): Promise<boolean> {
    return this.index.isIndexCreated();
  }

  async rebuild(
    chunks: readonly VideoAnalysisRetrievalChunk[],
    vectors: readonly number[][],
  ): Promise<void> {
    const folderPath = vectraIndexDirPath(this.fingerprint);
    await fs.rm(folderPath, { recursive: true, force: true });
    await this.index.createIndex({
      version: 1,
      metadata_config: {
        indexed: ["fingerprint", "chunkId", "startMs", "endMs"],
      },
    });

    await this.index.beginUpdate();
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const vector = vectors[index];
        if (!chunk || !vector) continue;
        await this.index.upsertItem({
          id: chunk.id,
          metadata: {
            fingerprint: this.fingerprint,
            chunkId: chunk.id,
            startMs: chunk.startTimestampMs,
            endMs: chunk.endTimestampMs,
            summary: chunk.summary,
          },
          vector,
        });
      }
      await this.index.endUpdate();
    } catch (error) {
      this.index.cancelUpdate();
      throw error;
    }
  }

  async query(
    vector: readonly number[],
    topK: number,
  ): Promise<QueryResult<RetrievalIndexMetadata>[]> {
    return this.index.queryItems([...vector], "", topK);
  }
}
