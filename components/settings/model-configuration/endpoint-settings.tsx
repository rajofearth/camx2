"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { ModelConfigSection } from "./model-config-section";
import { useModelConfiguration } from "./model-configuration-context";

export function EndpointSettings() {
  const {
    config,
    setConfig,
    models,
    pingStatus,
    pingMessage,
    modelsError,
    modelsLoading,
    checkConnection,
    refreshModels,
  } = useModelConfiguration();

  const busy = pingStatus === "checking" || modelsLoading;
  const showAlert = Boolean(modelsError) || (pingStatus === "error" && pingMessage);

  return (
    <ModelConfigSection
      meta="CHANNEL_01_REDUNDANCY_ENABLED"
      title="ENDPOINT SETTINGS"
    >
      <div className="space-y-4 p-6">
        {showAlert && (
          <div
            className="space-y-1 border border-op-critical bg-op-critical/5 px-3 py-2 font-mono text-[10px] uppercase leading-relaxed text-op-critical"
            role="alert"
          >
            {modelsError ? <p>{modelsError}</p> : null}
            {pingStatus === "error" && pingMessage ? <p>{pingMessage}</p> : null}
          </div>
        )}

        {!showAlert && models.length > 0 && (
          <p className="font-mono text-[10px] uppercase tracking-wide text-op-text-sec">
            {models.length} LLM model{models.length === 1 ? "" : "s"} available from
            LM Studio.
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label
              className="block text-xs font-medium uppercase text-op-text-sec"
              htmlFor="model-config-ws-url"
            >
              LM Studio WebSocket URL
            </label>
            <div className="flex gap-2">
              <Input
                id="model-config-ws-url"
                className="h-auto min-h-9 flex-1 px-4 py-2 text-sm"
                type="text"
                value={config.baseUrl}
                onBlur={() => {
                  void refreshModels();
                }}
                onChange={(event) => setConfig({ baseUrl: event.target.value })}
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 whitespace-nowrap"
                disabled={busy}
                onClick={() => {
                  void checkConnection();
                }}
              >
                {busy ? "Checking…" : "Check Connection"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label
              className="block text-xs font-medium uppercase text-op-text-sec"
              htmlFor="model-config-api-token"
              title="LM Studio API token (sk-lm-…), if your server requires authentication."
            >
              API Token (Optional)
            </label>
            <Input
              id="model-config-api-token"
              autoComplete="off"
              className="h-auto min-h-9 px-4 py-2 text-sm"
              placeholder="sk-lm-…"
              type="password"
              value={config.apiToken}
              onBlur={() => {
                void refreshModels();
              }}
              onChange={(event) => setConfig({ apiToken: event.target.value })}
            />
          </div>
        </div>
      </div>
    </ModelConfigSection>
  );
}
