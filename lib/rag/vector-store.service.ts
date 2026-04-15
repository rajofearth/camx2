import { LocalIndex } from "vectra";
import { vectraDir } from "@/lib/video-analysis/storage";
import type {
  EmbeddingMetadata,
  EmbeddingRecord,
} from "@/lib/video-analysis/types";

export interface VectorQueryResult {
  readonly score: number;
  readonly metadata: EmbeddingMetadata;
}

export class VectorStoreService {
  private readonly indexes = new Map<string, LocalIndex<EmbeddingMetadata>>();

  private async getIndex(
    videoId: string,
  ): Promise<LocalIndex<EmbeddingMetadata>> {
    const cached = this.indexes.get(videoId);
    if (cached) {
      return cached;
    }

    const index = new LocalIndex<EmbeddingMetadata>(vectraDir(videoId));
    if (!(await index.isIndexCreated())) {
      await index.createIndex();
    }

    this.indexes.set(videoId, index);
    return index;
  }

  async createIndexForVideo(videoId: string): Promise<void> {
    await this.getIndex(videoId);
  }

  async addFrameEmbedding(record: EmbeddingRecord): Promise<void> {
    const index = await this.getIndex(record.metadata.videoId);
    await index.insertItem({
      vector: [...record.vector],
      metadata: record.metadata,
    });
  }

  async resetVideoIndex(videoId: string): Promise<void> {
    const index = new LocalIndex<EmbeddingMetadata>(vectraDir(videoId));
    if (await index.isIndexCreated()) {
      await index.deleteIndex();
    }
    this.indexes.delete(videoId);
  }

  async query(
    videoId: string,
    queryEmbedding: readonly number[],
    queryText: string,
    topK: number,
  ): Promise<VectorQueryResult[]> {
    if (queryEmbedding.length === 0 || topK <= 0) {
      return [];
    }

    const index = await this.getIndex(videoId);
    const results = await index.queryItems(
      [...queryEmbedding],
      queryText,
      topK,
    );
    return results
      .map((result) => {
        const metadata = result.item.metadata;
        if (!metadata) {
          return null;
        }

        return {
          score: result.score,
          metadata,
        } satisfies VectorQueryResult;
      })
      .filter((value): value is VectorQueryResult => value !== null);
  }
}
