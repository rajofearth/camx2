"use client";

import { ModelCapabilityStrip } from "./model-capability-strip";
import { ModelConfigSection } from "./model-config-section";
import { useModelConfiguration } from "./model-configuration-context";
import { ModelSelectField } from "./model-select-field";

function pickModel(
  models: readonly LlmModelOptionDto[],
  key: string,
): LlmModelOptionDto | null {
  return models.find((m) => m.modelKey === key) ?? null;
}

export function ModelAssignment() {
  const { config, setConfig, models, modelsLoading } = useModelConfiguration();

  const watch = pickModel(models, config.preferredWatchModelKey);
  const frame = pickModel(models, config.frameAnalysisModelKey);
  const summary = pickModel(models, config.summaryChatModelKey);

  const summaryVision = summary?.vision ?? null;

  return (
    <ModelConfigSection meta="VLM_ACTIVE_CONTEXT_V2" title="MODEL ASSIGNMENT">
      <div className="divide-y divide-op-border">
        <div className="flex flex-col items-start gap-6 p-6 md:flex-row">
          <div className="w-full md:w-1/3">
            <span className="mb-1 block text-[11px] font-bold uppercase text-white">
              Preferred Watch Model
            </span>
            <span className="block text-[10px] uppercase text-op-text-sec">
              Primary surveillance logic and event detection.
            </span>
            <ModelCapabilityStrip
              trainedForToolUse={watch?.trainedForToolUse ?? null}
              vision={watch?.vision ?? null}
            />
          </div>
          <div className="w-full md:w-2/3">
            <ModelSelectField
              disabled={modelsLoading}
              options={models}
              value={config.preferredWatchModelKey}
              onChange={(modelKey) =>
                setConfig({ preferredWatchModelKey: modelKey })
              }
            />
          </div>
        </div>

        <div className="flex flex-col items-start gap-6 p-6 md:flex-row">
          <div className="w-full md:w-1/3">
            <span className="mb-1 block text-[11px] font-bold uppercase text-white">
              Frame Analysis Model
            </span>
            <span className="block text-[10px] uppercase text-op-text-sec">
              Deep analytical pass for high-priority frames.
            </span>
            <ModelCapabilityStrip
              hideTools
              trainedForToolUse={frame?.trainedForToolUse ?? null}
              vision={frame?.vision ?? null}
            />
          </div>
          <div className="w-full md:w-2/3">
            <ModelSelectField
              disabled={modelsLoading}
              options={models}
              value={config.frameAnalysisModelKey}
              onChange={(modelKey) =>
                setConfig({ frameAnalysisModelKey: modelKey })
              }
            />
          </div>
        </div>

        <div className="flex flex-col items-start gap-6 bg-[#0D0D0D] p-6 md:flex-row">
          <div className="w-full md:w-1/3">
            <span className="mb-1 block text-[11px] font-bold uppercase text-white">
              Summary/Chat Model
            </span>
            <span className="block text-[10px] uppercase text-op-text-sec">
              Natural language synthesis of surveillance logs.
            </span>
            <ModelCapabilityStrip
              trainedForToolUse={summary?.trainedForToolUse ?? null}
              vision={summary?.vision ?? null}
            />
            {summaryVision === false && (
              <div className="mt-4 inline-flex items-center gap-2 border border-op-critical px-2 py-1">
                <span
                  className="material-symbols-outlined text-[14px] text-op-critical"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden
                >
                  error
                </span>
                <span className="font-mono text-[9px] font-bold uppercase text-op-critical">
                  (!) NON-VISION
                </span>
              </div>
            )}
            {summaryVision === null && (
              <p className="mt-4 font-mono text-[9px] uppercase leading-relaxed text-op-text-sec">
                Load this model in LM Studio to detect vision and tool support.
              </p>
            )}
          </div>
          <div className="w-full space-y-3 md:w-2/3">
            <ModelSelectField
              disabled={modelsLoading}
              options={models}
              value={config.summaryChatModelKey}
              variant={summaryVision === false ? "critical" : "default"}
              onChange={(modelKey) =>
                setConfig({ summaryChatModelKey: modelKey })
              }
            />
            {summaryVision === false && (
              <div className="border-l-2 border-op-critical bg-op-critical/5 p-3">
                <p className="text-[10px] uppercase leading-relaxed text-[#A2A2A2]">
                  Selection of non-vision models for vision tasks may result in
                  inference failure. Proceed at operator risk.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModelConfigSection>
  );
}
