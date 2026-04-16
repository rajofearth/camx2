export type DetectionModel = "rfdetr" | "yolo";

export interface DetectionMask {
  readonly width: number;
  readonly height: number;
  readonly data: string;
}

export interface Detection {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly confidence: number;
  readonly class: number;
  readonly mask?: DetectionMask;
}

export interface FrameDimensions {
  readonly width: number;
  readonly height: number;
}

export type DetectErrorCode =
  | "BAD_REQUEST"
  | "UNSUPPORTED_MEDIA"
  | "MODEL_ERROR"
  | "INFERENCE_ERROR"
  | "INTERNAL_ERROR";

export interface DetectOk {
  readonly ok: true;
  readonly requestId: string;
  readonly detections: readonly Detection[];
  readonly frame: FrameDimensions;
  readonly meta?: {
    readonly latencyMs?: number;
  };
}

export interface DetectErr {
  readonly ok: false;
  readonly requestId: string;
  readonly errorCode: DetectErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type DetectResponse = DetectOk | DetectErr;

// Precompute allowed error codes for efficient lookup
const DETECT_ERROR_CODES = new Set<DetectErrorCode>([
  "BAD_REQUEST",
  "UNSUPPORTED_MEDIA",
  "MODEL_ERROR",
  "INFERENCE_ERROR",
  "INTERNAL_ERROR",
]);

function isDetectionMask(value: unknown): value is DetectionMask {
  if (
    typeof value !== "object" ||
    value === null
  )
    return false;
  const mask = value as Record<string, unknown>;
  const { width, height, data } = mask;
  return (
    typeof width === "number" &&
    Number.isInteger(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isInteger(height) &&
    height > 0 &&
    typeof data === "string"
  );
}

function isDetection(value: unknown): value is Detection {
  if (
    typeof value !== "object" ||
    value === null
  )
    return false;
  const d = value as Record<string, unknown>;
  const { x1, y1, x2, y2, confidence, class: classNum, mask } = d;
  return (
    typeof x1 === "number" &&
    typeof y1 === "number" &&
    typeof x2 === "number" &&
    typeof y2 === "number" &&
    typeof confidence === "number" &&
    confidence >= 0 && confidence <= 1 &&
    typeof classNum === "number" &&
    Number.isInteger(classNum) && classNum >= 0 &&
    (mask === undefined || isDetectionMask(mask))
  );
}

function isFrameDimensions(value: unknown): value is FrameDimensions {
  if (
    typeof value !== "object" ||
    value === null
  )
    return false;
  const f = value as Record<string, unknown>;
  const { width, height } = f;
  return (
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
  );
}

function isDetectErrorCode(value: unknown): value is DetectErrorCode {
  return typeof value === "string" && DETECT_ERROR_CODES.has(value as DetectErrorCode);
}

export function parseDetectResponse(json: unknown): DetectResponse {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid response: not an object");
  }

  const obj = json as Record<string, unknown>;

  if (typeof obj.ok !== "boolean") {
    throw new Error("Invalid response: missing 'ok' field");
  }

  if (typeof obj.requestId !== "string" || !obj.requestId) {
    throw new Error("Invalid response: missing or invalid 'requestId'");
  }

  if (obj.ok === true) {
    if (!Array.isArray(obj.detections)) {
      throw new Error("Invalid response: 'detections' must be an array");
    }

    // Use a for loop for efficiency instead of every()
    for (let i = 0; i < obj.detections.length; i++) {
      if (!isDetection(obj.detections[i])) {
        throw new Error("Invalid response: invalid detection format");
      }
    }

    if (!isFrameDimensions(obj.frame)) {
      throw new Error("Invalid response: invalid frame dimensions");
    }

    return {
      ok: true,
      requestId: obj.requestId,
      detections: obj.detections as Detection[],
      frame: obj.frame as FrameDimensions,
      meta:
        obj.meta && typeof obj.meta === "object"
          ? (obj.meta as DetectOk["meta"])
          : undefined,
    };
  }

  if (!isDetectErrorCode(obj.errorCode)) {
    throw new Error("Invalid response: missing or invalid 'errorCode'");
  }

  if (typeof obj.message !== "string") {
    throw new Error("Invalid response: missing or invalid 'message'");
  }

  return {
    ok: false,
    requestId: obj.requestId,
    errorCode: obj.errorCode as DetectErrorCode,
    message: obj.message,
    details:
      obj.details && typeof obj.details === "object"
        ? (obj.details as DetectErr["details"])
        : undefined,
  };
}
