import type { LMStudioClient } from "@lmstudio/sdk";
import type { PersistedLmJobRuntime } from "@/app/lib/lm-studio-runtime";
import {
  createLmStudioClientForRequest,
  normalizeLmStudioSdkBaseUrl,
} from "@/app/lib/lmstudio-client-factory";

type LoadedLlmHandle = Awaited<
  ReturnType<LMStudioClient["llm"]["listLoaded"]>
>[number];

const clientByEndpoint = new Map<string, LMStudioClient>();
const resolvedModelKeys = new Map<string, string>();

function endpointCacheKey(rt: PersistedLmJobRuntime): string {
  return `${normalizeLmStudioSdkBaseUrl(rt.baseUrl)}\u0000${rt.apiToken}`;
}

function resolveCacheKey(
  rt: PersistedLmJobRuntime,
  logicalKey: string,
): string {
  return `${endpointCacheKey(rt)}\u0000${logicalKey}`;
}

export function getClientForJobRuntime(
  rt: PersistedLmJobRuntime,
): LMStudioClient {
  const k = endpointCacheKey(rt);
  let client = clientByEndpoint.get(k);
  if (!client) {
    client = createLmStudioClientForRequest(
      rt.baseUrl,
      rt.apiToken.trim() === "" ? undefined : rt.apiToken,
    );
    clientByEndpoint.set(k, client);
  }
  return client;
}

function isConnectionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes("econnrefused") ||
    lower.includes("connect") ||
    lower.includes("websocket") ||
    lower.includes("127.0.0.1:1234") ||
    lower.includes("localhost") ||
    lower.includes("not running")
  );
}

export async function resolveModelKey(
  rt: PersistedLmJobRuntime,
  modelKey: string,
): Promise<string> {
  const cached = resolvedModelKeys.get(resolveCacheKey(rt, modelKey));
  const client = getClientForJobRuntime(rt);

  let loadedModels: LoadedLlmHandle[];
  try {
    loadedModels = await client.llm.listLoaded();
  } catch (error) {
    if (isConnectionError(error)) {
      throw new Error(
        `LM Studio local server is not running or is unreachable at ${rt.baseUrl}`,
      );
    }
    throw error;
  }

  const candidateKeys = [cached, modelKey].filter(Boolean) as string[];
  let loadedTarget: LoadedLlmHandle | undefined;
  for (const key of candidateKeys) {
    loadedTarget = loadedModels.find(
      (model) => model.modelKey === key || model.identifier === key,
    );
    if (loadedTarget) break;
  }

  if (loadedTarget) {
    const loadedInfo = await loadedTarget.getModelInfo();

    if (loadedInfo.contextLength < loadedInfo.maxContextLength) {
      await loadedTarget.unload();
      const reloadedModel = await client.llm.load(loadedInfo.modelKey, {
        identifier: loadedInfo.identifier,
        config: { contextLength: loadedInfo.maxContextLength },
      });
      const reloadedInfo = await reloadedModel.getModelInfo();
      resolvedModelKeys.set(
        resolveCacheKey(rt, modelKey),
        reloadedInfo.modelKey,
      );
      return reloadedInfo.modelKey;
    }

    resolvedModelKeys.set(resolveCacheKey(rt, modelKey), loadedInfo.modelKey);
    return loadedInfo.modelKey;
  }

  const downloadedModels = await client.system.listDownloadedModels("llm");
  const downloadedTarget = downloadedModels.find(
    (model) => model.modelKey === cached || model.modelKey === modelKey,
  );

  if (!downloadedTarget) {
    throw new Error(
      `Required LM Studio model "${modelKey}" is not loaded and not available locally`,
    );
  }

  const loadedModel = await client.llm.load(downloadedTarget.modelKey, {
    config: { contextLength: downloadedTarget.maxContextLength },
  });
  const loadedInfo = await loadedModel.getModelInfo();
  resolvedModelKeys.set(resolveCacheKey(rt, modelKey), loadedInfo.modelKey);
  return loadedInfo.modelKey;
}

export function mimeTypeToFileName(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "frame.png";
    case "image/webp":
      return "frame.webp";
    default:
      return "frame.jpg";
  }
}
