import { promises as fs } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import type { WatchResult } from "@/app/lib/watch-types";
import { BadRequestError } from "./_lib/errors";
import { runWatchLmStudio } from "./_lib/lmstudio";
import {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
} from "./_lib/response";

export const runtime = "nodejs";

const DEBUG_DIR = path.join(process.cwd(), "tmp", "watch-debug");

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

    // The client sends two fields:
    // - `frame` (processed image to be analyzed, e.g. compressed WebP)
    // - `original_frame` (original capture for debugging/audit) — optional
    const processedFile = formData.get("frame");
    const originalFile = formData.get("original_frame");

    if (!processedFile || !(processedFile instanceof Blob)) {
      return createErrorResponse(
        requestId,
        "BAD_REQUEST",
        "Missing or invalid 'frame' field",
      );
    }
    if (processedFile.size === 0) {
      return createErrorResponse(requestId, "BAD_REQUEST", "Empty frame file");
    }

    const mimeType = processedFile.type || "image/webp";

    const preprocessStart = performance.now();

    let bufferProcessed: Buffer;
    let bufferOriginal: Buffer;
    try {
      // Read processed (sent) frame
      bufferProcessed = Buffer.from(await processedFile.arrayBuffer());

      // Read original if present, otherwise fallback to processed bytes
      if (
        originalFile &&
        originalFile instanceof Blob &&
        originalFile.size > 0
      ) {
        bufferOriginal = Buffer.from(await originalFile.arrayBuffer());
      } else {
        bufferOriginal = bufferProcessed;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read frame data";
      return createErrorResponse(requestId, "BAD_REQUEST", message);
    }
    const preprocessEnd = performance.now();
    const preprocessMs = preprocessEnd - preprocessStart;

    // Validate the processed image before sending it to the agent.
    // If the processed bytes look invalid/corrupted or have an unknown header,
    // fall back to sending the original capture to the agent.
    function detectImageMime(buf: Buffer | Uint8Array | null): string | null {
      if (!buf || (buf as Buffer).length < 12) return null;
      const b = Buffer.from(buf as Buffer);
      // PNG signature: 89 50 4E 47
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
        return "image/png";
      // JPEG signature: FF D8 FF
      if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
      // WebP: 'RIFF'....'WEBP'
      if (
        b.toString("ascii", 0, 4) === "RIFF" &&
        b.toString("ascii", 8, 12) === "WEBP"
      )
        return "image/webp";
      return null;
    }

    // Determine final payload (prefer processed but fallback to original if invalid)
    const processedSize = bufferProcessed.length;
    const originalSize = bufferOriginal.length;

    let finalBase64 = bufferProcessed.toString("base64");
    let finalMime = mimeType;
    const detectedMime = detectImageMime(bufferProcessed);

    const usedOriginalForAgent = !detectedMime;

    if (!detectedMime) {
      // Processed image seems invalid — fallback to original capture so agent can still run
      finalBase64 = bufferOriginal.toString("base64");
      finalMime =
        originalFile &&
        originalFile instanceof Blob &&
        (originalFile as Blob).type
          ? (originalFile as Blob).type
          : mimeType;
      // Log for debugging
      console.error(
        `[WATCH] [${requestId}] Processed frame appears invalid (failed header check). Falling back to original frame for agent.`,
      );
    } else {
      // Use detected mime to be explicit
      finalMime = detectedMime;
    }

    const originalBase64 = bufferOriginal.toString("base64");
    const originalMimeType =
      originalFile &&
      originalFile instanceof Blob &&
      (originalFile as Blob).type
        ? (originalFile as Blob).type
        : mimeType;

    let result: WatchResult;
    let rawText = "";
    let modelKey = "";
    let agentMs = 0;

    try {
      const agentStart = performance.now();
      const res = await runWatchLmStudio({
        base64Image: finalBase64,
        mimeType: finalMime,
      });
      const agentEnd = performance.now();
      agentMs = agentEnd - agentStart;
      result = res.result;
      rawText = res.rawText;
      modelKey = res.modelKey;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // If the agent failed to load the processed image, retry once with the original capture.
      if (
        !usedOriginalForAgent &&
        (errMsg.includes("Failed to load image") ||
          errMsg.includes("Failed to format input"))
      ) {
        console.warn(
          `[WATCH] [${requestId}] Agent failed to load processed image; retrying with original image`,
        );
        const retryStart = performance.now();
        const res2 = await runWatchLmStudio({
          base64Image: originalBase64,
          mimeType: originalMimeType,
        });
        const retryEnd = performance.now();
        agentMs = retryEnd - retryStart;
        result = res2.result;
        rawText = res2.rawText;
        modelKey = res2.modelKey;
      } else {
        // Not a recoverable load error or we already used the original; rethrow.
        throw err;
      }
    }

    // Save debugging artifacts: original capture, processed (sent) image, and agent response metadata.
    try {
      await fs.mkdir(DEBUG_DIR, { recursive: true });

      // Determine extensions for processed and original files
      const processedExt =
        mimeType && mimeType.includes("/") ? mimeType.split("/")[1] : "bin";
      const originalMime =
        originalFile && originalFile instanceof Blob && originalFile.type
          ? (originalFile as Blob).type
          : mimeType;
      const originalExt =
        originalMime && originalMime.includes("/")
          ? originalMime.split("/")[1]
          : processedExt;

      const originalPath = path.join(
        DEBUG_DIR,
        `${requestId}-original.${originalExt}`,
      );
      await fs.writeFile(originalPath, bufferOriginal);

      const processedPath = path.join(
        DEBUG_DIR,
        `${requestId}-processed.${processedExt}`,
      );
      await fs.writeFile(processedPath, bufferProcessed);

      const meta = {
        requestId,
        mimeType,
        modelKey,
        preprocessMs,
        agentMs,
        processedSize,
        originalSize,
        totalMs: performance.now() - startTime,
        timestamp: new Date().toISOString(),
        debugFiles: {
          original: originalPath,
          processed: processedPath,
        },
      };

      const responsePath = path.join(DEBUG_DIR, `${requestId}-response.json`);
      await fs.writeFile(
        responsePath,
        JSON.stringify({ meta, result, rawText }, null, 2),
      );
    } catch (e) {
      console.error(`[WATCH] [${requestId}] Failed to write debug files:`, e);
    }

    const latencyMs = performance.now() - startTime;
    // Cast extended meta (includes preprocessMs, agentMs and sizes) to the expected meta type.
    // We still keep the HTTP response shape stable for clients, but include diagnostics in debug files.
    return createSuccessResponse(requestId, result, {
      latencyMs,
      preprocessMs,
      agentMs,
      processedSize,
      originalSize,
    } as unknown as Parameters<typeof createSuccessResponse>[2]);
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
