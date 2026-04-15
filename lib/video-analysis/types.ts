export interface TrackedObject {
  readonly id: string;
  readonly label: string;
  readonly confidence: number;
  readonly attributes: readonly string[];
  readonly firstSeenMs: number;
  readonly firstSeenLabel: string;
  readonly lastSeenMs: number;
  readonly lastSeenLabel: string;
  readonly status: "active" | "inactive";
}

export interface FrameEvent {
  readonly type: string;
  readonly description: string;
  readonly objectIds: readonly string[];
}

export interface FrameAnalysis {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly timestampLabel: string;
  readonly sceneChanged: boolean;
  readonly skipped: boolean;
  readonly summaryText: string;
  readonly newOrUpdatedObjects: readonly TrackedObject[];
  readonly events: readonly FrameEvent[];
  readonly anomalies: readonly string[];
  readonly updatedRollingSummary: string;
  readonly rawResponse: string;
  readonly modelKey: string;
  readonly latencyMs: number;
  readonly error: string | null;
}

export interface VideoState {
  readonly videoId: string;
  readonly rollingSummary: string;
  readonly trackedObjects: readonly TrackedObject[];
  readonly recentEvents: ReadonlyArray<
    FrameEvent & {
      readonly timestampMs: number;
      readonly timestampLabel: string;
    }
  >;
  readonly activeAnomalies: readonly string[];
  readonly lastFrameIndex: number;
  readonly lastTimestampMs: number;
}

export interface GlobalEntityRegistryEntry {
  readonly id: string;
  readonly label: string;
  readonly firstSeenMs: number;
  readonly firstSeenLabel: string;
  readonly lastSeenMs: number;
  readonly lastSeenLabel: string;
  readonly totalMentions: number;
  readonly attributes: readonly string[];
}

export interface GlobalEntityRegistry {
  readonly videoId: string;
  readonly generatedAt: string;
  readonly totalUniqueObjects: number;
  readonly entities: readonly GlobalEntityRegistryEntry[];
}

export interface CompactTimelineEntry {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly timestampLabel: string;
  readonly text: string;
  readonly objectIds: readonly string[];
  readonly events: readonly string[];
  readonly anomalies: readonly string[];
  readonly skipped: boolean;
}

export interface CompactTimeline {
  readonly videoId: string;
  readonly generatedAt: string;
  readonly entries: readonly CompactTimelineEntry[];
}

export interface EmbeddingMetadata {
  readonly [key: string]: string | number | boolean;
  readonly videoId: string;
  readonly source: "frame" | "timeline" | "registry";
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly timestampLabel: string;
  readonly text: string;
  readonly objects: string;
  readonly events: string;
  readonly anomalies: string;
  readonly keywords: string;
}

export interface EmbeddingRecord {
  readonly id: string;
  readonly vector: readonly number[];
  readonly metadata: EmbeddingMetadata;
}

export interface PersistedFrameInfo {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly timestampLabel: string;
  readonly imagePath: string;
  readonly checksum: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface PersistedManifest {
  readonly schemaVersion: number;
  readonly pipelineVersion: string;
  readonly videoId: string;
  readonly videoFingerprint: string;
  readonly sourceFileName: string;
  readonly sourceByteLength: number;
  readonly sourceVideoPath: string;
  readonly frameCount: number;
  readonly frames: readonly PersistedFrameInfo[];
  readonly createdAt: string;
}

export interface PersistedSummary {
  readonly timelineText: string;
  readonly summaryText: string;
  readonly modelKey: string;
  readonly rawText: string;
}

export interface PersistedJobState {
  readonly schemaVersion: number;
  readonly pipelineVersion: string;
  readonly jobId: string;
  readonly fingerprint: string;
  readonly sourceFileName: string;
  readonly totalFrames: number;
  readonly analyzedFrames: number;
  readonly status:
    | "idle"
    | "checking_cache"
    | "uploading"
    | "extracting"
    | "analyzing"
    | "combining"
    | "completed"
    | "error";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly error?: string;
}

export interface JobReference {
  readonly jobId: string;
  readonly fingerprint: string;
}
