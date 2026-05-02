import type {
  VideoAnalysisProgress,
  VideoAnalysisStage,
} from "@/types/video-analysis";

export function createProgress(
  stage: VideoAnalysisStage,
  totalFrames = 0,
  completedFrames = 0,
): VideoAnalysisProgress {
  return {
    stage,
    totalFrames,
    completedFrames,
    completionRatio:
      totalFrames > 0 ? Math.min(1, completedFrames / totalFrames) : 0,
  };
}

export function withProgressFrameCount(
  progress: VideoAnalysisProgress,
  completedFrames: number,
  totalFrames = progress.totalFrames,
): VideoAnalysisProgress {
  return createProgress(progress.stage, totalFrames, completedFrames);
}
