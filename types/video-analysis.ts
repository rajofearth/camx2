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
