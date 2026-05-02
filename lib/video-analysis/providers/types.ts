import type {
  GraphMatch,
  RetrievedEvidenceChunk,
  VideoAnalysisChatMessage,
  VideoAnalysisFrameArtifact,
  VideoAnalysisResolvedTimeRange,
  VideoAnalysisSummaryArtifact,
  VideoAnalysisTimelineEntry,
  VideoQueryContextResult,
} from "@/types/video-analysis";

export interface ProviderFrameInput {
  readonly imagePath: string;
  readonly timestampLabel: string;
  readonly previousSummary: string | null;
  readonly recentTimeline: readonly string[];
}

export interface VideoAnalysisProvider {
  readonly kind: "lmstudio";
  embedTexts(inputs: readonly string[]): Promise<readonly number[][]>;
  analyzeFrame(
    input: ProviderFrameInput,
  ): Promise<
    Pick<
      VideoAnalysisFrameArtifact,
      | "sceneSummary"
      | "visibleObjects"
      | "events"
      | "continuityNotes"
      | "rawText"
      | "modelKey"
    >
  >;
  summarizeTimeline(
    timeline: readonly VideoAnalysisTimelineEntry[],
  ): Promise<VideoAnalysisSummaryArtifact>;
  summarizeQueryContext(input: {
    readonly question: string;
    readonly summary: VideoAnalysisSummaryArtifact;
    readonly resolvedTimeRange: VideoAnalysisResolvedTimeRange | null;
    readonly evidence: readonly RetrievedEvidenceChunk[];
    readonly graphMatches: readonly GraphMatch[];
    readonly conversation: readonly VideoAnalysisChatMessage[];
    readonly insufficientEvidence: boolean;
  }): Promise<{ readonly summary: string; readonly modelKey: string }>;
  answerQuestion(input: {
    readonly question: string;
    readonly messages: readonly VideoAnalysisChatMessage[];
    readonly queryContext: VideoQueryContextResult;
  }): Promise<{ readonly answer: string; readonly modelKey: string }>;
}
