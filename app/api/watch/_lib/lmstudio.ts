import { LMStudioClient } from "@lmstudio/sdk";
import { parseWatchModelJson, WATCH_RESPONSE_SCHEMA } from "./schema";

const LMSTUDIO_BASE_URL = "ws://127.0.0.1:1234";
const TARGET_MODEL_KEY = "lfm-2.5-ucf-1.6b";

let cachedClient: LMStudioClient | null = null;
let cachedResolvedModelKey: string | null = null;

type LoadedLlmHandle = Awaited<
  ReturnType<LMStudioClient["llm"]["listLoaded"]>
>[number];

function getClient(): LMStudioClient {
  if (cachedClient) return cachedClient;

  cachedClient = new LMStudioClient({
    baseUrl: LMSTUDIO_BASE_URL,
    verboseErrorMessages: true,
  });

  return cachedClient;
}

function mimeTypeToFileName(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "frame.png";
    case "image/webp":
      return "frame.webp";
    default:
      return "frame.jpg";
  }
}

function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  return (
    lower.includes("econnrefused") ||
    lower.includes("connect") ||
    lower.includes("websocket") ||
    lower.includes("ws://") ||
    lower.includes("wss://") ||
    lower.includes("127.0.0.1:1234") ||
    lower.includes("localhost") ||
    lower.includes("failed to fetch") ||
    lower.includes("not running")
  );
}

async function resolveWatchModelKey(): Promise<string> {
  const client = getClient();
  const cached = cachedResolvedModelKey;

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

  const loadedTarget = [cached, TARGET_MODEL_KEY]
    .filter((value): value is string => !!value)
    .map((candidateKey) => findLoadedTarget(candidateKey))
    .find((value): value is LoadedLlmHandle => value !== undefined);

  if (loadedTarget) {
    const loadedInfo = await loadedTarget.getModelInfo();

    if (!loadedInfo.vision) {
      throw new Error(
        `LM Studio model "${TARGET_MODEL_KEY}" is loaded but does not support image input`,
      );
    }

    if (loadedInfo.contextLength < loadedInfo.maxContextLength) {
      await loadedTarget.unload();

      const reloadedModel = await client.llm.load(loadedInfo.modelKey, {
        identifier: loadedInfo.identifier,
        config: {
          contextLength: loadedInfo.maxContextLength,
        },
      });
      const reloadedInfo = await reloadedModel.getModelInfo();
      cachedResolvedModelKey = reloadedInfo.modelKey;
      return cachedResolvedModelKey;
    }

    cachedResolvedModelKey = loadedInfo.modelKey;
    return cachedResolvedModelKey;
  }

  const downloadedModels = await client.system.listDownloadedModels("llm");
  const downloadedTarget = downloadedModels.find(
    (model) => model.modelKey === TARGET_MODEL_KEY,
  );

  if (!downloadedTarget) {
    throw new Error(
      `Required LM Studio model "${TARGET_MODEL_KEY}" is not loaded and not available locally`,
    );
  }

  const loadedModel = await client.llm.load(downloadedTarget.modelKey, {
    config: {
      contextLength: downloadedTarget.maxContextLength,
    },
  });
  const loadedInfo = await loadedModel.getModelInfo();

  if (!loadedInfo.vision) {
    throw new Error(
      `LM Studio model "${TARGET_MODEL_KEY}" was loaded but does not support image input`,
    );
  }

  cachedResolvedModelKey = loadedInfo.modelKey;
  return cachedResolvedModelKey;
}

export interface WatchLmStudioInput {
  readonly base64Image: string;
  readonly mimeType: string;
}

export interface WatchLmStudioOutput {
  readonly result: ReturnType<typeof parseWatchModelJson>;
  readonly rawText: string;
  readonly modelKey: string;
}

export async function runWatchLmStudio(
  input: WatchLmStudioInput,
): Promise<WatchLmStudioOutput> {
  const client = getClient();
  const modelKey = await resolveWatchModelKey();
  const model = await client.llm.model(modelKey);

  const image = await client.files.prepareImageBase64(
    mimeTypeToFileName(input.mimeType),
    input.base64Image,
  );

  const response = await model.respond(
    [
      {
        role: "system",
        content:
          "Analyze this frame with absolute strictness and extreme caution. Detect ANY potential harm: self-harm, weapons, accidents, threats, blood, violence, or life-endangering elements (even if not active). CRITICAL RULE: If you detect ANY lethal items, weapons, or potentially fatal scenarios, you MUST mark it as harm immediately, no matter if the context is unclear, ambiguous, or seemingly benign. Context does not excuse lethal objects. Be paranoid; never optimistic. If there is any doubt whatsoever, flag as harmful. (Exception: Clear, obvious toy guns are safe).",
      },
      {
        role: "user",
        content: "Analyze this CCTV frame.",
        images: [image],
      },
    ],
    {
      maxTokens: 200,
      temperature: 0,
      structured: { type: "json", jsonSchema: WATCH_RESPONSE_SCHEMA },
    },
  );

  const rawText = response?.content?.trim();
  if (!rawText) {
    throw new Error("LM Studio returned empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown JSON error";
    throw new Error(`LM Studio returned invalid JSON: ${message}`);
  }

  const result = parseWatchModelJson(parsed);
  return { result, rawText, modelKey };
}
