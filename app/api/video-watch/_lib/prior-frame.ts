import {
  isSceneUnchangedAnalysis,
  MAX_OBJECT_ID_ENTRIES,
  MAX_VISIBLE_OBJECTS,
  SCENE_UNCHANGED_SENTINEL,
} from "./config";
import { trimNarrativeText } from "./text-utils";

export const PRIOR_FRAME_SENTINEL = "No relevant prior frame context.";

export function sanitizePriorFrameAnalysis(value: unknown): string {
  const str = typeof value === "string" ? value.trim() : "";
  if (!str || str.toLowerCase() === "none") {
    return PRIOR_FRAME_SENTINEL;
  }
  const normalized = trimNarrativeText(str);
  return normalized ? normalized : PRIOR_FRAME_SENTINEL;
}

export function authoritativePriorFrameAnalysis(previousFrame: {
  readonly frameAnalysis: string;
}): string {
  const text = trimNarrativeText(previousFrame.frameAnalysis);
  return text ? text : PRIOR_FRAME_SENTINEL;
}

export function authoritativePriorVisibleObjects(previousFrame: {
  readonly objects: Readonly<Record<string, string>>;
}): string[] {
  const entries = Object.entries(previousFrame.objects);
  if (entries.length === 0) return [];
  // Compose, trim, deduplicate, clip to max
  const unique = new Set<string>();
  for (
    let i = 0;
    i < entries.length && unique.size < MAX_VISIBLE_OBJECTS;
    ++i
  ) {
    const [id, value] = entries[i];
    const attr = trimNarrativeText(value);
    if (attr) unique.add(`${id}: ${attr}`);
  }
  return Array.from(unique);
}

export function sanitizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (let i = 0; i < value.length && unique.size < maxItems; ++i) {
    const entry = value[i];
    if (typeof entry !== "string") continue;
    const trimmed = trimNarrativeText(entry);
    if (trimmed) unique.add(trimmed);
  }
  return Array.from(unique);
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

  const prevObjects = authoritativePriorVisibleObjects(previousFrame);
  return {
    priorFrameAnalysis: authoritativePriorFrameAnalysis(previousFrame),
    priorVisibleObjects:
      prevObjects.length > 0 ? prevObjects : modelPriorVisibleObjects.slice(),
  };
}

export function sanitizeStringRecord(
  value: unknown,
  maxEntries: number,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (count >= maxEntries) break;
    const key =
      typeof rawKey === "string"
        ? rawKey.replace(/\s+/g, " ").trim().toLowerCase()
        : "";
    if (!key) continue;
    if (typeof rawValue !== "string") continue;
    const normalizedValue = trimNarrativeText(rawValue);
    if (!normalizedValue) continue;
    output[key] = normalizedValue;
    count++;
  }
  return output;
}

export function frameAnalysisFromTrackedObjects(
  objects: Readonly<Record<string, string>>,
): string | null {
  const result: string[] = [];
  for (const [id, value] of Object.entries(objects)) {
    if (value && value.trim()) {
      result.push(`${id}: ${trimNarrativeText(value)}`);
    }
  }
  if (!result.length) return null;
  return result.join("; ");
}

export function isPlaceholderFrameAnalysis(text: string): boolean {
  if (isSceneUnchangedAnalysis(text)) return false;
  const t = text.trim().toLowerCase();
  return !t || t === "none" || t.includes("no relevant prior frame context");
}

/** Legacy / model output normalization into a single narrative string. */
export function normalizeNarrativePayload(value: unknown): string {
  const parsed =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const raw =
    ([
      parsed.analysis,
      parsed.frameAnalysis,
      parsed.summaryText,
      parsed.description,
    ].find((x) => typeof x === "string" && x.trim().length > 0) as
      | string
      | undefined) || "";

  if (isSceneUnchangedAnalysis(raw)) return SCENE_UNCHANGED_SENTINEL;

  let frameAnalysis =
    trimNarrativeText(raw) || "No meaningful visual change detected.";
  const objects = sanitizeStringRecord(parsed.objects, MAX_OBJECT_ID_ENTRIES);
  if (isPlaceholderFrameAnalysis(frameAnalysis)) {
    const fromObjects = frameAnalysisFromTrackedObjects(objects);
    if (fromObjects) frameAnalysis = trimNarrativeText(fromObjects);
  }
  return trimNarrativeText(frameAnalysis);
}
