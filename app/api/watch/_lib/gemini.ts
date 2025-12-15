import { GoogleGenAI } from "@google/genai";
import { parseWatchModelJson, WATCH_RESPONSE_SCHEMA } from "./schema";

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY env var");
  }

  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export interface WatchGeminiInput {
  readonly base64Image: string;
  readonly mimeType: string;
}

export interface WatchGeminiOutput {
  readonly result: ReturnType<typeof parseWatchModelJson>;
  readonly rawText: string;
}

export async function runWatchGemini(
  input: WatchGeminiInput,
): Promise<WatchGeminiOutput> {
  const ai = getClient();
  const model = process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: input.base64Image,
              mimeType: input.mimeType,
            },
          },
          {
            text: "Analyze this CCTV frame. Return ONLY JSON per the response schema.",
          },
        ],
      },
    ],
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: WATCH_RESPONSE_SCHEMA,
      systemInstruction: [
        {
          text: "You are watching live CCTV feed, identifying and reporting anything unusual or harmful. only return description if you find situation to be harmful.",
        },
      ],
    },
  });

  const rawText = response?.text?.trim();
  if (!rawText) {
    throw new Error("Gemini returned empty response");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown JSON error";
    throw new Error(`Gemini returned invalid JSON: ${message}`);
  }

  const result = parseWatchModelJson(parsed);
  return { result, rawText };
}
