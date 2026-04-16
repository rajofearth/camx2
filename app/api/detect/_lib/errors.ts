import type { DetectErrorCode } from "@/app/lib/types";

// Base error for all detection errors
export class DetectError extends Error {
  constructor(
    public readonly errorCode: DetectErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

// Specific error types for detection failures
export class BadRequestError extends DetectError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("BAD_REQUEST", message, details);
  }
}

export class UnsupportedMediaError extends DetectError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("UNSUPPORTED_MEDIA", message, details);
  }
}

export class ModelError extends DetectError {
  constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
    cause?: unknown,
  ) {
    super("MODEL_ERROR", message, details, cause);
  }
}

export class InferenceError extends DetectError {
  constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
    cause?: unknown,
  ) {
    super("INFERENCE_ERROR", message, details, cause);
  }
}

export class InternalError extends DetectError {
  constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
    cause?: unknown,
  ) {
    super("INTERNAL_ERROR", message, details, cause);
  }
}

// Map error codes to HTTP status codes
export function toHttpStatus(errorCode: DetectErrorCode): number {
  switch (errorCode) {
    case "BAD_REQUEST":
      return 400;
    case "UNSUPPORTED_MEDIA":
      return 415;
    default:
      return 500;
  }
}
