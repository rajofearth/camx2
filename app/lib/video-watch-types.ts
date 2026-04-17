export type VideoWatchPhase =
  | "idle"
  | "checking_cache"
  | "uploading"
  | "extracting"
  | "analyzing"
  | "combining"
  | "completed"
  | "error";

export interface VideoWatchCacheInfo {
  readonly fingerprint: string;
  readonly cacheHit: boolean;
  readonly source: "memory" | "disk" | "upload";
}

// Full prompt/response data for one model call
export interface VideoWatchFrameModelTurn {
  readonly modelKey: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly responseRaw: string;
}

export interface VideoWatchFrameLlmTrace {
  readonly narrative: VideoWatchFrameModelTurn;
  readonly tracking: VideoWatchFrameModelTurn;
}

export interface VideoWatchFrameResult {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly timestampLabel: string;
  readonly frameAnalysis: string;
  readonly priorFrameAnalysis: string;
  readonly priorVisibleObjects: readonly string[];
  readonly objects: Readonly<Record<string, string>>;
  readonly rawText: string;
  readonly modelKey: string;
  readonly latencyMs: number;
  readonly fromCache: boolean;
  readonly error?: string | null;
  readonly llm?: VideoWatchFrameLlmTrace;
  readonly priorFieldsOrigin?: "server";
}

export interface VideoWatchSummary {
  readonly timelineText: string;
  readonly summaryText: string;
  readonly modelKey: string;
  readonly rawText: string;
}

export interface VideoWatchJob {
  readonly ok: true;
  readonly jobId: string;
  readonly status: VideoWatchPhase;
  readonly fingerprint: string;
  readonly sourceFileName: string;
  readonly totalFrames: number;
  readonly analyzedFrames: number;
  readonly cache: VideoWatchCacheInfo;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly summary?: VideoWatchSummary;
  readonly error?: string;
}

export interface VideoWatchError {
  readonly ok: false;
  readonly errorCode:
    | "BAD_REQUEST"
    | "NOT_FOUND"
    | "UPSTREAM_ERROR"
    | "INTERNAL_ERROR";
  readonly message: string;
}

export type VideoWatchResponse = VideoWatchJob | VideoWatchError;

export interface VideoWatchChatOk {
  readonly ok: true;
  readonly answer: string;
  readonly modelKey: string;
}

export interface VideoWatchChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface VideoWatchChatError {
  readonly ok: false;
  readonly message: string;
}

export type VideoWatchChatResponse = VideoWatchChatOk | VideoWatchChatError;

// Validates and parses VideoWatch API response object
export function parseVideoWatchResponse(json: unknown): VideoWatchResponse {
  if (!json || typeof json !== "object")
    throw new Error("Invalid video watch response");
  const value = json as Record<string, unknown>;
  if (value.ok === false) {
    if (
      typeof value.errorCode === "string" &&
      typeof value.message === "string"
    ) {
      return {
        ok: false,
        errorCode: value.errorCode as VideoWatchError["errorCode"],
        message: value.message,
      };
    }
    throw new Error("Invalid video watch error response");
  }
  if (
    value.ok !== true ||
    typeof value.jobId !== "string" ||
    typeof value.status !== "string" ||
    typeof value.fingerprint !== "string" ||
    typeof value.sourceFileName !== "string" ||
    typeof value.totalFrames !== "number" ||
    typeof value.analyzedFrames !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("Invalid video watch success response");
  }
  return value as unknown as VideoWatchJob;
}

// Validates and parses VideoWatch chat API response object
export function parseVideoWatchChatResponse(
  json: unknown,
): VideoWatchChatResponse {
  if (!json || typeof json !== "object")
    throw new Error("Invalid video watch chat response");
  const value = json as Record<string, unknown>;
  if (value.ok === true) {
    if (
      typeof value.answer !== "string" ||
      typeof value.modelKey !== "string"
    ) {
      throw new Error("Invalid video watch chat success response");
    }
    return value as unknown as VideoWatchChatOk;
  }
  if (typeof value.message !== "string")
    throw new Error("Invalid video watch chat error response");
  return value as unknown as VideoWatchChatError;
}
