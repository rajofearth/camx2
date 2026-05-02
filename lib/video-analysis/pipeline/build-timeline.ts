import { randomUUID } from "node:crypto";
import type {
  VideoAnalysisFrameArtifact,
  VideoAnalysisTimelineEntry,
} from "@/types/video-analysis";
import { dedupeStrings, tokenSimilarity } from "../utils/text";

function timelineSummary(frame: VideoAnalysisFrameArtifact): string {
  const eventText = frame.events.join("; ");
  return eventText.length > 0 ? eventText : frame.sceneSummary;
}

function mergeable(
  left: VideoAnalysisFrameArtifact,
  right: VideoAnalysisFrameArtifact,
): boolean {
  return tokenSimilarity(timelineSummary(left), timelineSummary(right)) >= 0.72;
}

export function buildTimeline(
  frames: readonly VideoAnalysisFrameArtifact[],
): VideoAnalysisTimelineEntry[] {
  const timeline: VideoAnalysisTimelineEntry[] = [];
  let cursor = 0;

  while (cursor < frames.length) {
    const start = frames[cursor];
    let endIndex = cursor;
    while (
      endIndex + 1 < frames.length &&
      mergeable(frames[endIndex], frames[endIndex + 1])
    ) {
      endIndex += 1;
    }

    const segment = frames.slice(cursor, endIndex + 1);
    const end = segment[segment.length - 1];
    timeline.push({
      id: randomUUID(),
      startFrameIndex: start.frameIndex,
      endFrameIndex: end.frameIndex,
      startTimestampMs: start.timestampMs,
      endTimestampMs: end.timestampMs,
      startTimestampLabel: start.timestampLabel,
      endTimestampLabel: end.timestampLabel,
      summary: timelineSummary(start),
      visibleObjects: dedupeStrings(
        segment.flatMap((frame) => frame.visibleObjects),
        16,
      ),
      events: dedupeStrings(
        segment.flatMap((frame) => frame.events),
        16,
      ),
      continuityNotes: dedupeStrings(
        segment.flatMap((frame) => frame.continuityNotes),
        12,
      ),
    });
    cursor = endIndex + 1;
  }

  return timeline;
}
