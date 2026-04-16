import {
  isSceneUnchangedAnalysis,
  MAX_OBJECT_ID_ENTRIES,
  MAX_VISIBLE_OBJECTS,
  SCENE_UNCHANGED_SENTINEL,
} from "./config";
import { trimNarrativeText } from "./text-utils";

export const PRIOR_FRAME_SENTINEL = "No relevant prior frame context.";

export function sanitizePriorFrameAnalysis(value: unknown): string {
  const base =
    typeof value === "string" && value.trim() ? value : PRIOR_FRAME_SENTINEL;
  const raw = trimNarrativeText(base);
  const lower = raw.trim().toLowerCase();
  if (lower === "none" || lower === "") {
    return PRIOR_FRAME_SENTINEL;
  }
  return raw;
}

export function authoritativePriorFrameAnalysis(previousFrame: {
  readonly frameAnalysis: string;
}): string {
  const text = trimNarrativeText(previousFrame.frameAnalysis);
  return text.length > 0 ? text : PRIOR_FRAME_SENTINEL;
}

export function authoritativePriorVisibleObjects(previousFrame: {
  readonly objects: Readonly<Record<string, string>>;
}): string[] {
  const fromObjects = Object.entries(previousFrame.objects).map(
    ([id, value]) => `${id}: ${trimNarrativeText(value)}`,
  );
  return sanitizeStringList(fromObjects, MAX_VISIBLE_OBJECTS);
}

export function sanitizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueValues = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const normalized = trimNarrativeText(entry);
    if (!normalized) {
      continue;
    }

    uniqueValues.add(normalized);
    if (uniqueValues.size >= maxItems) {
      break;
    }
  }

  return [...uniqueValues];
}

export function applyAuthoritativePriorFields(
  previousFrame: {
    readonly frameAnalysis: string;
    readonly objects: Readonly<Record<string, string>>;
  } | null,
  modelPriorVisibleObjects: readonly string[],
): { priorFrameAnalysis: string; priorVisibleObjects: readonly string[] } {
  if (!previousFrame) {
    return {
      priorFrameAnalysis: PRIOR_FRAME_SENTINEL,
      priorVisibleObjects: [],
    };
  }

  const fromPreviousObjects = authoritativePriorVisibleObjects(previousFrame);

  return {
    priorFrameAnalysis: authoritativePriorFrameAnalysis(previousFrame),
    priorVisibleObjects:
      fromPreviousObjects.length > 0
        ? fromPreviousObjects
        : [...modelPriorVisibleObjects],
  };
}

export function sanitizeStringRecord(
  value: unknown,
  maxEntries: number,
): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.replace(/\s+/g, " ").trim().toLowerCase();
    if (!key) {
      continue;
    }

    if (Object.keys(output).length >= maxEntries) {
      break;
    }

    if (typeof rawValue !== "string") {
      continue;
    }

    const normalizedValue = trimNarrativeText(rawValue);
    if (!normalizedValue) {
      continue;
    }

    output[key] = normalizedValue;
  }

  return output;
}

export function frameAnalysisFromTrackedObjects(
  objects: Readonly<Record<string, string>>,
): string | null {
  const entries = Object.entries(objects).filter(([, value]) => value.trim());
  if (!entries.length) {
    return null;
  }

  return entries
    .map(([id, value]) => `${id}: ${trimNarrativeText(value)}`)
    .join("; ");
}

export function isPlaceholderFrameAnalysis(text: string): boolean {
  if (isSceneUnchangedAnalysis(text)) {
    return false;
  }
  const t = text.trim().toLowerCase();
  if (!t) {
    return true;
  }
  if (t === "none") {
    return true;
  }
  if (t.includes("no relevant prior frame context")) {
    return true;
  }
  return false;
}

/** Legacy / model output normalization into a single narrative string. */
export function normalizeNarrativePayload(value: unknown): string {
  const parsed =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const raw =
    [
      parsed.analysis,
      parsed.frameAnalysis,
      parsed.summaryText,
      parsed.description,
    ].find((x): x is string => typeof x === "string" && x.trim().length > 0) ??
    "";

  if (isSceneUnchangedAnalysis(raw)) {
    return SCENE_UNCHANGED_SENTINEL;
  }

  let frameAnalysis = trimNarrativeText(raw);
  if (!frameAnalysis) {
    frameAnalysis = "No meaningful visual change detected.";
  }

  const objects = sanitizeStringRecord(parsed.objects, MAX_OBJECT_ID_ENTRIES);
  if (isPlaceholderFrameAnalysis(frameAnalysis)) {
    const fromObjects = frameAnalysisFromTrackedObjects(objects);
    if (fromObjects) {
      frameAnalysis = trimNarrativeText(fromObjects);
    }
  }

  return trimNarrativeText(frameAnalysis);
}
