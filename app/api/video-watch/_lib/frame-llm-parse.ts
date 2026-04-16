import { MAX_OBJECT_ID_ENTRIES } from "./config";

// Extracts and trims the "analysis" string from model narrative JSON.
export function parseNarrativeAnalysisFromResponseRaw(responseRaw: string): string {
  const { analysis } = JSON.parse(responseRaw) as { analysis?: unknown };
  if (typeof analysis !== "string" || !analysis.trim()) {
    throw new Error('Narrative model response missing non-empty "analysis" string');
  }
  return analysis.trim();
}

// Returns a trimmed mapping from object IDs to descriptions, capped by config.
export function parseTrackingObjectsFromResponseRaw(responseRaw: string): Record<string, string> {
  const { objects } = JSON.parse(responseRaw) as { objects?: unknown };
  if (!objects || typeof objects !== "object" || Array.isArray(objects)) return {};

  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(objects)) {
    if (count >= MAX_OBJECT_ID_ENTRIES) break;
    if (typeof value === "string") {
      const k = key.trim();
      if (k) {
        out[k] = value.trim();
        count++;
      }
    }
  }
  return out;
}
