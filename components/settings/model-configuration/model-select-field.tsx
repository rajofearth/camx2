"use client";

import * as React from "react";

import type { LlmModelOptionDto } from "@/app/lib/model-configuration-types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  formatModelCapabilityDetail,
  mergeModelsWithSelection,
  resolveSelectedModel,
} from "./model-option-utils";

interface ModelSelectFieldProps {
  readonly value: string;
  readonly onChange: (modelKey: string) => void;
  readonly options: readonly LlmModelOptionDto[];
  readonly disabled?: boolean;
  readonly variant?: "default" | "critical";
  /** Omit tool-use from labels and list (frame analysis row). */
  readonly hideTools?: boolean;
}

export function ModelSelectField({
  value,
  onChange,
  options,
  disabled,
  variant = "default",
  hideTools = false,
}: ModelSelectFieldProps) {
  const [open, setOpen] = React.useState(false);

  const merged = React.useMemo(
    () => mergeModelsWithSelection(options, value),
    [options, value],
  );

  const selected = React.useMemo(
    () => resolveSelectedModel(options, value),
    [options, value],
  );

  const pickKey = (model: LlmModelOptionDto) => model.modelKey;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex w-full min-w-0 items-start justify-between gap-2 border bg-op-base px-4 py-3 text-left font-mono text-sm uppercase text-op-silver outline-none transition-all focus-visible:ring-1 focus-visible:ring-op-silver disabled:cursor-not-allowed disabled:opacity-50",
            variant === "default" &&
              "border-op-border hover:border-op-border-active",
            variant === "critical" && "border-op-critical",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              {selected?.identifier ?? "—"}
            </span>
            {selected ? (
              <span className="mt-1 block text-[10px] font-normal normal-case tracking-wide text-op-text-sec">
                {formatModelCapabilityDetail(selected, { hideTools })}
              </span>
            ) : null}
          </span>
          <span
            className="material-symbols-outlined mt-0.5 shrink-0 text-op-text-sec"
            aria-hidden
          >
            expand_more
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-72 w-[var(--radix-popover-trigger-width)] min-w-[min(100%,24rem)] overflow-hidden border border-op-border bg-op-base p-0 shadow-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div
          className="max-h-72 overflow-y-auto py-1"
          role="listbox"
          aria-label="Choose model"
        >
          {merged.length === 0 ? (
            <div className="px-3 py-4 font-mono text-xs text-op-text-sec">
              No models — connect to LM Studio first.
            </div>
          ) : (
            merged.map((model) => {
              const active = pickKey(model) === value;
              return (
                <button
                  key={pickKey(model)}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-op-elevated",
                    active && "bg-op-elevated",
                  )}
                  onClick={() => {
                    onChange(pickKey(model));
                    setOpen(false);
                  }}
                >
                  <span className="font-mono text-sm text-op-silver">
                    {model.identifier}
                  </span>
                  <span className="font-mono text-[10px] font-normal normal-case leading-snug text-op-text-sec">
                    {formatModelCapabilityDetail(model, { hideTools })}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
