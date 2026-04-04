import type { WatchResult } from "@/app/lib/watch-types";

/**
 * Schema describing the (expected) model response.
 *
 * Notes:
 * - `isHarm` can be a boolean or an array of booleans in the raw model output.
 *   We accept both shapes in the schema (and handle coercion in the parser).
 * - `DescriptionOfSituationOnlyIfFoundHarm` remains required and must be a string.
 */
export const WATCH_RESPONSE_SCHEMA = {
  type: "object",
  // Description can be omitted or empty when there is no harm.
  // We keep the schema permissive (parser enforces the conditional rule).
  required: [],
  properties: {
    isHarm: {
      anyOf: [
        { type: "boolean" },
        {
          type: "array",
          items: {
            type: "boolean",
          },
        },
      ],
    },
    DescriptionOfSituationOnlyIfFoundHarm: {
      type: "string",
    },
  },
  additionalProperties: false,
} as const;

/**
 * Helper: narrow-check for boolean[]
 */
function isBooleanArray(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.every((v) => typeof v === "boolean");
}

/**
 * Normalize various possible `isHarm` shapes into a boolean[]:
 * - If missing/null/undefined -> return [false]
 * - If boolean -> return [boolean]
 * - If array -> map items to booleans; if empty -> return [false]
 * - Otherwise -> coerce to boolean and return [Boolean(value)]
 */
function normalizeIsHarm(value: unknown): boolean[] {
  if (Array.isArray(value)) {
    const mapped = value.map((v) => (typeof v === "boolean" ? v : Boolean(v)));
    return mapped.length === 0 ? [false] : mapped;
  }

  if (typeof value === "boolean") {
    return [value];
  }

  if (value === undefined || value === null) {
    return [false];
  }

  // For any other non-array, non-boolean value, coerce to boolean.
  return [Boolean(value)];
}

/**
 * Parse the raw JSON returned from the model into a `WatchResult`.
 *
 * Behaviour changes (compared to strict validation):
 * - Missing `isHarm`, a single boolean `isHarm`, or non-array `isHarm` are all
 *   normalized to `boolean[]`.
 * - Empty arrays are treated as `[false]` (i.e. empty => false).
 *
 * This keeps downstream code consistent with the `WatchResult` type while
 * being tolerant of slightly inconsistent model outputs.
 */
export function parseWatchModelJson(json: unknown): WatchResult {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid model JSON: not an object");
  }

  const obj = json as Record<string, unknown>;
  const rawIsHarm = obj.isHarm;
  const descriptionRaw = obj.DescriptionOfSituationOnlyIfFoundHarm;

  const isHarm = normalizeIsHarm(rawIsHarm);

  // Final type check to satisfy the WatchResult contract
  if (!isBooleanArray(isHarm)) {
    // This should never happen because normalizeIsHarm guarantees boolean[]
    throw new Error(
      "Invalid model JSON: 'isHarm' must be boolean[] after normalization",
    );
  }

  // Normalize description: allow missing/empty when there is no detected harm.
  const description = typeof descriptionRaw === "string" ? descriptionRaw : "";

  const hasHarm = isHarm.some((v) => v === true);

  if (hasHarm) {
    // When harm is present, description must be a non-empty string describing the situation.
    if (description.trim().length === 0) {
      throw new Error(
        "Invalid model JSON: 'DescriptionOfSituationOnlyIfFoundHarm' must be a non-empty string when 'isHarm' contains true",
      );
    }
  } else {
    // When no harm detected, description may be empty; normalize to "" for downstream consumers.
  }

  return {
    isHarm,
    DescriptionOfSituationOnlyIfFoundHarm: description,
  };
}
