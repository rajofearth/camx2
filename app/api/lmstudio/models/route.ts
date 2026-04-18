import { LMStudioClient } from "@lmstudio/sdk";
import { NextResponse } from "next/server";

import type { LlmModelOptionDto } from "@/app/lib/model-configuration-types";
import {
  formatLmStudioError,
  isLmStudioConnectionError,
  normalizeLmStudioWsUrl,
} from "@/app/lib/lmstudio-url";

export const runtime = "nodejs";

type LoadedLlmHandle = Awaited<
  ReturnType<LMStudioClient["llm"]["listLoaded"]>
>[number];

interface ModelsBody {
  readonly baseUrl?: unknown;
  readonly apiToken?: unknown;
}

function readToolTraining(info: Record<string, unknown>): boolean | null {
  if (typeof info.trainedForToolUse === "boolean") {
    return info.trainedForToolUse;
  }
  if (typeof info.trained_for_tool_use === "boolean") {
    return info.trained_for_tool_use;
  }
  return null;
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

  const rawUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
  const apiToken =
    typeof body.apiToken === "string" && body.apiToken.trim().length > 0
      ? body.apiToken.trim()
      : undefined;

  let baseUrl: string;
  try {
    baseUrl = normalizeLmStudioWsUrl(rawUrl);
  } catch (error) {
    return NextResponse.json(
      { ok: false as const, error: formatLmStudioError(error), models: [] },
      { status: 400 },
    );
  }

  const client = new LMStudioClient({
    baseUrl,
    apiToken,
    verboseErrorMessages: false,
  });

  try {
    const loadedHandles: LoadedLlmHandle[] = await client.llm.listLoaded();
    const byKey = new Map<string, LlmModelOptionDto>();

    for (const handle of loadedHandles) {
      const info = (await handle.getModelInfo()) as unknown as Record<
        string,
        unknown
      >;

      const modelKey =
        typeof info.modelKey === "string"
          ? info.modelKey
          : typeof (handle as { modelKey?: string }).modelKey === "string"
            ? (handle as { modelKey: string }).modelKey
            : "";
      if (!modelKey) continue;

      const identifier =
        typeof info.identifier === "string" ? info.identifier : modelKey;
      const vision =
        typeof info.vision === "boolean" ? info.vision : null;
      const maxContextLength =
        typeof info.maxContextLength === "number"
          ? info.maxContextLength
          : null;

      byKey.set(modelKey, {
        modelKey,
        identifier,
        isLoaded: true,
        vision,
        trainedForToolUse: readToolTraining(info),
        maxContextLength,
      });
    }

    const downloaded = await client.system.listDownloadedModels("llm");
    for (const entry of downloaded) {
      const modelKey = entry.modelKey;
      if (byKey.has(modelKey)) continue;

      const maxContextLength =
        typeof entry.maxContextLength === "number"
          ? entry.maxContextLength
          : null;

      byKey.set(modelKey, {
        modelKey,
        identifier: modelKey,
        isLoaded: false,
        vision: null,
        trainedForToolUse: null,
        maxContextLength,
      });
    }

    const models = [...byKey.values()].sort((left, right) =>
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
