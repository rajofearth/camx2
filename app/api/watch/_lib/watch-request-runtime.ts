import {
  modelConfigurationToWatchRuntime,
  type WatchRequestRuntime,
} from "@/app/lib/lm-studio-runtime";
import {
  DEFAULT_MODEL_CONFIGURATION,
  parseModelConfigurationJson,
} from "@/app/lib/model-configuration-shared";

/** Prefer JSON `model_config` from the client (saved app settings); else server env defaults. */
export function resolveWatchRequestRuntime(
  formField: FormDataEntryValue | null,
): WatchRequestRuntime {
  if (typeof formField === "string" && formField.trim() !== "") {
    return modelConfigurationToWatchRuntime(
      parseModelConfigurationJson(formField),
    );
  }
  const d = DEFAULT_MODEL_CONFIGURATION;
  return {
    baseUrl: process.env.LMSTUDIO_BASE_URL ?? d.baseUrl,
    apiToken:
      process.env.LM_API_TOKEN && process.env.LM_API_TOKEN.trim() !== ""
        ? process.env.LM_API_TOKEN
        : undefined,
    watchModelKey: process.env.LMSTUDIO_WATCH_MODEL ?? d.preferredWatchModelKey,
  };
}
