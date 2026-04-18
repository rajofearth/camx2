/** Stored under `localStorage` key `MODEL_CONFIGURATION_STORAGE_KEY`. */

export const MODEL_CONFIGURATION_STORAGE_KEY = "camx2.model-configuration";

export interface ModelConfigurationPersisted {
  readonly baseUrl: string;
  readonly apiToken: string;
  readonly preferredWatchModelKey: string;
  readonly frameAnalysisModelKey: string;
  readonly summaryChatModelKey: string;
}

export const DEFAULT_MODEL_CONFIGURATION: ModelConfigurationPersisted = {
  baseUrl: "http://127.0.0.1:1234",
  apiToken: "",
  preferredWatchModelKey: "lfm-2.5-ucf-1.6b",
  frameAnalysisModelKey: "lfm-ucf-400m",
  summaryChatModelKey: "google/gemma-4-e4b",
};

export function parseModelConfigurationJson(
  raw: string | null | undefined,
): ModelConfigurationPersisted {
  if (!raw) return { ...DEFAULT_MODEL_CONFIGURATION };
  try {
    const v = JSON.parse(raw) as Partial<ModelConfigurationPersisted>;
    const d = DEFAULT_MODEL_CONFIGURATION;
    return {
      baseUrl: typeof v.baseUrl === "string" ? v.baseUrl : d.baseUrl,
      apiToken: typeof v.apiToken === "string" ? v.apiToken : "",
      preferredWatchModelKey:
        typeof v.preferredWatchModelKey === "string"
          ? v.preferredWatchModelKey
          : d.preferredWatchModelKey,
      frameAnalysisModelKey:
        typeof v.frameAnalysisModelKey === "string"
          ? v.frameAnalysisModelKey
          : d.frameAnalysisModelKey,
      summaryChatModelKey:
        typeof v.summaryChatModelKey === "string"
          ? v.summaryChatModelKey
          : d.summaryChatModelKey,
    };
  } catch {
    return { ...DEFAULT_MODEL_CONFIGURATION };
  }
}

/** Browser-only: read saved model / LM Studio settings. */
export function readModelConfigurationFromBrowser(): ModelConfigurationPersisted {
  if (typeof window === "undefined") return { ...DEFAULT_MODEL_CONFIGURATION };
  return parseModelConfigurationJson(
    window.localStorage.getItem(MODEL_CONFIGURATION_STORAGE_KEY),
  );
}
