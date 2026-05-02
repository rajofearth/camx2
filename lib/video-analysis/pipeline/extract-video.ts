import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { makeSquareAndCompressServer } from "@/app/lib/image-utils-server";
import { framesDirPath } from "../storage/paths";
import type { VideoAnalysisStore, VideoFrameManifest } from "../storage/types";
import { mapWithConcurrency } from "../utils/concurrency";
import { toTimestampLabel } from "../utils/time";

const SAMPLE_FPS = 1;
const FRAME_TARGET_SIZE = 160;
const FRAME_COMPRESSION_QUALITY = 0.45;

function packagedPath(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof (value as { path?: unknown }).path === "string"
  ) {
    return (value as { path: string }).path;
  }
  return undefined;
}

async function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} exited with code ${code}: ${stderr.trim() || stdout.trim()}`,
          ),
        );
      }
    });
  });
}

async function resolveExecutablePath(
  command: string,
  explicitPath: string | undefined,
  fallbackPath: string | undefined,
): Promise<string> {
  if (explicitPath) return explicitPath;
  try {
    await runCommand(command, ["-version"]);
    return command;
  } catch {
    if (fallbackPath) {
      await fs.access(fallbackPath);
      return fallbackPath;
    }
  }
  throw new Error(`Required executable "${command}" was not found`);
}

async function probeVideoDimensions(sourcePath: string) {
  const ffprobePath = await resolveExecutablePath(
    "ffprobe",
    process.env.FFPROBE_PATH,
    packagedPath(ffprobeStatic),
  );
  const { stdout } = await runCommand(ffprobePath, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    sourcePath,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
  };
  return {
    width:
      typeof parsed.streams?.[0]?.width === "number"
        ? parsed.streams[0].width
        : null,
    height:
      typeof parsed.streams?.[0]?.height === "number"
        ? parsed.streams[0].height
        : null,
  };
}

export async function extractVideoFrames(input: {
  readonly fingerprint: string;
  readonly sourceFileName: string;
  readonly sourceByteLength: number;
  readonly sourcePath: string;
  readonly store: VideoAnalysisStore;
}): Promise<VideoFrameManifest> {
  const cached = await input.store.readManifest(input.fingerprint);
  if (cached) return cached;

  const frameDir = framesDirPath(input.fingerprint);
  await fs.mkdir(frameDir, { recursive: true });
  const { width, height } = await probeVideoDimensions(input.sourcePath);
  const ffmpegPath = await resolveExecutablePath(
    "ffmpeg",
    process.env.FFMPEG_PATH,
    packagedPath(ffmpegStatic),
  );
  await runCommand(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input.sourcePath,
    "-vf",
    `fps=${SAMPLE_FPS}`,
    path.join(frameDir, "raw-%06d.jpg"),
  ]);

  const rawFrames = (await fs.readdir(frameDir))
    .filter((entry) => entry.startsWith("raw-") && entry.endsWith(".jpg"))
    .sort();

  const frames = await mapWithConcurrency(
    rawFrames,
    6,
    async (entry, index) => {
      const rawPath = path.join(frameDir, entry);
      const targetPath = path.join(
        frameDir,
        `frame-${String(index + 1).padStart(6, "0")}.png`,
      );
      const rawBuffer = await fs.readFile(rawPath);
      const processed = await makeSquareAndCompressServer(rawBuffer, {
        quality: FRAME_COMPRESSION_QUALITY,
        mode: "crop",
        targetSize: FRAME_TARGET_SIZE,
        output: "png",
      });
      await Promise.all([
        fs.writeFile(targetPath, processed),
        fs.rm(rawPath, { force: true }),
      ]);
      const timestampMs = index * 1000;
      return {
        frameIndex: index,
        timestampMs,
        timestampLabel: toTimestampLabel(timestampMs),
        imagePath: targetPath,
        width,
        height,
      };
    },
  );

  const manifest: VideoFrameManifest = {
    fingerprint: input.fingerprint,
    sourceFileName: input.sourceFileName,
    sourceByteLength: input.sourceByteLength,
    videoPath: input.sourcePath,
    frameCount: frames.length,
    createdAt: new Date().toISOString(),
    frames,
  };
  await input.store.saveManifest(manifest);
  return manifest;
}
