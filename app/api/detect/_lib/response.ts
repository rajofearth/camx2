import { randomUUID } from "node:crypto";
import type { DetectErr, DetectErrorCode, DetectOk } from "@/app/lib/types";
import { toHttpStatus } from "./errors";

export function generateRequestId(): string {
  return randomUUID();
}

export function createSuccessResponse(
  requestId: string,
  detections: DetectOk["detections"],
  frame: DetectOk["frame"],
  meta?: DetectOk["meta"],
): Response {
  return Response.json(
    { ok: true, requestId, detections, frame, meta },
    { status: 200 },
  );
}

export function createErrorResponse(
  requestId: string,
  errorCode: DetectErrorCode,
  message: string,
  details?: DetectErr["details"],
): Response {
  return Response.json(
    { ok: false, requestId, errorCode, message, details },
    { status: toHttpStatus(errorCode) },
  );
}
