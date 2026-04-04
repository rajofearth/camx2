import type { WatchResult } from "@/app/lib/watch-types";

export const WATCH_RESPONSE_SCHEMA = {
  type: "object",
  required: ["DescriptionOfSituationOnlyIfFoundHarm", "isHarm"],
  properties: {
    isHarm: {
      type: "array",
      items: {
        type: "boolean",
      },
    },
    DescriptionOfSituationOnlyIfFoundHarm: {
      type: "string",
    },
  },
  additionalProperties: false,
} as const;

function isBooleanArray(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.every((v) => typeof v === "boolean");
}

export function parseWatchModelJson(json: unknown): WatchResult {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid model JSON: not an object");
  }

  const obj = json as Record<string, unknown>;
  const isHarm = obj.isHarm;
  const description = obj.DescriptionOfSituationOnlyIfFoundHarm;

  if (!isBooleanArray(isHarm)) {
    throw new Error("Invalid model JSON: 'isHarm' must be boolean[]");
  }

  if (typeof description !== "string") {
    throw new Error(
      "Invalid model JSON: 'DescriptionOfSituationOnlyIfFoundHarm' must be string",
    );
  }

  return {
    isHarm,
    DescriptionOfSituationOnlyIfFoundHarm: description,
  };
}
