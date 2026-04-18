import * as React from "react";

import type { LlmModelOptionDto } from "@/app/lib/model-configuration-types";
import { cn } from "@/lib/utils";

interface ModelSelectFieldProps {
  readonly value: string;
  readonly onChange: (modelKey: string) => void;
  readonly options: readonly LlmModelOptionDto[];
  readonly disabled?: boolean;
  readonly variant?: "default" | "critical";
}

export function ModelSelectField({
  value,
  onChange,
  options,
  disabled,
  variant = "default",
}: ModelSelectFieldProps) {
  const merged = React.useMemo(() => {
    const list = [...options];
    if (value && !list.some((m) => m.modelKey === value)) {
      list.unshift({
        modelKey: value,
        identifier: value,
        isLoaded: false,
        vision: null,
        trainedForToolUse: null,
        maxContextLength: null,
      });
    }
    return list;
  }, [options, value]);

  return (
    <div className="relative">
      <select
        disabled={disabled}
        value={merged.some((m) => m.modelKey === value) ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full cursor-pointer appearance-none border bg-op-base px-4 py-3 pr-10 font-mono text-sm uppercase text-op-silver outline-none transition-all focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
          variant === "default" && "border-op-border focus:border-op-silver",
          variant === "critical" && "border-op-critical focus:ring-0",
        )}
      >
        {merged.length === 0 ? (
          <option value="">—</option>
        ) : (
          merged.map((model) => (
            <option key={model.modelKey} value={model.modelKey}>
              {model.identifier}
              {model.isLoaded ? "" : " · NOT LOADED"}
            </option>
          ))
        )}
      </select>
      <span
        className="material-symbols-outlined pointer-events-none absolute right-4 top-3 text-op-text-sec"
        aria-hidden
      >
        expand_more
      </span>
    </div>
  );
}
