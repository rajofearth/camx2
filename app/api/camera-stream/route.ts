import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";
import type { NextRequest } from "next/server";
import { describeCameraStreamSource } from "@/app/lib/camera-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOUNDARY = "camx2frame";

async function resolveFfmpegPath(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  try {
    const child = spawn("ffmpeg", ["-version"], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error("ffmpeg not available on PATH"));
      });
    });

    return "ffmpeg";
  } catch {
    const packagedPath = typeof ffmpegStatic === "string" ? ffmpegStatic : null;

    if (packagedPath) {
      await access(packagedPath);
      return packagedPath;
    }
  }

  throw new Error(
    'Required executable "ffmpeg" was not found. Install it or set FFMPEG_PATH.',
  );
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

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

async function normalizeSource(rawSource: string | null): Promise<string> {
  const source = stripWrappingQuotes(rawSource?.trim() ?? "");
  if (!source) {
    throw new Error("Missing required 'source' query parameter.");
  }

  const descriptor = describeCameraStreamSource(source);

  if (descriptor.kind === "http" || descriptor.kind === "https") {
    if (!isHttpSource(source)) {
      throw new Error("Unsupported HTTP stream source.");
    }
    return source;
  }

  if (descriptor.kind === "rtsp") {
    if (!isRtspSource(source)) {
      throw new Error("Unsupported RTSP stream source.");
    }
    return source;
  }

  if (descriptor.kind === "file") {
    if (isFileUrlSource(source)) {
      try {
        const filePath = fileURLToPath(source);
        await access(filePath);
        return filePath;
      } catch {
        throw new Error("The specified file:// source could not be resolved.");
      }
    }

    try {
      await access(source);
      return source;
    } catch {
      throw new Error("The specified local file path could not be accessed.");
    }
  }

  throw new Error(
    "Unsupported source. Use an rtsp:// URL, http(s):// URL, file:// URL, or a local filesystem path.",
  );
}

function buildInputArgs(source: string): string[] {
  if (isRtspSource(source)) {
    return [
      "-rtsp_transport",
      "tcp",
      "-fflags",
      "nobuffer",
      "-flags",
      "low_delay",
      "-i",
      source,
    ];
  }

  if (isHttpSource(source)) {
    const isLoopEligibleVideoUrl =
      !source.toLowerCase().includes(".m3u8") &&
      /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(source);

    return [
      ...(isLoopEligibleVideoUrl ? ["-re", "-stream_loop", "-1"] : []),
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_at_eof",
      "1",
      "-i",
      source,
    ];
  }

  return ["-re", "-stream_loop", "-1", "-i", source];
}

function buildFfmpegArgs(source: string): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    ...buildInputArgs(source),
    "-an",
    "-sn",
    "-dn",
    "-map",
    "0:v:0",
    "-vf",
    "fps=24,scale=1280:-1:force_original_aspect_ratio=decrease",
    "-q:v",
    "5",
    "-pix_fmt",
    "yuvj420p",
    "-f",
    "mpjpeg",
    "-boundary_tag",
    BOUNDARY,
    "pipe:1",
  ];
}

function errorResponse(status: number, message: string): Response {
  return Response.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  let source: string;
  let ffmpegPath: string;

  try {
    source = await normalizeSource(req.nextUrl.searchParams.get("source"));
    ffmpegPath = await resolveFfmpegPath();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid stream request";
    return errorResponse(400, message);
  }

  const ffmpegArgs = buildFfmpegArgs(source);

  try {
    const child = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        child.stdout.on("data", (chunk: unknown) => {
          controller.enqueue(
            typeof chunk === "string"
              ? new TextEncoder().encode(chunk)
              : Buffer.isBuffer(chunk)
                ? new Uint8Array(chunk)
                : new TextEncoder().encode(String(chunk)),
          );
        });

        child.stderr.on("data", (chunk: unknown) => {
          stderr +=
            typeof chunk === "string"
              ? chunk
              : Buffer.isBuffer(chunk)
                ? chunk.toString("utf8")
                : String(chunk);
        });

        child.once("error", (error) => {
          controller.error(error);
        });

        child.once("close", (code) => {
          if (code === 0 || code === null) {
            controller.close();
            return;
          }

          controller.error(
            new Error(
              stderr.trim() ||
                "FFmpeg exited before the stream could be relayed.",
            ),
          );
        });
      },
      cancel() {
        if (!child.killed) {
          child.kill("SIGTERM");
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        Connection: "keep-alive",
        "Content-Type": `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start FFmpeg relay";
    return errorResponse(500, message);
  }
}
