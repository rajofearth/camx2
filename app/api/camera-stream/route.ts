import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import ffmpegStatic from "ffmpeg-static";
import type { NextRequest } from "next/server";
import {
  type ServerCameraSourceDescriptor,
  resolveAccessibleCameraSourceFromQuery,
} from "@/app/lib/camera-stream-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOUNDARY = "camx2frame";
const LOOPABLE_HTTP_VIDEO_PATTERN = /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i;

async function resolveFfmpegPath(): Promise<string> {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }

  try {
    const child = spawn("ffmpeg", ["-version"], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error("ffmpeg not available on PATH"));
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

function isLoopEligibleHttpVideo(source: string): boolean {
  const normalized = source.toLowerCase();
  return (
    !normalized.includes(".m3u8") && LOOPABLE_HTTP_VIDEO_PATTERN.test(source)
  );
}

function buildInputArgs(descriptor: ServerCameraSourceDescriptor): string[] {
  const source = descriptor.normalizedSource;

  switch (descriptor.kind) {
    case "rtsp":
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

    case "http":
    case "https":
      return [
        ...(isLoopEligibleHttpVideo(source)
          ? ["-re", "-stream_loop", "-1"]
          : []),
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_at_eof",
        "1",
        "-i",
        source,
      ];

    case "file":
      return ["-re", "-stream_loop", "-1", "-i", source];

    default:
      throw new Error(
        "Unsupported source. Use an rtsp:// URL, http(s):// URL, file:// URL, or a local filesystem path.",
      );
  }
}

function buildFfmpegArgs(descriptor: ServerCameraSourceDescriptor): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    ...buildInputArgs(descriptor),
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
  let descriptor: ServerCameraSourceDescriptor;
  let ffmpegPath: string;

  try {
    descriptor = await resolveAccessibleCameraSourceFromQuery(
      req.nextUrl.searchParams.get("source"),
    );

    if (descriptor.kind === "device" || descriptor.kind === "unknown") {
      throw new Error(
        "Unsupported source. Use an rtsp:// URL, http(s):// URL, file:// URL, or a local filesystem path.",
      );
    }

    ffmpegPath = await resolveFfmpegPath();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid stream request";
    return errorResponse(400, message);
  }

  const ffmpegArgs = buildFfmpegArgs(descriptor);

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
