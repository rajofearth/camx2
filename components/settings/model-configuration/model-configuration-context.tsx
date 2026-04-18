"use client";

import * as React from "react";
import {
  DEFAULT_MODEL_CONFIGURATION,
  MODEL_CONFIGURATION_STORAGE_KEY,
  type ModelConfigurationPersisted,
  parseModelConfigurationJson,
} from "@/app/lib/model-configuration-shared";
import type { LlmModelOptionDto } from "@/app/lib/model-configuration-types";

export type { ModelConfigurationPersisted };

export type PingStatus = "idle" | "checking" | "ok" | "error";

interface ModelConfigurationContextValue {
  readonly hydrated: boolean;
  readonly config: ModelConfigurationPersisted;
  readonly setConfig: (partial: Partial<ModelConfigurationPersisted>) => void;
  readonly saveConfig: () => void;
  readonly discardConfig: () => void;
  readonly models: readonly LlmModelOptionDto[];
  readonly modelsLoading: boolean;
  readonly modelsError: string | null;
  readonly pingStatus: PingStatus;
  readonly pingMessage: string | null;
  readonly checkConnection: () => Promise<void>;
  readonly refreshModels: () => Promise<void>;
  readonly lastSavedAt: number | null;
}

const ModelConfigurationContext =
  React.createContext<ModelConfigurationContextValue | null>(null);

function writePersisted(next: ModelConfigurationPersisted) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    MODEL_CONFIGURATION_STORAGE_KEY,
    JSON.stringify(next),
  );
}

export function ModelConfigurationProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [hydrated, setHydrated] = React.useState(false);
  const [config, setConfigState] = React.useState<ModelConfigurationPersisted>(
    DEFAULT_MODEL_CONFIGURATION,
  );
  const [committed, setCommitted] = React.useState<ModelConfigurationPersisted>(
    DEFAULT_MODEL_CONFIGURATION,
  );
  const [models, setModels] = React.useState<LlmModelOptionDto[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);
  const [pingStatus, setPingStatus] = React.useState<PingStatus>("idle");
  const [pingMessage, setPingMessage] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);

  const configRef = React.useRef(config);
  configRef.current = config;

  React.useEffect(() => {
    const initial = parseModelConfigurationJson(
      window.localStorage.getItem(MODEL_CONFIGURATION_STORAGE_KEY),
    );
    setConfigState(initial);
    setCommitted(initial);
    setHydrated(true);
  }, []);

  const setConfig = React.useCallback(
    (partial: Partial<ModelConfigurationPersisted>) => {
      setConfigState((current) => ({ ...current, ...partial }));
    },
    [],
  );

  const saveConfig = React.useCallback(() => {
    const next = configRef.current;
    writePersisted(next);
    setCommitted(next);
    setLastSavedAt(Date.now());
  }, []);

  const discardConfig = React.useCallback(() => {
    setConfigState(committed);
  }, [committed]);

  const pingOnce = React.useCallback(async (): Promise<boolean> => {
    setPingStatus("checking");
    setPingMessage(null);
    const { baseUrl, apiToken } = configRef.current;
    try {
      const response = await fetch("/api/lmstudio/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          apiToken: apiToken || undefined,
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
      };
      if (data.ok) {
        setPingStatus("ok");
        setPingMessage("Connected to LM Studio.");
        return true;
      }
      setPingStatus("error");
      setPingMessage(data.error ?? "Connection failed.");
      return false;
    } catch {
      setPingStatus("error");
      setPingMessage("Network error while contacting the app server.");
      return false;
    }
  }, []);

  const refreshModels = React.useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    const { baseUrl, apiToken } = configRef.current;
    try {
      const response = await fetch("/api/lmstudio/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          apiToken: apiToken || undefined,
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        models: LlmModelOptionDto[];
      };
      if (data.ok) {
        setModels(data.models);
        setModelsError(null);
      } else {
        setModels([]);
        setModelsError(data.error ?? "Could not list models.");
      }
    } catch {
      setModels([]);
      setModelsError("Network error while loading models.");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const checkConnection = React.useCallback(async () => {
    const ok = await pingOnce();
    if (ok) {
      await refreshModels();
    } else {
      setModels([]);
      setModelsError(null);
    }
  }, [pingOnce, refreshModels]);

  React.useEffect(() => {
    if (!hydrated) return;
    void refreshModels();
  }, [hydrated, refreshModels]);

  const value = React.useMemo<ModelConfigurationContextValue>(
    () => ({
      hydrated,
      config,
      setConfig,
      saveConfig,
      discardConfig,
      models,
      modelsLoading,
      modelsError,
      pingStatus,
      pingMessage,
      checkConnection,
      refreshModels,
      lastSavedAt,
    }),
    [
      checkConnection,
      config,
      discardConfig,
      hydrated,
      lastSavedAt,
      models,
      modelsError,
      modelsLoading,
      pingMessage,
      pingStatus,
      refreshModels,
      saveConfig,
      setConfig,
    ],
  );

  return (
    <ModelConfigurationContext.Provider value={value}>
      {children}
    </ModelConfigurationContext.Provider>
  );
}

export function useModelConfiguration(): ModelConfigurationContextValue {
  const ctx = React.useContext(ModelConfigurationContext);
  if (!ctx) {
    throw new Error(
      "useModelConfiguration must be used within ModelConfigurationProvider",
    );
  }
  return ctx;
}
