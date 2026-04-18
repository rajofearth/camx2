import type { LMStudioClient } from "@lmstudio/sdk";
import {
  getClientForJobRuntime,
  mimeTypeToFileName,
  resolveModelKey,
} from "@/app/api/video-watch/_lib/llm-client";
import type { WatchRequestRuntime } from "@/app/lib/lm-studio-runtime";
import { watchRequestToPersistedRuntime } from "@/app/lib/lm-studio-runtime";
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

const ANALYSIS_MAX_TOKENS = 420;
const VERIFICATION_MAX_TOKENS = 280;

type VisionModel = Awaited<ReturnType<LMStudioClient["llm"]["model"]>>;

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
  rt: WatchRequestRuntime,
): Promise<WatchLmStudioOutput> {
  const jobRt = watchRequestToPersistedRuntime(rt);
  const client = getClientForJobRuntime(jobRt);
  const modelKey = await resolveModelKey(jobRt, rt.watchModelKey);
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
    const verification = await verifyWatchHarmDescription(
      {
        base64Image: input.base64Image,
        mimeType: input.mimeType,
        description: result.description,
      },
      rt,
    );

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
  rt: WatchRequestRuntime,
): Promise<WatchVerificationOutput> {
  const verificationStart = performance.now();
  const jobRt = watchRequestToPersistedRuntime(rt);
  const client = getClientForJobRuntime(jobRt);
  const modelKey = await resolveModelKey(jobRt, rt.watchModelKey);
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
