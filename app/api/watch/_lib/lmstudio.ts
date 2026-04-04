import { LMStudioClient } from "@lmstudio/sdk";
import { parseWatchModelJson, WATCH_RESPONSE_SCHEMA } from "./schema";

const LMSTUDIO_BASE_URL = "ws://127.0.0.1:1234";
const TARGET_MODEL_KEY = "lfm-2.5-ucf-1.6b";

let cachedClient: LMStudioClient | null = null;
let cachedResolvedModelKey: string | null = null;

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
    case "image/jpeg":
    case "image/jpg":
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
  if (cachedResolvedModelKey) {
    return cachedResolvedModelKey;
  }

  const client = getClient();

  let loadedModels;
  try {
    loadedModels = await client.llm.listLoaded();
  } catch (error) {
    if (isConnectionError(error)) {
      throw new Error(
        "LM Studio local server is not running or is unreachable at ws://127.0.0.1:1234",
      );
    }
    throw error;
  }

  const loadedTarget = loadedModels.find(
    (model) =>
      model.modelKey === TARGET_MODEL_KEY ||
      model.identifier === TARGET_MODEL_KEY,
  );

  if (loadedTarget) {
    if (!loadedTarget.vision) {
      throw new Error(
        `LM Studio model "${TARGET_MODEL_KEY}" is loaded but does not support image input`,
      );
    }

    cachedResolvedModelKey = loadedTarget.modelKey;
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

  const loadedModel = await client.llm.model(TARGET_MODEL_KEY);
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
          "Analyze this frame with extreme caution. Detect ANY potential harm: self-harm, weapons, accidents, threats, blood, violence, or anything that could endanger life—even if not actively happening right now. Be paranoid as fuck, never optimistic. If ANY doubt, flag as harmful. But not to non-lethal weapons like toyguns/nerfguns as they are safe to use.ONLY WRITE DESCRIPTIONS WHEN FOUND REAL HARM. **ONLY SET HARM TRUE IF REAL HARM IS DETECTED**Reply ONLY in strict JSON: {'isHarm': true/false, 'description': 'brief exact reason only if true, else null'}. One wrong call and someone dies. No explanations outside JSON.",
      },
      {
        role: "user",
        content:
          "Analyze this CCTV frame. Reply ONLY in strict JSON: {'isHarm': true/false, 'description': 'brief exact reason only if true, else null'}. One wrong call and someone dies. No explanations outside JSON.",
        images: [image],
      },
    ],
    {
      maxTokens: 200,
      temperature: 0,
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
