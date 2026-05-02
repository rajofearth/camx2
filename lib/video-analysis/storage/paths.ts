import path from "node:path";

export const VIDEO_ANALYSIS_ROOT = path.join(
  process.cwd(),
  "tmp",
  "video-analysis",
);

export function jobDir(fingerprint: string): string {
  return path.join(VIDEO_ANALYSIS_ROOT, fingerprint);
}

export function sourceVideoPath(
  fingerprint: string,
  sourceFileName: string,
): string {
  const ext = path.extname(sourceFileName) || ".bin";
  return path.join(jobDir(fingerprint), `source${ext}`);
}

export function stateFilePath(fingerprint: string): string {
  return path.join(jobDir(fingerprint), "job.json");
}

export function manifestFilePath(fingerprint: string): string {
  return path.join(jobDir(fingerprint), "manifest.json");
}

export function summaryFilePath(fingerprint: string): string {
  return path.join(jobDir(fingerprint), "summary.json");
}

export function timelineFilePath(fingerprint: string): string {
  return path.join(jobDir(fingerprint), "timeline.json");
}

export function retrievalDirPath(fingerprint: string): string {
  return path.join(jobDir(fingerprint), "retrieval");
}

export function retrievalChunksFilePath(fingerprint: string): string {
  return path.join(retrievalDirPath(fingerprint), "chunks.json");
}

export function retrievalEntitiesFilePath(fingerprint: string): string {
  return path.join(retrievalDirPath(fingerprint), "entities.json");
}

export function retrievalGraphFilePath(fingerprint: string): string {
  return path.join(retrievalDirPath(fingerprint), "graph.json");
}

export function retrievalQueryCacheFilePath(fingerprint: string): string {
  return path.join(retrievalDirPath(fingerprint), "query-cache.json");
}

export function vectraIndexDirPath(fingerprint: string): string {
  return path.join(jobDir(fingerprint), "vectra");
}

export function framesDirPath(fingerprint: string): string {
  return path.join(jobDir(fingerprint), "frames");
}

export function frameArtifactsDirPath(fingerprint: string): string {
  return path.join(jobDir(fingerprint), "frame-artifacts");
}

export function frameImagePath(
  fingerprint: string,
  frameNumber: number,
): string {
  return path.join(
    framesDirPath(fingerprint),
    `frame-${String(frameNumber).padStart(6, "0")}.png`,
  );
}

export function frameArtifactPath(
  fingerprint: string,
  frameIndex: number,
): string {
  return path.join(
    frameArtifactsDirPath(fingerprint),
    `frame-${String(frameIndex).padStart(6, "0")}.json`,
  );
}
