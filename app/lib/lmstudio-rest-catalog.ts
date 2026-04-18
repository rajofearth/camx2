import type { LlmModelOptionDto } from "@/app/lib/model-configuration-types";
import { wsUrlToHttpOrigin } from "@/app/lib/lmstudio-url";

/** One LLM row from LM Studio `GET /api/v1/models` (HTTP REST). */
export interface LmStudioRestLlmEntry {
  readonly key: string;
  readonly displayName: string;
  readonly vision: boolean | null;
  readonly trainedForToolUse: boolean | null;
  readonly isLoadedInRest: boolean;
  readonly maxContextLength: number | null;
}

function extractModelsArray(json: unknown): unknown[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  if (Array.isArray(root.models)) return root.models;
  if (Array.isArray(root.data)) return root.data;
  const data = root.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.models)) return d.models;
  }
  return [];
}

function parseRestLlmEntry(raw: unknown): LmStudioRestLlmEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (type !== undefined && type !== null && type !== "llm") return null;

  const key = typeof o.key === "string" ? o.key.trim() : "";
  if (!key) return null;

  const caps =
    o.capabilities && typeof o.capabilities === "object"
      ? (o.capabilities as Record<string, unknown>)
      : {};

  const vision =
    typeof caps.vision === "boolean"
      ? caps.vision
      : typeof caps.supportsVision === "boolean"
        ? caps.supportsVision
        : null;
  const trainedForToolUse =
    typeof caps.trained_for_tool_use === "boolean"
      ? caps.trained_for_tool_use
      : typeof caps.trainedForToolUse === "boolean"
        ? caps.trainedForToolUse
        : null;

  const displayNameRaw =
    typeof o.display_name === "string"
      ? o.display_name
      : typeof o.displayName === "string"
        ? o.displayName
        : "";
  const displayName = displayNameRaw.trim() || key;

  const loadedInstances = o.loaded_instances ?? o.loadedInstances;
  const isLoadedInRest = Array.isArray(loadedInstances) && loadedInstances.length > 0;

  const maxRaw = o.max_context_length ?? o.maxContextLength;
  const maxContextLength = typeof maxRaw === "number" ? maxRaw : null;

  return {
    key,
    displayName,
    vision,
    trainedForToolUse,
    isLoadedInRest,
    maxContextLength,
  };
}

/** Case-insensitive lookup by catalog `key` (one map entry per model). */
export function createRestEntryLookup(
  entries: readonly LmStudioRestLlmEntry[],
): (modelKey: string) => LmStudioRestLlmEntry | undefined {
  const byLower = new Map<string, LmStudioRestLlmEntry>();
  for (const e of entries) {
    byLower.set(e.key.toLowerCase(), e);
  }
  return (modelKey) => byLower.get(modelKey.toLowerCase());
}

/**
 * LM Studio HTTP catalog (`GET /api/v1/models`): capabilities for all local LLMs without loading weights.
 */
export async function fetchLmStudioRestLlmCatalog(
  wsBaseUrl: string,
  apiToken?: string,
): Promise<LmStudioRestLlmEntry[]> {
  const origin = wsUrlToHttpOrigin(wsBaseUrl);
  const headers: HeadersInit = { Accept: "application/json" };
  if (apiToken) headers.Authorization = `Bearer ${apiToken}`;

  const response = await fetch(`${origin}/api/v1/models`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`LM Studio REST returned HTTP ${response.status}.`);
  }

  const json: unknown = await response.json();
  const out: LmStudioRestLlmEntry[] = [];
  for (const raw of extractModelsArray(json)) {
    const entry = parseRestLlmEntry(raw);
    if (entry) out.push(entry);
  }
  return out;
}

export function mergeLlmDtoWithRest(
  dto: LlmModelOptionDto,
  rest: LmStudioRestLlmEntry | undefined,
): LlmModelOptionDto {
  if (!rest) return dto;

  return {
    ...dto,
    identifier: rest.displayName.trim() || dto.identifier,
    vision: rest.vision ?? dto.vision,
    trainedForToolUse: rest.trainedForToolUse ?? dto.trainedForToolUse,
    isLoaded: dto.isLoaded || rest.isLoadedInRest,
    maxContextLength: dto.maxContextLength ?? rest.maxContextLength,
  };
}

export function restEntryToDto(rest: LmStudioRestLlmEntry): LlmModelOptionDto {
  return {
    modelKey: rest.key,
    identifier: rest.displayName,
    isLoaded: rest.isLoadedInRest,
    vision: rest.vision,
    trainedForToolUse: rest.trainedForToolUse,
    maxContextLength: rest.maxContextLength,
  };
}
