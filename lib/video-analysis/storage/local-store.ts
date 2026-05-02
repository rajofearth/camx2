import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type {
  VideoAnalysisFrameArtifact,
  VideoAnalysisGraphArtifact,
  VideoAnalysisRetrievalChunk,
  VideoAnalysisRetrievalEntity,
  VideoAnalysisSummaryArtifact,
  VideoAnalysisTimelineEntry,
} from "@/types/video-analysis";
import {
  frameArtifactSchema,
  persistedJobRecordSchema,
  summaryArtifactSchema,
  timelineEntrySchema,
} from "../contracts/schemas";
import type { PersistedVideoAnalysisJob } from "../domain/internal";
import {
  retrievalChunkSchema,
  retrievalEntitySchema,
  graphArtifactSchema as retrievalGraphArtifactSchema,
} from "../retrieval/contracts";
import { readJsonFile, writeJsonFile } from "../utils/json";
import {
  frameArtifactPath,
  frameArtifactsDirPath,
  jobDir,
  manifestFilePath,
  retrievalChunksFilePath,
  retrievalDirPath,
  retrievalEntitiesFilePath,
  retrievalGraphFilePath,
  sourceVideoPath,
  stateFilePath,
  summaryFilePath,
  timelineFilePath,
  VIDEO_ANALYSIS_ROOT,
} from "./paths";
import type { VideoAnalysisStore, VideoFrameManifest } from "./types";

const manifestSchema = z.object({
  fingerprint: z.string().min(1),
  sourceFileName: z.string().min(1),
  sourceByteLength: z.number().int().nonnegative(),
  videoPath: z.string().min(1),
  frameCount: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  frames: z.array(
    z.object({
      frameIndex: z.number().int().nonnegative(),
      timestampMs: z.number().nonnegative(),
      timestampLabel: z.string().min(1),
      imagePath: z.string().min(1),
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
    }),
  ),
});

export class LocalVideoAnalysisStore implements VideoAnalysisStore {
  async ensureRoot(): Promise<void> {
    await fs.mkdir(VIDEO_ANALYSIS_ROOT, { recursive: true });
  }

  async loadJobByFingerprint(
    fingerprint: string,
  ): Promise<PersistedVideoAnalysisJob | null> {
    const job = await readJsonFile(
      fs,
      stateFilePath(fingerprint),
      persistedJobRecordSchema,
    );
    return job as PersistedVideoAnalysisJob | null;
  }

  async loadJobById(jobId: string): Promise<PersistedVideoAnalysisJob | null> {
    await this.ensureRoot();
    const entries = await fs.readdir(VIDEO_ANALYSIS_ROOT).catch(() => []);
    for (const entry of entries) {
      const job = await this.loadJobByFingerprint(entry);
      if (job?.jobId === jobId) return job;
    }
    return null;
  }

  async saveJob(job: PersistedVideoAnalysisJob): Promise<void> {
    await fs.mkdir(jobDir(job.fingerprint), { recursive: true });
    await writeJsonFile(fs, stateFilePath(job.fingerprint), job);
  }

  async writeSourceVideo(
    fingerprint: string,
    sourceFileName: string,
    videoBuffer: Buffer,
  ): Promise<string> {
    const targetPath = sourceVideoPath(fingerprint, sourceFileName);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, videoBuffer);
    return targetPath;
  }

  async readManifest(fingerprint: string): Promise<VideoFrameManifest | null> {
    return readJsonFile(fs, manifestFilePath(fingerprint), manifestSchema);
  }

  async saveManifest(manifest: VideoFrameManifest): Promise<void> {
    await fs.mkdir(jobDir(manifest.fingerprint), { recursive: true });
    await writeJsonFile(fs, manifestFilePath(manifest.fingerprint), manifest);
  }

  async saveFrameArtifact(
    fingerprint: string,
    artifact: VideoAnalysisFrameArtifact,
  ): Promise<void> {
    await fs.mkdir(frameArtifactsDirPath(fingerprint), { recursive: true });
    await writeJsonFile(
      fs,
      frameArtifactPath(fingerprint, artifact.frameIndex),
      artifact,
    );
  }

  async readFrameArtifacts(
    fingerprint: string,
  ): Promise<readonly VideoAnalysisFrameArtifact[]> {
    const dir = frameArtifactsDirPath(fingerprint);
    const entries = await fs.readdir(dir).catch(() => []);
    const artifacts = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .sort()
        .map((entry) =>
          readJsonFile(fs, path.join(dir, entry), frameArtifactSchema),
        ),
    );
    return artifacts.filter(Boolean) as readonly VideoAnalysisFrameArtifact[];
  }

  async saveTimeline(
    fingerprint: string,
    timeline: readonly VideoAnalysisTimelineEntry[],
  ): Promise<void> {
    await writeJsonFile(fs, timelineFilePath(fingerprint), timeline);
  }

  async readTimeline(
    fingerprint: string,
  ): Promise<readonly VideoAnalysisTimelineEntry[]> {
    const schema = z.array(timelineEntrySchema);
    return (
      (await readJsonFile(fs, timelineFilePath(fingerprint), schema)) ?? []
    );
  }

  async saveSummary(
    fingerprint: string,
    summary: VideoAnalysisSummaryArtifact,
  ): Promise<void> {
    await writeJsonFile(fs, summaryFilePath(fingerprint), summary);
  }

  async readSummary(
    fingerprint: string,
  ): Promise<VideoAnalysisSummaryArtifact | null> {
    return readJsonFile(
      fs,
      summaryFilePath(fingerprint),
      summaryArtifactSchema,
    );
  }

  async saveRetrievalChunks(
    fingerprint: string,
    chunks: readonly VideoAnalysisRetrievalChunk[],
  ): Promise<void> {
    await fs.mkdir(retrievalDirPath(fingerprint), { recursive: true });
    await writeJsonFile(fs, retrievalChunksFilePath(fingerprint), chunks);
  }

  async readRetrievalChunks(
    fingerprint: string,
  ): Promise<readonly VideoAnalysisRetrievalChunk[]> {
    const schema = z.array(retrievalChunkSchema);
    return (
      (await readJsonFile(fs, retrievalChunksFilePath(fingerprint), schema)) ??
      []
    );
  }

  async saveRetrievalEntities(
    fingerprint: string,
    entities: readonly VideoAnalysisRetrievalEntity[],
  ): Promise<void> {
    await fs.mkdir(retrievalDirPath(fingerprint), { recursive: true });
    await writeJsonFile(fs, retrievalEntitiesFilePath(fingerprint), entities);
  }

  async readRetrievalEntities(
    fingerprint: string,
  ): Promise<readonly VideoAnalysisRetrievalEntity[]> {
    const schema = z.array(retrievalEntitySchema);
    return (
      (await readJsonFile(
        fs,
        retrievalEntitiesFilePath(fingerprint),
        schema,
      )) ?? []
    );
  }

  async saveRetrievalGraph(
    fingerprint: string,
    graph: VideoAnalysisGraphArtifact,
  ): Promise<void> {
    await fs.mkdir(retrievalDirPath(fingerprint), { recursive: true });
    await writeJsonFile(fs, retrievalGraphFilePath(fingerprint), graph);
  }

  async readRetrievalGraph(
    fingerprint: string,
  ): Promise<VideoAnalysisGraphArtifact | null> {
    return readJsonFile(
      fs,
      retrievalGraphFilePath(fingerprint),
      retrievalGraphArtifactSchema,
    );
  }

  async clearJob(fingerprint: string): Promise<void> {
    await fs.rm(jobDir(fingerprint), { recursive: true, force: true });
  }
}
