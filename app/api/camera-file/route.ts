import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { resolveAccessibleCameraSourceFromQuery } from "@/app/lib/camera-stream-server";

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

function createFileStream(
  filePath: string,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    createReadStream(filePath, { start, end }),
  ) as ReadableStream<Uint8Array>;
}

export async function GET(req: NextRequest): Promise<Response> {
  let filePath: string;

  try {
    const descriptor = await resolveAccessibleCameraSourceFromQuery(
      req.nextUrl.searchParams.get("source"),
    );

    if (descriptor.kind !== "file" || !descriptor.filePath) {
      throw new Error(
        "Unsupported source for camera-file route. Use a local filesystem path or file:// URL.",
      );
    }

    filePath = descriptor.filePath;
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

  if (!details.isFile()) {
    return jsonError(400, "The specified source is not a readable file.");
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
    const stream = createFileStream(filePath, 0, fileSize - 1);
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
  const stream = createFileStream(filePath, start, end);

  baseHeaders.set("Content-Length", String(chunkSize));
  baseHeaders.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);

  return new Response(stream, {
    status: 206,
    headers: baseHeaders,
  });
}
