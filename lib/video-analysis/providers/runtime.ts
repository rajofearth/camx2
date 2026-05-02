import {
  DEFAULT_MODEL_CONFIGURATION,
  parseModelConfigurationJson,
} from "@/app/lib/model-configuration-shared";
import type { VideoAnalysisProviderConfig } from "@/types/video-analysis";

export function defaultProviderConfig(): VideoAnalysisProviderConfig {
  return {
    provider: "lmstudio",
    baseUrl: DEFAULT_MODEL_CONFIGURATION.baseUrl,
    apiToken: process.env.LM_API_TOKEN ?? "",
    frameModelKey: DEFAULT_MODEL_CONFIGURATION.frameAnalysisModelKey,
    summaryModelKey: DEFAULT_MODEL_CONFIGURATION.summaryChatModelKey,
  };
}

export function parseProviderConfigFromFormData(
  raw: FormDataEntryValue | null,
): VideoAnalysisProviderConfig {
  if (typeof raw !== "string" || raw.trim() === "") {
    return defaultProviderConfig();
  }

  const config = parseModelConfigurationJson(raw);
  return {
    provider: "lmstudio",
    baseUrl: config.baseUrl,
    apiToken: config.apiToken,
    frameModelKey: config.frameAnalysisModelKey,
    summaryModelKey: config.summaryChatModelKey,
  };
}
