import type {
  VideoAnalysisJob,
  VideoAnalysisProviderConfig,
} from "@/types/video-analysis";

export interface PersistedVideoAnalysisJob extends VideoAnalysisJob {
  readonly providerConfig: VideoAnalysisProviderConfig;
}
