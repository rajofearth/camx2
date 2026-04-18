import { LMStudioClient } from "@lmstudio/sdk";
import {
  WATCH_SYSTEM_PROMPT,
  WATCH_USER_MESSAGE,
  WATCH_VERIFICATION_SYSTEM_PROMPT,
  watchVerificationUserMessage,
} from "./prompts";
import {
  parseWatchHarmVerificationJson,
  parseWatchModelJson,
  WATCH_HARM_VERIFICATION_SCHEMA,
  WATCH_RESPONSE_SCHEMA,
} from "./schema";

const LMSTUDIO_BASE_URL =
  process.env.LMSTUDIO_BASE_URL ?? "ws://127.0.0.1:1234";
const TARGET_MODEL_KEY = process.env.LMSTUDIO_WATCH_MODEL ?? "lfm-2.5-ucf-1.6b";

const ANALYSIS_MAX_TOKENS = 420;
const VERIFICATION_MAX_TOKENS = 280;

let cachedClient: LMStudioClient | null = null;
let cachedResolvedModelKey: string | null = null;

type LoadedLlmHandle = Awaited<
  ReturnType<LMStudioClient["llm"]["listLoaded"]>
>[number];

type VisionModel = Awaited<
  ReturnType<ReturnType<LMStudioClient["llm"]["model"]>>
>;

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
        config: { contextLength: loadedInfo.maxContextLength },
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
    config: { contextLength: downloadedTarget.maxContextLength },
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

function parseJsonContent(rawText: string, label: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown JSON error";
    throw new Error(`${label}: ${message}`);
  }
}

async function respondStructuredJson(
  model: VisionModel,
  messages: Parameters<VisionModel["respond"]>[0],
  jsonSchema: Record<string, unknown>,
  maxTokens: number,
): Promise<string> {
  const response = await model.respond(messages, {
    maxTokens,
    temperature: 0,
    structured: { type: "json", jsonSchema },
  });
  const rawText = response?.content?.trim();
  if (!rawText) {
    throw new Error("LM Studio returned empty response");
  }
  return rawText;
}

export interface WatchLmStudioInput {
  readonly base64Image: string;
  readonly mimeType: string;
}

export interface WatchLmStudioOutput {
  readonly result: ReturnType<typeof parseWatchModelJson>;
  readonly rawText: string;
  readonly modelKey: string;
  readonly verification: WatchVerificationOutput | null;
}

export interface WatchVerificationInput {
  readonly base64Image: string;
  readonly mimeType: string;
  readonly description: string;
}

export interface WatchVerificationOutput {
  readonly matchesPrompt: boolean;
  readonly reason: string;
  readonly rawText: string;
  readonly modelKey: string;
  readonly latencyMs: number;
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

  const rawText = await respondStructuredJson(
    model,
    [
      { role: "system", content: WATCH_SYSTEM_PROMPT },
      {
        role: "user",
        content: WATCH_USER_MESSAGE,
        images: [image],
      },
    ],
    WATCH_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    ANALYSIS_MAX_TOKENS,
  );

  const parsed = parseJsonContent(rawText, "LM Studio returned invalid JSON");
  const result = parseWatchModelJson(parsed);

  if (result.isHarm === true && result.description) {
    const verification = await verifyWatchHarmDescription({
      base64Image: input.base64Image,
      mimeType: input.mimeType,
      description: result.description,
    });

    if (!verification.matchesPrompt) {
      return {
        result: { isHarm: false, description: null },
        rawText: JSON.stringify(
          {
            analysis: parsed,
            verification: {
              matchesPrompt: verification.matchesPrompt,
              reason: verification.reason,
              rawText: verification.rawText,
            },
          },
          null,
          2,
        ),
        modelKey,
        verification,
      };
    }

    return {
      result,
      rawText: JSON.stringify(
        {
          analysis: parsed,
          verification: {
            matchesPrompt: verification.matchesPrompt,
            reason: verification.reason,
            rawText: verification.rawText,
          },
        },
        null,
        2,
      ),
      modelKey,
      verification,
    };
  }

  return { result, rawText, modelKey, verification: null };
}

export async function verifyWatchHarmDescription(
  input: WatchVerificationInput,
): Promise<WatchVerificationOutput> {
  const verificationStart = performance.now();
  const client = getClient();
  const modelKey = await resolveWatchModelKey();
  const model = await client.llm.model(modelKey);

  const image = await client.files.prepareImageBase64(
    mimeTypeToFileName(input.mimeType),
    input.base64Image,
  );

  const rawText = await respondStructuredJson(
    model,
    [
      { role: "system", content: WATCH_VERIFICATION_SYSTEM_PROMPT },
      {
        role: "user",
        content: watchVerificationUserMessage(input.description),
        images: [image],
      },
    ],
    WATCH_HARM_VERIFICATION_SCHEMA as unknown as Record<string, unknown>,
    VERIFICATION_MAX_TOKENS,
  );

  const parsed = parseJsonContent(
    rawText,
    "LM Studio returned invalid verification JSON",
  );
  const result = parseWatchHarmVerificationJson(parsed);
  return {
    matchesPrompt: result.matchesPrompt,
    reason: result.reason,
    rawText,
    modelKey,
    latencyMs: performance.now() - verificationStart,
  };
}
