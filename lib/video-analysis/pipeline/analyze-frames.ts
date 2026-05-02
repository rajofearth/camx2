import type { VideoAnalysisFrameArtifact } from "@/types/video-analysis";
import type { VideoAnalysisProvider } from "../providers/types";
import type { VideoAnalysisStore, VideoFrameManifest } from "../storage/types";
import { mapWithConcurrency } from "../utils/concurrency";

export async function analyzeFrames(input: {
  readonly fingerprint: string;
  readonly manifest: VideoFrameManifest;
  readonly provider: VideoAnalysisProvider;
  readonly store: VideoAnalysisStore;
  readonly concurrency: number;
  readonly onFrameComplete?: (
    completed: number,
    total: number,
  ) => Promise<void> | void;
}): Promise<readonly VideoAnalysisFrameArtifact[]> {
  const cached = await input.store.readFrameArtifacts(input.fingerprint);
  if (cached.length === input.manifest.frameCount && cached.length > 0) {
    return cached;
  }

  const frames = await mapWithConcurrency(
    input.manifest.frames,
    input.concurrency,
    async (frame, index) => {
      const previous = index > 0 ? input.manifest.frames[index - 1] : null;
      const existingFrames =
        index > 0
          ? await input.store.readFrameArtifacts(input.fingerprint)
          : [];
      const previousArtifact = existingFrames.at(-1) ?? null;
      const startedAt = Date.now();
      const analysis = await input.provider.analyzeFrame({
        imagePath: frame.imagePath,
        timestampLabel: frame.timestampLabel,
        previousSummary: previousArtifact?.sceneSummary ?? null,
        recentTimeline: existingFrames
          .slice(-4)
          .map(
            (artifact) =>
              `${artifact.timestampLabel}: ${artifact.sceneSummary}`,
          ),
      });
      const artifact: VideoAnalysisFrameArtifact = {
        frameIndex: frame.frameIndex,
        timestampMs: frame.timestampMs,
        timestampLabel: frame.timestampLabel,
        sceneSummary: analysis.sceneSummary,
        visibleObjects: analysis.visibleObjects,
        events: analysis.events,
        continuityNotes:
          previous === null
            ? analysis.continuityNotes
            : analysis.continuityNotes,
        rawText: analysis.rawText,
        modelKey: analysis.modelKey,
        latencyMs: Date.now() - startedAt,
        imagePath: frame.imagePath,
        width: frame.width,
        height: frame.height,
      };
      await input.store.saveFrameArtifact(input.fingerprint, artifact);
      await input.onFrameComplete?.(index + 1, input.manifest.frameCount);
      return artifact;
    },
  );

  return [...frames].sort((left, right) => left.frameIndex - right.frameIndex);
}
