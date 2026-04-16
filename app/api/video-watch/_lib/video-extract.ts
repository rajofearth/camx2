import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { makeSquareAndCompressServer } from "@/app/lib/image-utils-server";
import { ensureCacheDir, hashBuffer, readJson, writeJson } from "./cache";
import {
  FRAME_COMPRESSION_QUALITY,
  FRAME_TARGET_SIZE,
  SAMPLE_FPS,
} from "./config";
import { framesDir, manifestPath } from "./paths";
import type { PersistedFrameInfo, PersistedManifest } from "./types-internal";

export function toTimestampLabel(timestampMs: number): string {
  const totalMs = Math.max(0, Math.round(timestampMs));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const millis = totalMs % 1_000;
  const base = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${base}`;
  }

  return base;
}

async function resolveExecutablePath(
  preferredCommand: string,
  explicitPath: string | undefined,
  packagedPath: string | null | undefined,
): Promise<string> {
  if (explicitPath) {
    return explicitPath;
  }

  try {
    await runCommand(preferredCommand, ["-version"]);
    return preferredCommand;
  } catch {
    if (packagedPath) {
      try {
        await fs.access(packagedPath);
        return packagedPath;
      } catch {
        // Fall through to the final error.
      }
    }
  }

  throw new Error(
    `Required executable "${preferredCommand}" was not found. Install it or set ${preferredCommand.toUpperCase()}_PATH.`,
  );
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
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${code}: ${stderr.trim() || stdout.trim()}`,
        ),
      );
    });
  });
}

async function probeFrames(sourceVideoPath: string): Promise<{
  width: number | null;
  height: number | null;
}> {
  const ffprobePath = await resolveExecutablePath(
    "ffprobe",
    process.env.FFPROBE_PATH,
    ffprobeStatic.path,
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
    sourceVideoPath,
  ]);

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
  };

  const stream = parsed.streams?.[0];

  return {
    width: typeof stream?.width === "number" ? stream.width : null,
    height: typeof stream?.height === "number" ? stream.height : null,
  };
}

export async function extractFrames(
  fingerprint: string,
  sourceVideoPath: string,
  sourceFileName: string,
  sourceByteLength: number,
): Promise<PersistedManifest> {
  const cacheDir = await ensureCacheDir(fingerprint);
  const manifestFile = manifestPath(cacheDir);
  const existingManifest = await readJson<PersistedManifest>(manifestFile);
  if (existingManifest?.frames?.length) {
    return existingManifest;
  }

  const targetFramesDir = framesDir(cacheDir);
  await fs.mkdir(targetFramesDir, { recursive: true });

  const existingFiles = await fs.readdir(targetFramesDir).catch(() => []);
  await Promise.all(
    existingFiles.map((fileName) =>
      fs.rm(path.join(targetFramesDir, fileName), { force: true }),
    ),
  );

  await probeFrames(sourceVideoPath);

  const ffmpegPath = await resolveExecutablePath(
    "ffmpeg",
    process.env.FFMPEG_PATH,
    ffmpegStatic,
  );

  await runCommand(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sourceVideoPath,
    "-vf",
    `fps=${SAMPLE_FPS}`,
    path.join(targetFramesDir, "frame-%06d.jpg"),
  ]);

  const extractedFrameFileNames = (await fs.readdir(targetFramesDir))
    .filter((fileName) => fileName.toLowerCase().endsWith(".jpg"))
    .sort();

  const frameInfos = await Promise.all(
    extractedFrameFileNames.map(async (fileName, index) => {
      const sourceImagePath = path.join(targetFramesDir, fileName);
      const outputImagePath = path.join(
        targetFramesDir,
        `frame-${String(index + 1).padStart(6, "0")}.png`,
      );
      const sourceBuffer = await fs.readFile(sourceImagePath);
      const processedBuffer = await makeSquareAndCompressServer(sourceBuffer, {
        quality: FRAME_COMPRESSION_QUALITY,
        mode: "crop",
        targetSize: FRAME_TARGET_SIZE,
        output: "png",
      });

      await fs.writeFile(outputImagePath, processedBuffer);
      await fs.rm(sourceImagePath, { force: true });

      const timestampMs = Math.round((index * 1000) / SAMPLE_FPS);

      return {
        frameIndex: index,
        timestampMs,
        timestampLabel: toTimestampLabel(timestampMs),
        imagePath: outputImagePath,
        checksum: await hashBuffer(processedBuffer),
        width: FRAME_TARGET_SIZE,
        height: FRAME_TARGET_SIZE,
      } satisfies PersistedFrameInfo;
    }),
  );

  const manifest: PersistedManifest = {
    videoFingerprint: fingerprint,
    sourceFileName,
    sourceByteLength,
    videoPath: sourceVideoPath,
    frameCount: frameInfos.length,
    frames: frameInfos,
    createdAt: new Date().toISOString(),
  };

  await writeJson(manifestFile, manifest);
  return manifest;
}
