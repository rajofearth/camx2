import { LMStudioClient } from "@lmstudio/sdk";
import { LMSTUDIO_BASE_URL } from "./config";

let cachedClient: LMStudioClient | null = null;
const resolvedModelKeys = new Map<string, string>();

type LoadedLlmHandle = Awaited<
  ReturnType<LMStudioClient["llm"]["listLoaded"]>
>[number];

export function getClient(): LMStudioClient {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new LMStudioClient({
    baseUrl: LMSTUDIO_BASE_URL,
    verboseErrorMessages: true,
  });

  return cachedClient;
}

function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  return (
    lower.includes("econnrefused") ||
    lower.includes("connect") ||
    lower.includes("websocket") ||
    lower.includes("127.0.0.1:1234") ||
    lower.includes("localhost") ||
    lower.includes("not running")
  );
}

export async function resolveModelKey(modelKey: string): Promise<string> {
  const client = getClient();
  const cached = resolvedModelKeys.get(modelKey);

  const loadedModels = await (async () => {
    try {
      return await client.llm.listLoaded();
    } catch (error) {
      if (isConnectionError(error)) {
        throw new Error(
          "LM Studio local server is not running or is unreachable at ws://127.0.0.1:1234",
        );
      }
      throw error;
    }
  })();

  const findLoadedTarget = (
    candidateKey: string,
  ): LoadedLlmHandle | undefined =>
    loadedModels.find(
      (model) =>
        model.modelKey === candidateKey || model.identifier === candidateKey,
    );

  const loadedTarget = [cached, modelKey]
    .filter((value): value is string => !!value)
    .map((candidateKey) => findLoadedTarget(candidateKey))
    .find((value): value is LoadedLlmHandle => value !== undefined);

  if (loadedTarget) {
    const loadedInfo = await loadedTarget.getModelInfo();

    if (loadedInfo.contextLength < loadedInfo.maxContextLength) {
      await loadedTarget.unload();

      const reloadedModel = await client.llm.load(loadedInfo.modelKey, {
        identifier: loadedInfo.identifier,
        config: {
          contextLength: loadedInfo.maxContextLength,
        },
      });
      const reloadedInfo = await reloadedModel.getModelInfo();
      resolvedModelKeys.set(modelKey, reloadedInfo.modelKey);
      return reloadedInfo.modelKey;
    }

    resolvedModelKeys.set(modelKey, loadedInfo.modelKey);
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
    config: {
      contextLength: downloadedTarget.maxContextLength,
    },
  });
  const loadedInfo = await loadedModel.getModelInfo();
  resolvedModelKeys.set(modelKey, loadedInfo.modelKey);
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
