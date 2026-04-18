import { cn } from "@/lib/utils";

interface ModelCapabilityStripProps {
  readonly vision: boolean | null;
  readonly trainedForToolUse: boolean | null;
  /** When true, hide the tool icon (e.g. frame analysis row). */
  readonly hideTools?: boolean;
  /**
   * Full contrast when the model is loaded in LM Studio or we have catalog booleans
   * (downloaded model info).
   */
  readonly emphasize?: boolean;
}

/**
 * Material icons: vision, reasoning (LLM), optional tools.
 */
export function ModelCapabilityStrip({
  vision,
  trainedForToolUse,
  hideTools = false,
  emphasize = true,
}: ModelCapabilityStripProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <span
        className={cn(
          "material-symbols-outlined text-[18px]",
          !emphasize && "text-op-text-sec",
          emphasize && vision === true && "text-op-silver",
          emphasize && vision === false && "text-op-critical",
          emphasize && vision === null && "text-op-text-sec",
        )}
        title={
          vision === true
            ? "Vision (images)"
            : vision === false
              ? "No vision / text-only"
              : "Vision not specified in LM Studio metadata"
        }
      >
        visibility
      </span>
      <span
        className={cn(
          "material-symbols-outlined text-[18px]",
          emphasize ? "text-op-silver" : "text-op-text-sec",
        )}
        title="Text LLM (reasoning)"
      >
        psychology
      </span>
      {!hideTools && (
        <span
          className={cn(
            "material-symbols-outlined text-[18px]",
            !emphasize && "text-op-text-sec",
            emphasize && trainedForToolUse === true && "text-op-silver",
            emphasize && trainedForToolUse === false && "text-op-text-sec",
            emphasize && trainedForToolUse === null && "text-op-text-sec",
          )}
          title={
            trainedForToolUse === true
              ? "Tool use supported"
              : trainedForToolUse === false
                ? "Tool use not indicated"
                : "Tool use not specified in LM Studio metadata"
          }
        >
          build
        </span>
      )}
    </div>
  );
}
