import type { ModelConfigurationPersisted } from "@/app/lib/model-configuration-shared";

/** Serialized on video-watch jobs so analysis uses the same LM endpoint as the client settings. */
export interface PersistedLmJobRuntime {
  readonly baseUrl: string;
  readonly apiToken: string;
  readonly frameModelKey: string;
  readonly trackingModelKey: string;
  readonly summaryModelKey: string;
}

export function modelConfigurationToJobRuntime(
  c: ModelConfigurationPersisted,
): PersistedLmJobRuntime {
  return {
    baseUrl: c.baseUrl,
    apiToken: c.apiToken,
    frameModelKey: c.frameAnalysisModelKey,
    trackingModelKey: c.frameAnalysisModelKey,
    summaryModelKey: c.summaryChatModelKey,
  };
}

export interface WatchRequestRuntime {
  readonly baseUrl: string;
  readonly apiToken: string | undefined;
  readonly watchModelKey: string;
}

export function modelConfigurationToWatchRuntime(
  c: ModelConfigurationPersisted,
): WatchRequestRuntime {
  return {
    baseUrl: c.baseUrl,
    apiToken: c.apiToken.trim() === "" ? undefined : c.apiToken,
    watchModelKey: c.preferredWatchModelKey,
  };
}

/** Reuse video LLM client helpers for watch (same SDK, same resolve/load logic). */
export function watchRequestToPersistedRuntime(
  w: WatchRequestRuntime,
): PersistedLmJobRuntime {
  return {
    baseUrl: w.baseUrl,
    apiToken: w.apiToken ?? "",
    frameModelKey: w.watchModelKey,
    trackingModelKey: w.watchModelKey,
    summaryModelKey: w.watchModelKey,
  };
}
