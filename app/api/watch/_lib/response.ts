import { randomUUID } from "node:crypto";
import type { WatchErr, WatchErrorCode, WatchOk } from "@/app/lib/watch-types";
import { toHttpStatus } from "./errors";

export function generateRequestId(): string {
  return randomUUID();
}

export function createSuccessResponse(
  requestId: string,
  result: WatchOk["result"],
  meta?: WatchOk["meta"],
): Response {
  const body: WatchOk = {
    ok: true,
    requestId,
    result,
    meta,
  };
  return Response.json(body, { status: 200 });
}

export function createErrorResponse(
  requestId: string,
  errorCode: WatchErrorCode,
  message: string,
  details?: WatchErr["details"],
): Response {
  const status = toHttpStatus(errorCode);
  const body: WatchErr = {
    ok: false,
    requestId,
    errorCode,
    message,
    details,
  };
  return Response.json(body, { status });
}
