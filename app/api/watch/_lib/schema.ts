import type { WatchResult } from "@/app/lib/watch-types";

export interface WatchHarmVerificationResult {
  readonly matchesPrompt: boolean;
  readonly reason: string;
}

const THEN_KEY = "then";

/**
 * Schema describing the expected model response.
 * Strictly enforces that `description` is provided only if `isHarm` is true.
 */
export const WATCH_RESPONSE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    isHarm: {
      type: ["boolean", "null"],
      description: "True if harm is detected. False or null otherwise.",
    },
    description: {
      type: ["string", "null"],
      description:
        "When isHarm is true: required. Factual, serious language covering visible hazards (weapons, violence, fire, medical emergency, etc.), key actors/roles without invented identities, and spatial context. Use CRITICAL/HIGH when severity warrants. Never downplay visible weapons or active emergencies.",
    },
  },
  required: ["isHarm", "description"],
  allOf: [
    {
      if: {
        properties: {
          isHarm: { const: true },
        },
      },
      [THEN_KEY]: {
        properties: {
          description: {
            type: "string",
            minLength: 1,
          },
        },
      },
    },
    {
      if: {
        properties: {
          isHarm: { enum: [false, null] },
        },
      },
      [THEN_KEY]: {
        properties: {
          description: {
            enum: ["", null],
          },
        },
      },
    },
  ],
  additionalProperties: false,
} as const;

export const WATCH_HARM_VERIFICATION_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    matchesPrompt: {
      type: "boolean",
      description:
        "True only if the harm description clearly matches the original watch harm prompt and visible evidence.",
    },
    reason: {
      type: "string",
      description:
        "Short explanation of why the description does or does not fit the watch harm prompt.",
      minLength: 1,
    },
  },
  required: ["matchesPrompt", "reason"],
  additionalProperties: false,
} as const;

/**
 * Parse the raw JSON returned from the model.
 * * Validates the strict rules laid out in the JSON schema above,
 * ensuring the downstream types receive clean, predictable data.
 */
export function parseWatchModelJson(json: unknown): WatchResult {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid model JSON: not an object");
  }

  const obj = json as Record<string, unknown>;
  const rawIsHarm = obj.isHarm;
  const rawDescription = obj.description;

  // Extract isHarm (allow boolean or null)
  let isHarm: boolean | null = null;
  if (typeof rawIsHarm === "boolean") {
    isHarm = rawIsHarm;
  } else if (rawIsHarm !== null && rawIsHarm !== undefined) {
    // Coerce to boolean as a fallback just in case
    isHarm = Boolean(rawIsHarm);
  }

  // Extract description (allow string or null)
  let description: string | null = null;
  if (typeof rawDescription === "string") {
    description = rawDescription;
  } else if (rawDescription !== null && rawDescription !== undefined) {
    description = String(rawDescription);
  }

  // Enforce schema logical constraints
  if (isHarm === true) {
    if (!description || description.trim().length === 0) {
      throw new Error(
        "Invalid model JSON: 'description' must be a non-empty string when 'isHarm' is true",
      );
    }
  } else {
    // If no harm is detected, force description to null/empty to maintain clean state
    if (description && description.trim().length > 0) {
      description = null;
    }
  }

  return {
    isHarm,
    description,
  } as WatchResult; // Ensuring it maps to your updated WatchResult type
}

export function parseWatchHarmVerificationJson(
  json: unknown,
): WatchHarmVerificationResult {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid verification JSON: not an object");
  }

  const obj = json as Record<string, unknown>;
  const rawMatchesPrompt = obj.matchesPrompt;
  const rawReason = obj.reason;

  if (typeof rawMatchesPrompt !== "boolean") {
    throw new Error(
      "Invalid verification JSON: 'matchesPrompt' must be a boolean",
    );
  }

  if (typeof rawReason !== "string" || rawReason.trim().length === 0) {
    throw new Error(
      "Invalid verification JSON: 'reason' must be a non-empty string",
    );
  }

  return {
    matchesPrompt: rawMatchesPrompt,
    reason: rawReason.trim(),
  };
}
