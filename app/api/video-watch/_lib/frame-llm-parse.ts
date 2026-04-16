import { MAX_OBJECT_ID_ENTRIES } from "./config";

/** Parse narrative JSON exactly as the model returned; only trim the analysis string. */
export function parseNarrativeAnalysisFromResponseRaw(
  responseRaw: string,
): string {
  const parsed = JSON.parse(responseRaw) as Record<string, unknown>;
  const analysis = parsed.analysis;
  if (typeof analysis !== "string" || !analysis.trim()) {
    throw new Error(
      'Narrative model response missing non-empty "analysis" string',
    );
  }
  return analysis.trim();
}

/** Parse tracking JSON; keep descriptions as returned (trim only). */
export function parseTrackingObjectsFromResponseRaw(
  responseRaw: string,
): Record<string, string> {
  const parsed = JSON.parse(responseRaw) as Record<string, unknown>;
  const rawObjects = parsed.objects;
  if (
    typeof rawObjects !== "object" ||
    rawObjects === null ||
    Array.isArray(rawObjects)
  ) {
    return {};
  }

  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(rawObjects)) {
    if (count >= MAX_OBJECT_ID_ENTRIES) {
      break;
    }
    if (typeof value !== "string") {
      continue;
    }
    const k = key.trim();
    if (!k) {
      continue;
    }
    out[k] = value.trim();
    count += 1;
  }
  return out;
}
