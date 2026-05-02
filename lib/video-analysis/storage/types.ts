import type {
  VideoAnalysisFrameArtifact,
  VideoAnalysisGraphArtifact,
  VideoAnalysisRetrievalChunk,
  VideoAnalysisRetrievalEntity,
  VideoAnalysisSummaryArtifact,
  VideoAnalysisTimelineEntry,
} from "@/types/video-analysis";
import type { PersistedVideoAnalysisJob } from "../domain/internal";

export interface VideoFrameManifestEntry {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly timestampLabel: string;
  readonly imagePath: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface VideoFrameManifest {
  readonly fingerprint: string;
  readonly sourceFileName: string;
  readonly sourceByteLength: number;
  readonly videoPath: string;
  readonly frameCount: number;
  readonly createdAt: string;
  readonly frames: readonly VideoFrameManifestEntry[];
}

export interface VideoAnalysisStore {
  ensureRoot(): Promise<void>;
  loadJobByFingerprint(
    fingerprint: string,
  ): Promise<PersistedVideoAnalysisJob | null>;
  loadJobById(jobId: string): Promise<PersistedVideoAnalysisJob | null>;
  saveJob(job: PersistedVideoAnalysisJob): Promise<void>;
  writeSourceVideo(
    fingerprint: string,
    sourceFileName: string,
    videoBuffer: Buffer,
  ): Promise<string>;
  readManifest(fingerprint: string): Promise<VideoFrameManifest | null>;
  saveManifest(manifest: VideoFrameManifest): Promise<void>;
  saveFrameArtifact(
    fingerprint: string,
    artifact: VideoAnalysisFrameArtifact,
  ): Promise<void>;
  readFrameArtifacts(
    fingerprint: string,
  ): Promise<readonly VideoAnalysisFrameArtifact[]>;
  saveTimeline(
    fingerprint: string,
    timeline: readonly VideoAnalysisTimelineEntry[],
  ): Promise<void>;
  readTimeline(
    fingerprint: string,
  ): Promise<readonly VideoAnalysisTimelineEntry[]>;
  saveSummary(
    fingerprint: string,
    summary: VideoAnalysisSummaryArtifact,
  ): Promise<void>;
  readSummary(
    fingerprint: string,
  ): Promise<VideoAnalysisSummaryArtifact | null>;
  saveRetrievalChunks(
    fingerprint: string,
    chunks: readonly VideoAnalysisRetrievalChunk[],
  ): Promise<void>;
  readRetrievalChunks(
    fingerprint: string,
  ): Promise<readonly VideoAnalysisRetrievalChunk[]>;
  saveRetrievalEntities(
    fingerprint: string,
    entities: readonly VideoAnalysisRetrievalEntity[],
  ): Promise<void>;
  readRetrievalEntities(
    fingerprint: string,
  ): Promise<readonly VideoAnalysisRetrievalEntity[]>;
  saveRetrievalGraph(
    fingerprint: string,
    graph: VideoAnalysisGraphArtifact,
  ): Promise<void>;
  readRetrievalGraph(
    fingerprint: string,
  ): Promise<VideoAnalysisGraphArtifact | null>;
  clearJob(fingerprint: string): Promise<void>;
}
