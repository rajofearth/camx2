import type {
  VideoAnalysisChatMessage,
  VideoQueryContextResult,
} from "@/types/video-analysis";
import type { VideoAnalysisProvider } from "../providers/types";

export async function answerChatQuestion(input: {
  readonly provider: VideoAnalysisProvider;
  readonly question: string;
  readonly messages: readonly VideoAnalysisChatMessage[];
  readonly queryContext: VideoQueryContextResult;
}) {
  return input.provider.answerQuestion({
    question: input.question,
    messages: input.messages,
    queryContext: input.queryContext,
  });
}
