import path from "node:path";

export function statePath(cacheDir: string): string {
  return path.join(cacheDir, "state.json");
}

export function manifestPath(cacheDir: string): string {
  return path.join(cacheDir, "frames.json");
}

export function resultsDir(cacheDir: string): string {
  return path.join(cacheDir, "frame-results");
}

export function framesDir(cacheDir: string): string {
  return path.join(cacheDir, "frames");
}

export function summaryPath(cacheDir: string): string {
  return path.join(cacheDir, "summary.json");
}

export function timelinePath(cacheDir: string): string {
  return path.join(cacheDir, "timeline.txt");
}

export function versionPath(cacheDir: string): string {
  return path.join(cacheDir, "processing-version.txt");
}

export function videoPath(cacheDir: string, sourceFileName: string): string {
  const ext = path.extname(sourceFileName || "video.bin") || ".bin";
  return path.join(cacheDir, `source${ext}`);
}
