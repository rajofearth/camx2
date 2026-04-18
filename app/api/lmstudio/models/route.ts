import type { LMStudioClient } from "@lmstudio/sdk";
import { NextResponse } from "next/server";

import { createLmStudioClientForRequest } from "@/app/lib/lmstudio-client-factory";
import {
  createRestEntryLookup,
  fetchLmStudioRestLlmCatalog,
  mergeLlmDtoWithRest,
  restEntryToDto,
} from "@/app/lib/lmstudio-rest-catalog";
import type { LlmModelOptionDto } from "@/app/lib/model-configuration-types";
import { parseLmStudioPostParams } from "@/app/lib/lmstudio-post-params";
import {
  formatLmStudioError,
  isLmStudioConnectionError,
} from "@/app/lib/lmstudio-url";

export const runtime = "nodejs";

type LoadedLlmHandle = Awaited<
  ReturnType<LMStudioClient["llm"]["listLoaded"]>
>[number];

interface ModelsBody {
  readonly baseUrl?: unknown;
  readonly apiToken?: unknown;
}

function readBooleanField(
  obj: Record<string, unknown>,
  keys: readonly string[],
): boolean | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function readToolTraining(
  info: Record<string, unknown>,
  handle: Record<string, unknown>,
): boolean | null {
  return (
    readBooleanField(handle, ["trainedForToolUse"]) ??
    readBooleanField(info, ["trainedForToolUse", "trained_for_tool_use"])
  );
}

function readVision(
  info: Record<string, unknown>,
  handle: Record<string, unknown>,
): boolean | null {
  return (
    readBooleanField(handle, ["vision"]) ??
    readBooleanField(info, ["vision", "supportsVision"])
  );
}

function downloadedModelIdentifier(entry: Record<string, unknown>): string {
  if (
    typeof entry.displayName === "string" &&
    entry.displayName.trim().length > 0
  ) {
    return entry.displayName.trim();
  }
  if (typeof entry.name === "string" && entry.name.trim().length > 0) {
    return entry.name.trim();
  }
  if (typeof entry.modelKey === "string") return entry.modelKey;
  return "";
}

export async function POST(request: Request) {
  let body: ModelsBody;
  try {
    body = (await request.json()) as ModelsBody;
  } catch {
    return NextResponse.json(
      { ok: false as const, error: "Invalid JSON body.", models: [] },
      { status: 400 },
    );
  }

  const parsed = parseLmStudioPostParams(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false as const, error: parsed.error, models: [] },
      { status: 400 },
    );
  }

  const { baseUrl, apiToken } = parsed.params;
  const client = createLmStudioClientForRequest(baseUrl, apiToken);

  try {
    const [loadedHandles, restEntries] = await Promise.all([
      client.llm.listLoaded(),
      fetchLmStudioRestLlmCatalog(baseUrl, apiToken).catch((error: unknown) => {
        console.warn(
          "[lmstudio/models] REST GET /api/v1/models failed; SDK metadata only.",
          error,
        );
        return [];
      }),
    ]);

    const lookupRest = createRestEntryLookup(restEntries);
    const byKey = new Map<string, LlmModelOptionDto>();

    for (const handle of loadedHandles) {
      const handleObj = handle as unknown as Record<string, unknown>;
      const rawInfo = await handle.getModelInfo();
      const info = (rawInfo ?? {}) as Record<string, unknown>;

      const modelKey =
        typeof info.modelKey === "string"
          ? info.modelKey
          : typeof handleObj.modelKey === "string"
            ? handleObj.modelKey
            : "";
      if (!modelKey) continue;

      const identifier =
        typeof info.identifier === "string"
          ? info.identifier
          : typeof handleObj.identifier === "string"
            ? handleObj.identifier
            : modelKey;

      const vision = readVision(info, handleObj);
      const maxContextLength =
        typeof info.maxContextLength === "number"
          ? info.maxContextLength
          : null;

      byKey.set(modelKey, {
        modelKey,
        identifier,
        isLoaded: true,
        vision,
        trainedForToolUse: readToolTraining(info, handleObj),
        maxContextLength,
      });
    }

    const downloaded = await client.system.listDownloadedModels("llm");
    for (const entry of downloaded) {
      const entryObj = entry as unknown as Record<string, unknown>;
      const modelKey =
        typeof entryObj.modelKey === "string" ? entryObj.modelKey : "";
      if (!modelKey || byKey.has(modelKey)) continue;

      const maxContextLength =
        typeof entryObj.maxContextLength === "number"
          ? entryObj.maxContextLength
          : null;

      const identifier = downloadedModelIdentifier(entryObj) || modelKey;
      const vision = readBooleanField(entryObj, ["vision"]);
      const trainedForToolUse = readBooleanField(entryObj, [
        "trainedForToolUse",
        "trained_for_tool_use",
      ]);

      byKey.set(modelKey, {
        modelKey,
        identifier,
        isLoaded: false,
        vision,
        trainedForToolUse,
        maxContextLength,
      });
    }

    const mergedByKey = new Map<string, LlmModelOptionDto>();
    for (const [key, dto] of byKey) {
      mergedByKey.set(key, mergeLlmDtoWithRest(dto, lookupRest(key)));
    }

    const sdkKeysLower = new Set(
      [...byKey.keys()].map((k) => k.toLowerCase()),
    );
    for (const rest of restEntries) {
      if (sdkKeysLower.has(rest.key.toLowerCase())) continue;
      mergedByKey.set(rest.key, restEntryToDto(rest));
    }

    const models = [...mergedByKey.values()].sort((left, right) =>
      left.identifier.localeCompare(right.identifier),
    );

    return NextResponse.json({ ok: true as const, models });
  } catch (error) {
    if (isLmStudioConnectionError(error)) {
      return NextResponse.json({
        ok: false as const,
        error: `LM Studio is not reachable at ${baseUrl}. Start LM Studio or check the URL and port.`,
        models: [] as LlmModelOptionDto[],
      });
    }
    return NextResponse.json({
      ok: false as const,
      error: formatLmStudioError(error),
      models: [] as LlmModelOptionDto[],
    });
  }
}
