import path from "node:path";

const PATHS = {
  state: "state.json",
  manifest: "frames.json",
  resultsDir: "frame-results",
  framesDir: "frames",
  summary: "summary.json",
  timeline: "timeline.txt",
  version: "processing-version.txt",
};

function joinPath(cacheDir: string, subPath: string): string {
  return path.join(cacheDir, subPath);
}

export const statePath = (cacheDir: string) => joinPath(cacheDir, PATHS.state);
export const manifestPath = (cacheDir: string) => joinPath(cacheDir, PATHS.manifest);
export const resultsDir = (cacheDir: string) => joinPath(cacheDir, PATHS.resultsDir);
export const framesDir = (cacheDir: string) => joinPath(cacheDir, PATHS.framesDir);
export const summaryPath = (cacheDir: string) => joinPath(cacheDir, PATHS.summary);
export const timelinePath = (cacheDir: string) => joinPath(cacheDir, PATHS.timeline);
export const versionPath = (cacheDir: string) => joinPath(cacheDir, PATHS.version);

export function videoPath(cacheDir: string, sourceFileName: string): string {
  // Assumes sourceFileName has at least a name, fallback to .bin
  const ext = path.extname(sourceFileName) || ".bin";
  return path.join(cacheDir, `source${ext}`);
}
