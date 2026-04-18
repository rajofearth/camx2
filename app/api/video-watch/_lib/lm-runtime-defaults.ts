import type { PersistedLmJobRuntime } from "@/app/lib/lm-studio-runtime";
import { modelConfigurationToJobRuntime } from "@/app/lib/lm-studio-runtime";
import { parseModelConfigurationJson } from "@/app/lib/model-configuration-shared";
import {
  FRAME_MODEL_KEY,
  LMSTUDIO_BASE_URL,
  SUMMARY_MODEL_KEY,
  TRACKING_MODEL_KEY,
} from "./config";

export function defaultJobRuntimeFromEnv(): PersistedLmJobRuntime {
  return {
    baseUrl: LMSTUDIO_BASE_URL,
    apiToken: process.env.LM_API_TOKEN ?? "",
    frameModelKey: FRAME_MODEL_KEY,
    trackingModelKey: TRACKING_MODEL_KEY,
    summaryModelKey: SUMMARY_MODEL_KEY,
  };
}

/** `model_config` field from multipart upload (JSON string of saved settings). */
export function parseJobRuntimeFromFormField(
  raw: FormDataEntryValue | null,
): PersistedLmJobRuntime | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const c = parseModelConfigurationJson(raw);
  return modelConfigurationToJobRuntime(c);
}
