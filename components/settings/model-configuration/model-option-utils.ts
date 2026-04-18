import type { LlmModelOptionDto } from "@/app/lib/model-configuration-types";

function syntheticModel(modelKey: string): LlmModelOptionDto {
  return {
    modelKey,
    identifier: modelKey,
    isLoaded: false,
    vision: null,
    trainedForToolUse: null,
    maxContextLength: null,
  };
}

/**
 * Options for the picker, ensuring the current selection key always has a row (for saved keys
 * missing from the latest LM Studio snapshot).
 */
export function mergeModelsWithSelection(
  options: readonly LlmModelOptionDto[],
  selectedKey: string,
): LlmModelOptionDto[] {
  const list = [...options];
  if (
    selectedKey &&
    !list.some(
      (m) => m.modelKey === selectedKey || m.identifier === selectedKey,
    )
  ) {
    list.unshift(syntheticModel(selectedKey));
  }
  return list;
}

/**
 * Resolve the row used for capability icons — matches both `modelKey` and `identifier`.
 */
export function resolveSelectedModel(
  options: readonly LlmModelOptionDto[],
  selectedKey: string,
): LlmModelOptionDto | null {
  if (!selectedKey) return null;
  return (
    options.find(
      (m) => m.modelKey === selectedKey || m.identifier === selectedKey,
    ) ?? syntheticModel(selectedKey)
  );
}

function visionAbbrev(model: LlmModelOptionDto): string {
  if (model.vision === true) return "VIS";
  if (model.vision === false) return "TXT";
  return "VIS—";
}

function toolAbbrev(model: LlmModelOptionDto): string {
  if (model.trainedForToolUse === true) return "TOOLS";
  if (model.trainedForToolUse === false) return "NO-TOOLS";
  return "TOOLS—";
}

/**
 * One-line summary for compact inline use.
 */
export function formatModelCapabilityInline(
  model: LlmModelOptionDto,
  opts: { readonly hideTools?: boolean },
): string {
  const load = model.isLoaded ? "MEM" : "DISK";
  if (opts.hideTools) {
    return `${model.identifier} · ${visionAbbrev(model)} · LLM · ${load}`;
  }
  return `${model.identifier} · ${visionAbbrev(model)} · LLM · ${toolAbbrev(model)} · ${load}`;
}

/** Readable capability line for the picker trigger and list rows (no "?" — use em dash for unknown). */
export function formatModelCapabilityDetail(
  model: LlmModelOptionDto,
  opts: { readonly hideTools?: boolean },
): string {
  const visionPart =
    model.vision === true
      ? "Vision"
      : model.vision === false
        ? "Text-only"
        : "Vision —";

  const toolPart = opts.hideTools
    ? null
    : model.trainedForToolUse === true
      ? "Tools"
      : model.trainedForToolUse === false
        ? "No tools"
        : "Tools —";

  const loadPart = model.isLoaded ? "In memory" : "On disk";

  const parts: string[] = [visionPart, "LLM"];
  if (toolPart !== null) parts.push(toolPart);
  parts.push(loadPart);
  return parts.join(" · ");
}

/** Whether icons / labels should use full contrast (loaded, or catalog metadata from LM Studio). */
export function shouldEmphasizeCapabilities(
  model: LlmModelOptionDto | null,
): boolean {
  if (!model) return false;
  return (
    model.isLoaded || model.vision !== null || model.trainedForToolUse !== null
  );
}
