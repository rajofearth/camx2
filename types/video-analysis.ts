export type VideoAnalysisStage =
  | "queued"
  | "extracting"
  | "analyzing"
  | "summarizing"
  | "completed"
  | "error";

export interface VideoAnalysisProgress {
  readonly stage: VideoAnalysisStage;
  readonly totalFrames: number;
  readonly completedFrames: number;
  readonly completionRatio: number;
}

export interface VideoAnalysisProviderConfig {
  readonly provider: "lmstudio";
  readonly baseUrl: string;
  readonly apiToken: string;
  readonly frameModelKey: string;
  readonly summaryModelKey: string;
  readonly embeddingModelKey: string;
}

export interface VideoAnalysisFrameArtifact {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly timestampLabel: string;
  readonly sceneSummary: string;
  readonly visibleObjects: readonly string[];
  readonly events: readonly string[];
  readonly continuityNotes: readonly string[];
  readonly rawText: string;
  readonly modelKey: string;
  readonly latencyMs: number;
  readonly imagePath: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface VideoAnalysisTimelineEntry {
  readonly id: string;
  readonly startFrameIndex: number;
  readonly endFrameIndex: number;
  readonly startTimestampMs: number;
  readonly endTimestampMs: number;
  readonly startTimestampLabel: string;
  readonly endTimestampLabel: string;
  readonly summary: string;
  readonly visibleObjects: readonly string[];
  readonly events: readonly string[];
  readonly continuityNotes: readonly string[];
}

export interface VideoAnalysisSummaryArtifact {
  readonly timelineText: string;
  readonly summaryText: string;
  readonly modelKey: string;
  readonly rawText: string;
}

export interface VideoAnalysisJob {
  readonly ok: true;
  readonly jobId: string;
  readonly fingerprint: string;
  readonly sourceFileName: string;
  readonly status: VideoAnalysisStage;
  readonly progress: VideoAnalysisProgress;
  readonly provider: VideoAnalysisProviderConfig["provider"];
  readonly cache: {
    readonly fingerprint: string;
    readonly cacheHit: boolean;
    readonly source: "memory" | "disk" | "upload";
  };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly summary?: VideoAnalysisSummaryArtifact;
  readonly error?: string;
}

export interface VideoAnalysisChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface VideoAnalysisTimeRangeInput {
  readonly start: string;
  readonly end: string;
}

export interface VideoAnalysisResolvedTimeRange {
  readonly startMs: number;
  readonly endMs: number;
}

export type VideoAnalysisEntityKind =
  | "person"
  | "vehicle"
  | "item"
  | "location"
  | "unknown";

export interface VideoAnalysisRetrievalEntity {
  readonly id: string;
  readonly label: string;
  readonly normalizedLabel: string;
  readonly kind: VideoAnalysisEntityKind;
  readonly mentions: number;
  readonly chunkIds: readonly string[];
}

export interface VideoAnalysisRetrievalChunk {
  readonly id: string;
  readonly timelineEntryId: string;
  readonly startFrameIndex: number;
  readonly endFrameIndex: number;
  readonly startTimestampMs: number;
  readonly endTimestampMs: number;
  readonly startTimestampLabel: string;
  readonly endTimestampLabel: string;
  readonly summary: string;
  readonly visibleObjects: readonly string[];
  readonly events: readonly string[];
  readonly continuityNotes: readonly string[];
  readonly entityIds: readonly string[];
  readonly eventKeys: readonly string[];
  readonly embeddingText: string;
}

export type VideoAnalysisGraphNodeKind = "chunk" | "entity" | "event";
export type VideoAnalysisGraphEdgeKind =
  | "temporal"
  | "co_occurs"
  | "continuity";

export interface VideoAnalysisGraphNode {
  readonly id: string;
  readonly kind: VideoAnalysisGraphNodeKind;
  readonly label: string;
  readonly chunkIds: readonly string[];
}

export interface VideoAnalysisGraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: VideoAnalysisGraphEdgeKind;
  readonly weight: number;
}

export interface VideoAnalysisGraphArtifact {
  readonly nodes: readonly VideoAnalysisGraphNode[];
  readonly edges: readonly VideoAnalysisGraphEdge[];
}

export interface RetrievedEvidenceChunk {
  readonly chunkId: string;
  readonly startTimestampLabel: string;
  readonly endTimestampLabel: string;
  readonly startTimestampMs: number;
  readonly endTimestampMs: number;
  readonly summary: string;
  readonly visibleObjects: readonly string[];
  readonly events: readonly string[];
  readonly continuityNotes: readonly string[];
  readonly score: number | null;
  readonly reasons: readonly string[];
}

export interface GraphMatch {
  readonly nodeId: string;
  readonly nodeKind: VideoAnalysisGraphNodeKind;
  readonly label: string;
  readonly score: number;
  readonly reason: string;
  readonly linkedChunkIds: readonly string[];
}

export interface VideoQueryContextInput {
  readonly jobId: string;
  readonly question: string;
  readonly timeRange?: VideoAnalysisTimeRangeInput;
  readonly conversation?: readonly VideoAnalysisChatMessage[];
}

export interface VideoQueryContextResult {
  readonly summary: string;
  readonly normalizedQuestion: string;
  readonly resolvedTimeRange: VideoAnalysisResolvedTimeRange | null;
  readonly evidence: readonly RetrievedEvidenceChunk[];
  readonly graphMatches: readonly GraphMatch[];
  readonly coverage: "time_range" | "semantic" | "hybrid";
  readonly insufficientEvidence: boolean;
  readonly summaryModelKey: string;
}

export interface VideoAnalysisChatResponseOk {
  readonly ok: true;
  readonly answer: string;
  readonly modelKey: string;
}

export interface VideoAnalysisError {
  readonly ok: false;
  readonly errorCode:
    | "BAD_REQUEST"
    | "NOT_FOUND"
    | "UPSTREAM_ERROR"
    | "INTERNAL_ERROR";
  readonly message: string;
}

export type VideoAnalysisChatResponse =
  | VideoAnalysisChatResponseOk
  | VideoAnalysisError;

export type VideoAnalysisJobResponse = VideoAnalysisJob | VideoAnalysisError;

export interface VideoAnalysisArtifactsResponse {
  readonly ok: true;
  readonly job: VideoAnalysisJob;
  readonly frames: readonly VideoAnalysisFrameArtifact[];
  readonly timeline: readonly VideoAnalysisTimelineEntry[];
  readonly summary: VideoAnalysisSummaryArtifact | null;
}
