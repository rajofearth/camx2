import { MAX_NARRATIVE_CHARS } from "./config";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function trimNarrativeText(value: string): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= MAX_NARRATIVE_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_NARRATIVE_CHARS - 1).trimEnd()}…`;
}
