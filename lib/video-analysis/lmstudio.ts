import { LMStudioClient } from "@lmstudio/sdk";

export const FRAME_MODEL_KEY =
  process.env.VIDEO_WATCH_FRAME_MODEL_KEY ?? "lfm-ucf-400m";
export const SUMMARY_MODEL_KEY =
  process.env.VIDEO_WATCH_SUMMARY_MODEL_KEY ?? "google/gemma-4-e4b";
export const EMBEDDING_MODEL_KEY =
  process.env.VIDEO_WATCH_EMBEDDING_MODEL_KEY ??
  "text-embedding-nomic-embed-text-v1.5";
export const LMSTUDIO_BASE_URL =
  process.env.LMSTUDIO_BASE_URL ?? "ws://127.0.0.1:1234";

type LoadedLlmHandle = Awaited<
  ReturnType<LMStudioClient["llm"]["listLoaded"]>
>[number];

let cachedClient: LMStudioClient | null = null;
const resolvedLlmModelKeys = new Map<string, string>();
const resolvedEmbeddingModelKeys = new Map<string, string>();

export type ContextAwareLlmModel = {
  readonly applyPromptTemplate: (
    history: ReadonlyArray<{ readonly role: string; readonly content: string }>,
  ) => Promise<string>;
  readonly countTokens: (inputString: string) => Promise<number>;
  readonly getModelInfo: () => Promise<{
    readonly contextLength: number;
    readonly maxContextLength: number;
  }>;
  readonly respond: (
    history: readonly unknown[],
    options: Readonly<Record<string, unknown>>,
  ) => Promise<{ readonly content?: string }>;
};

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

export function getLmStudioClient(): LMStudioClient {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new LMStudioClient({
    baseUrl: LMSTUDIO_BASE_URL,
    verboseErrorMessages: true,
  });
  return cachedClient;
}

export async function resolveLlmModelKey(modelKey: string): Promise<string> {
  const client = getLmStudioClient();
  const cached = resolvedLlmModelKeys.get(modelKey);

  const loadedModels = await (async () => {
    try {
      return await client.llm.listLoaded();
    } catch (error) {
      if (isConnectionError(error)) {
        throw new Error(
          `LM Studio local server is not running or is unreachable at ${LMSTUDIO_BASE_URL}`,
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
      resolvedLlmModelKeys.set(modelKey, reloadedInfo.modelKey);
      return reloadedInfo.modelKey;
    }

    resolvedLlmModelKeys.set(modelKey, loadedInfo.modelKey);
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
  resolvedLlmModelKeys.set(modelKey, loadedInfo.modelKey);
  return loadedInfo.modelKey;
}

export async function resolveEmbeddingModelKey(
  modelKey: string,
): Promise<string> {
  const cached = resolvedEmbeddingModelKeys.get(modelKey);
  if (cached) {
    return cached;
  }

  const client = getLmStudioClient();
  const embeddingModels = await client.system.listDownloadedModels("embedding");
  const exactMatch = embeddingModels.find(
    (model) => model.modelKey === modelKey || model.displayName === modelKey,
  );
  const fuzzyMatch =
    exactMatch ??
    embeddingModels.find((model) =>
      model.modelKey.toLowerCase().includes(modelKey.toLowerCase()),
    );

  if (!fuzzyMatch) {
    throw new Error(
      `Required LM Studio embedding model "${modelKey}" is not available locally`,
    );
  }

  resolvedEmbeddingModelKeys.set(modelKey, fuzzyMatch.modelKey);
  return fuzzyMatch.modelKey;
}

export async function getFrameModel(): Promise<unknown> {
  const resolvedModelKey = await resolveLlmModelKey(FRAME_MODEL_KEY);
  return await getLmStudioClient().llm.model(resolvedModelKey);
}

export async function getSummaryModel(): Promise<ContextAwareLlmModel> {
  const resolvedModelKey = await resolveLlmModelKey(SUMMARY_MODEL_KEY);
  return (await getLmStudioClient().llm.model(
    resolvedModelKey,
  )) as ContextAwareLlmModel;
}

export async function embedTexts(
  texts: readonly string[],
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const client = getLmStudioClient();
  const resolvedEmbeddingKey =
    await resolveEmbeddingModelKey(EMBEDDING_MODEL_KEY);
  const embeddingModel = await client.embedding.model(resolvedEmbeddingKey);
  const result = (await embeddingModel.embed([...texts])) as
    | { embedding: number[] }
    | Array<{ embedding: number[] }>;
  const items = Array.isArray(result) ? result : [result];
  return items.map((item) => [...item.embedding]);
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector ?? [];
}

export async function summarizeText(input: string): Promise<{
  summaryText: string;
  rawText: string;
  modelKey: string;
}> {
  const model = await getSummaryModel();
  const resolvedModelKey = await resolveLlmModelKey(SUMMARY_MODEL_KEY);
  const response = await model.respond(
    [
      {
        role: "system",
        content:
          "You combine ordered frame analyses into a concise surveillance summary. Respect chronology, keep persistent entity IDs consistent, and do not invent details.",
      },
      {
        role: "user",
        content: `Summarize this compact video timeline:\n\n${input}`,
      },
    ],
    {
      temperature: 0.1,
      maxTokens: 400,
    },
  );

  const rawText = response?.content?.trim();
  if (!rawText) {
    throw new Error("LM Studio returned an empty summary response");
  }

  return {
    summaryText: rawText,
    rawText,
    modelKey: resolvedModelKey,
  };
}
