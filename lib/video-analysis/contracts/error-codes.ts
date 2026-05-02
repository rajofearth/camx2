export type VideoAnalysisErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export class VideoAnalysisError extends Error {
  readonly code: VideoAnalysisErrorCode;
  readonly status: number;

  constructor(code: VideoAnalysisErrorCode, status: number, message: string) {
    super(message);
    this.name = "VideoAnalysisError";
    this.code = code;
    this.status = status;
  }
}

export function toErrorResponse(error: unknown): {
  readonly status: number;
  readonly body: {
    readonly ok: false;
    readonly errorCode: VideoAnalysisErrorCode;
    readonly message: string;
  };
} {
  if (error instanceof VideoAnalysisError) {
    return {
      status: error.status,
      body: {
        ok: false,
        errorCode: error.code,
        message: error.message,
      },
    };
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    status: 500,
    body: {
      ok: false,
      errorCode: "INTERNAL_ERROR",
      message,
    },
  };
}
