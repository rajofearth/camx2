import type {
  VideoAnalysisChatMessage,
  VideoAnalysisSummaryArtifact,
  VideoAnalysisTimelineEntry,
} from "@/types/video-analysis";
import type { VideoAnalysisProvider } from "../providers/types";

export async function answerChatQuestion(input: {
  readonly provider: VideoAnalysisProvider;
  readonly summary: VideoAnalysisSummaryArtifact;
  readonly timeline: readonly VideoAnalysisTimelineEntry[];
  readonly question: string;
  readonly messages: readonly VideoAnalysisChatMessage[];
}) {
  return input.provider.answerQuestion({
    summary: input.summary,
    timeline: input.timeline,
    question: input.question,
    messages: input.messages,
  });
}
