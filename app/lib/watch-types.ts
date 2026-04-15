export interface WatchResult {
  readonly isHarm: boolean | null;
  readonly description: string | null;
}

export interface WatchVerificationMeta {
  readonly applied: boolean;
  readonly matchesPrompt?: boolean | null;
  readonly reason?: string | null;
  readonly modelKey?: string | null;
  readonly latencyMs: number;
  readonly rawText?: string | null;
  readonly overturned: boolean;
}

export type WatchErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export interface WatchOk {
  readonly ok: true;
  readonly requestId: string;
  readonly result: WatchResult;
  readonly meta?: {
    readonly latencyMs?: number;
    readonly preprocessMs?: number;
    readonly agentMs?: number;
    readonly verificationMs?: number;
    readonly processedSize?: number;
    readonly originalSize?: number;
    readonly verification?: WatchVerificationMeta | null;
  };
}

export interface WatchErr {
  readonly ok: false;
  readonly requestId: string;
  readonly errorCode: WatchErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type WatchResponse = WatchOk | WatchErr;

function isWatchResult(value: unknown): value is WatchResult {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;

  const isValidIsHarm = typeof obj.isHarm === "boolean" || obj.isHarm === null;
  const isValidDescription =
    typeof obj.description === "string" || obj.description === null;

  return isValidIsHarm && isValidDescription;
}

function isWatchErrorCode(value: unknown): value is WatchErrorCode {
  return (
    typeof value === "string" &&
    (value === "BAD_REQUEST" ||
      value === "UNAUTHORIZED" ||
      value === "UPSTREAM_ERROR" ||
      value === "INTERNAL_ERROR")
  );
}

export function parseWatchResponse(json: unknown): WatchResponse {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid response: not an object");
  }

  const obj = json as Record<string, unknown>;

  if (typeof obj.ok !== "boolean") {
    throw new Error("Invalid response: missing 'ok' field");
  }

  if (typeof obj.requestId !== "string" || obj.requestId.length === 0) {
    throw new Error("Invalid response: missing or invalid 'requestId'");
  }

  if (obj.ok === true) {
    if (!isWatchResult(obj.result)) {
      throw new Error("Invalid response: invalid 'result'");
    }

    return {
      ok: true,
      requestId: obj.requestId,
      result: obj.result,
      meta:
        obj.meta && typeof obj.meta === "object"
          ? (obj.meta as WatchOk["meta"])
          : undefined,
    };
  }

  if (!isWatchErrorCode(obj.errorCode)) {
    throw new Error("Invalid response: missing or invalid 'errorCode'");
  }
  if (typeof obj.message !== "string") {
    throw new Error("Invalid response: missing or invalid 'message'");
  }

  return {
    ok: false,
    requestId: obj.requestId,
    errorCode: obj.errorCode,
    message: obj.message,
    details:
      obj.details && typeof obj.details === "object"
        ? (obj.details as WatchErr["details"])
        : undefined,
  };
}
