import type {
  VideoAnalysisChatMessage,
  VideoAnalysisFrameArtifact,
  VideoAnalysisSummaryArtifact,
  VideoAnalysisTimelineEntry,
} from "@/types/video-analysis";

export interface ProviderFrameInput {
  readonly imagePath: string;
  readonly timestampLabel: string;
  readonly previousSummary: string | null;
  readonly recentTimeline: readonly string[];
}

export interface VideoAnalysisProvider {
  readonly kind: "lmstudio";
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
  answerQuestion(input: {
    readonly summary: VideoAnalysisSummaryArtifact;
    readonly timeline: readonly VideoAnalysisTimelineEntry[];
    readonly question: string;
    readonly messages: readonly VideoAnalysisChatMessage[];
  }): Promise<{ readonly answer: string; readonly modelKey: string }>;
}
