import type { NextRequest } from "next/server";
import { BadRequestError } from "./_lib/errors";
import { runWatchGemini } from "./_lib/gemini";
import {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
} from "./_lib/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();

  try {
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return createErrorResponse(
        requestId,
        "BAD_REQUEST",
        "Content-Type must be multipart/form-data",
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to parse form data";
      return createErrorResponse(requestId, "BAD_REQUEST", message);
    }

    const file = formData.get("frame");
    if (!file || !(file instanceof Blob)) {
      return createErrorResponse(
        requestId,
        "BAD_REQUEST",
        "Missing or invalid 'frame' field",
      );
    }
    if (file.size === 0) {
      return createErrorResponse(requestId, "BAD_REQUEST", "Empty frame file");
    }

    const mimeType = file.type || "image/jpeg";

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read frame data";
      return createErrorResponse(requestId, "BAD_REQUEST", message);
    }

    const base64Image = buffer.toString("base64");

    const { result } = await runWatchGemini({
      base64Image,
      mimeType,
    });

    const latencyMs = performance.now() - startTime;
    return createSuccessResponse(requestId, result, { latencyMs });
  } catch (error) {
    const latencyMs = performance.now() - startTime;

    if (error instanceof BadRequestError) {
      return createErrorResponse(
        requestId,
        error.errorCode,
        error.message,
        error.details,
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";

    if (
      typeof message === "string" &&
      (message.includes("Missing GEMINI_API_KEY") ||
        message.includes("API key") ||
        message.includes("Unauthorized"))
    ) {
      return createErrorResponse(
        requestId,
        "UNAUTHORIZED",
        "Missing or invalid GEMINI_API_KEY",
        { latencyMs },
      );
    }

    if (
      typeof message === "string" &&
      (message.includes("Gemini returned invalid JSON") ||
        message.includes("429") ||
        message.includes("503") ||
        message.includes("upstream"))
    ) {
      return createErrorResponse(requestId, "UPSTREAM_ERROR", message, {
        latencyMs,
      });
    }

    console.error(
      `[WATCH] [${requestId}] Unexpected error (${latencyMs.toFixed(0)}ms):`,
      error,
    );

    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "An unexpected error occurred",
      { latencyMs },
    );
  }
}
