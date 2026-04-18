import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const VIDEO_MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
};

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function isHttpSource(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isRtspSource(value: string): boolean {
  return /^rtsp:\/\//i.test(value);
}

function isFileUrlSource(value: string): boolean {
  return /^file:\/\//i.test(value);
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function isUncPath(value: string): boolean {
  return /^\\\\/.test(value);
}

function isLikelyLocalPath(value: string): boolean {
  return (
    isWindowsAbsolutePath(value) ||
    isUncPath(value) ||
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../")
  );
}

async function resolveLocalFilePath(rawSource: string | null): Promise<string> {
  const source = stripWrappingQuotes(rawSource?.trim() ?? "");
  if (!source) {
    throw new Error("Missing required 'source' query parameter.");
  }

  if (isHttpSource(source) || isRtspSource(source)) {
    throw new Error(
      "Unsupported source for camera-file route. Use a local filesystem path or file:// URL.",
    );
  }

  let resolvedPath: string;
  if (isFileUrlSource(source)) {
    try {
      resolvedPath = fileURLToPath(source);
    } catch {
      throw new Error("The specified file:// source could not be resolved.");
    }
  } else if (isLikelyLocalPath(source)) {
    resolvedPath = resolve(source);
  } else {
    throw new Error(
      "Unsupported source. Use a local filesystem path or file:// URL.",
    );
  }

  try {
    await access(resolvedPath);
  } catch {
    throw new Error("The specified local file path could not be accessed.");
  }

  const details = await stat(resolvedPath);
  if (!details.isFile()) {
    throw new Error("The specified source is not a readable file.");
  }

  return resolvedPath;
}

function getMimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  return VIDEO_MIME_TYPES[extension] ?? "application/octet-stream";
}

function parseSingleRangeHeader(
  rangeHeader: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;

  const [, startValue, endValue] = match;

  if (startValue === "" && endValue === "") return null;

  if (startValue === "") {
    const suffixLength = Number.parseInt(endValue, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;

    const start = Math.max(fileSize - suffixLength, 0);
    const end = fileSize - 1;
    if (start > end) return null;

    return { start, end };
  }

  const start = Number.parseInt(startValue, 10);
  if (!Number.isFinite(start) || start < 0 || start >= fileSize) return null;

  const parsedEnd =
    endValue === ""
      ? Math.min(start + DEFAULT_CHUNK_SIZE - 1, fileSize - 1)
      : Number.parseInt(endValue, 10);

  if (!Number.isFinite(parsedEnd) || parsedEnd < start) return null;

  const end = Math.min(parsedEnd, fileSize - 1);
  return { start, end };
}

function jsonError(status: number, message: string): Response {
  return Response.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}

function streamFromNodeReadStream(
  filePath: string,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath, { start, end });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: string | Buffer) => {
        controller.enqueue(
          typeof chunk === "string"
            ? new TextEncoder().encode(chunk)
            : new Uint8Array(chunk),
        );
      });

      nodeStream.once("end", () => {
        controller.close();
      });

      nodeStream.once("error", (error) => {
        controller.error(error);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  let filePath: string;

  try {
    filePath = await resolveLocalFilePath(
      req.nextUrl.searchParams.get("source"),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid local file request.";
    return jsonError(400, message);
  }

  let details;
  try {
    details = await stat(filePath);
  } catch {
    return jsonError(404, "The requested local file could not be read.");
  }

  const fileSize = details.size;
  const mimeType = getMimeType(filePath);
  const rangeHeader = req.headers.get("range");

  const baseHeaders = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Content-Type": mimeType,
    "X-Content-Type-Options": "nosniff",
  });

  if (!rangeHeader) {
    const stream = streamFromNodeReadStream(filePath, 0, fileSize - 1);
    baseHeaders.set("Content-Length", String(fileSize));
    return new Response(stream, {
      status: 200,
      headers: baseHeaders,
    });
  }

  const parsedRange = parseSingleRangeHeader(rangeHeader, fileSize);
  if (!parsedRange) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${fileSize}`,
      },
    });
  }

  const { start, end } = parsedRange;
  const chunkSize = end - start + 1;
  const stream = streamFromNodeReadStream(filePath, start, end);

  baseHeaders.set("Content-Length", String(chunkSize));
  baseHeaders.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);

  return new Response(stream, {
    status: 206,
    headers: baseHeaders,
  });
}
