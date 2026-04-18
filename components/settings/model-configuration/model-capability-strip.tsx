import { cn } from "@/lib/utils";

interface ModelCapabilityStripProps {
  readonly vision: boolean | null;
  readonly trainedForToolUse: boolean | null;
  /** When true, hide the tool icon row entirely (e.g. frame row only shows vision + reasoning). */
  readonly hideTools?: boolean;
}

/**
 * Material icons aligned with the reference: vision, reasoning (always for LLMs), optional tools.
 */
export function ModelCapabilityStrip({
  vision,
  trainedForToolUse,
  hideTools = false,
}: ModelCapabilityStripProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <span
        className={cn(
          "material-symbols-outlined text-[18px]",
          vision === true && "text-op-silver",
          vision === false && "text-op-critical",
          vision === null && "text-op-text-sec",
        )}
        title={
          vision === true
            ? "Vision (images)"
            : vision === false
              ? "No vision / text-only"
              : "Vision: load model to detect"
        }
      >
        visibility
      </span>
      <span
        className="material-symbols-outlined text-[18px] text-op-silver"
        title="Reasoning (LLM)"
      >
        psychology
      </span>
      {!hideTools && (
        <span
          className={cn(
            "material-symbols-outlined text-[18px]",
            trainedForToolUse === true && "text-op-silver",
            trainedForToolUse === false && "text-op-text-sec",
            trainedForToolUse === null && "text-op-text-sec",
          )}
          title={
            trainedForToolUse === true
              ? "Tool use supported"
              : trainedForToolUse === false
                ? "Tool use not indicated"
                : "Tool use: load model to detect"
          }
        >
          build
        </span>
      )}
    </div>
  );
}
