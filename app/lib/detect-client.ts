import type { DetectOk, DetectResponse } from "./types";
import { parseDetectResponse } from "./types";

export interface FetchDetectOptions {
  readonly signal?: AbortSignal;
  readonly model?: "rfdetr" | "yolo";
}

export interface FetchDetectResult {
  readonly success: true;
  readonly data: DetectOk;
}

export interface FetchDetectError {
  readonly success: false;
  readonly error: string;
  readonly errorCode?: Extract<DetectResponse, { ok: false }>["errorCode"];
}

export type FetchDetectResultType = FetchDetectResult | FetchDetectError;

export async function fetchDetect(
  imageBlob: Blob,
  options?: FetchDetectOptions,
): Promise<FetchDetectResultType> {
  const formData = new FormData();
  formData.append("frame", imageBlob);
  if (options?.model) formData.append("model", options.model);

  let response: Response;
  try {
    response = await fetch("/api/detect", {
      method: "POST",
      body: formData,
      signal: options?.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Request cancelled" };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Network error: ${message}` };
  }

  if (!response.ok && response.status >= 500) {
    return {
      success: false,
      error: `Server error: ${response.status} ${response.statusText}`,
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse response";
    return { success: false, error: `Invalid response: ${message}` };
  }

  const parsed = parseDetectResponse(json);

  if (!parsed.ok) {
    return {
      success: false,
      error: parsed.message,
      errorCode: parsed.errorCode,
    };
  }

  return { success: true, data: parsed };
}
