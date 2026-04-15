import type {
  FrameAnalysis,
  TrackedObject,
  VideoState,
} from "@/lib/video-analysis/types";

const DEFAULT_MAX_OBJECTS = 24;
const DEFAULT_MAX_EVENTS = 18;
const TRIM_INACTIVE_MS = 5 * 60_000;

function mergeTrackedObject(
  existing: TrackedObject | undefined,
  incoming: TrackedObject,
): TrackedObject {
  if (!existing) {
    return incoming;
  }

  return {
    ...existing,
    label: incoming.label || existing.label,
    confidence: Math.max(existing.confidence, incoming.confidence),
    attributes: [...new Set([...existing.attributes, ...incoming.attributes])],
    lastSeenMs: Math.max(existing.lastSeenMs, incoming.lastSeenMs),
    lastSeenLabel:
      incoming.lastSeenMs >= existing.lastSeenMs
        ? incoming.lastSeenLabel
        : existing.lastSeenLabel,
    status: incoming.status,
  };
}

export class VideoStateService {
  private static readonly instances = new Map<string, VideoStateService>();

  static initialize(videoId: string): VideoStateService {
    const instance = new VideoStateService(videoId);
    VideoStateService.instances.set(videoId, instance);
    return instance;
  }

  static forVideo(videoId: string): VideoStateService {
    return (
      VideoStateService.instances.get(videoId) ??
      VideoStateService.initialize(videoId)
    );
  }

  static clear(videoId: string): void {
    VideoStateService.instances.delete(videoId);
  }

  private state: VideoState;

  private constructor(videoId: string) {
    this.state = {
      videoId,
      rollingSummary: "No video context has been established yet.",
      trackedObjects: [],
      recentEvents: [],
      activeAnomalies: [],
      lastFrameIndex: -1,
      lastTimestampMs: 0,
    };
  }

  getCurrentState(): VideoState {
    return {
      ...this.state,
      trackedObjects: [...this.state.trackedObjects],
      recentEvents: [...this.state.recentEvents],
      activeAnomalies: [...this.state.activeAnomalies],
    };
  }

  updateFromFrame(frame: FrameAnalysis): VideoState {
    const trackedMap = new Map(
      this.state.trackedObjects.map((item) => [item.id, item]),
    );
    for (const object of frame.newOrUpdatedObjects) {
      trackedMap.set(
        object.id,
        mergeTrackedObject(trackedMap.get(object.id), object),
      );
    }

    const recentEvents = [
      ...this.state.recentEvents,
      ...frame.events.map((event) => ({
        ...event,
        timestampMs: frame.timestampMs,
        timestampLabel: frame.timestampLabel,
      })),
    ].slice(-DEFAULT_MAX_EVENTS);

    const activeAnomalies = [
      ...new Set([...this.state.activeAnomalies, ...frame.anomalies]),
    ].slice(-DEFAULT_MAX_EVENTS);

    this.state = {
      videoId: this.state.videoId,
      rollingSummary:
        frame.updatedRollingSummary.trim() || this.state.rollingSummary,
      trackedObjects: [...trackedMap.values()].sort(
        (left, right) => right.lastSeenMs - left.lastSeenMs,
      ),
      recentEvents,
      activeAnomalies,
      lastFrameIndex: frame.frameIndex,
      lastTimestampMs: frame.timestampMs,
    };

    return this.getCurrentState();
  }

  trimOldObjects(maxInactiveMs = TRIM_INACTIVE_MS): VideoState {
    const cutoffMs = Math.max(0, this.state.lastTimestampMs - maxInactiveMs);
    this.state = {
      ...this.state,
      trackedObjects: this.state.trackedObjects
        .filter(
          (object) =>
            object.lastSeenMs >= cutoffMs || object.status === "active",
        )
        .slice(0, DEFAULT_MAX_OBJECTS),
      recentEvents: this.state.recentEvents.slice(-DEFAULT_MAX_EVENTS),
      activeAnomalies: this.state.activeAnomalies.slice(-DEFAULT_MAX_EVENTS),
    };

    return this.getCurrentState();
  }

  getHistoricalSnapshot(): Pick<
    VideoState,
    "rollingSummary" | "trackedObjects" | "recentEvents" | "activeAnomalies"
  > {
    return {
      rollingSummary: this.state.rollingSummary,
      trackedObjects: this.state.trackedObjects.slice(0, DEFAULT_MAX_OBJECTS),
      recentEvents: this.state.recentEvents.slice(-DEFAULT_MAX_EVENTS),
      activeAnomalies: this.state.activeAnomalies.slice(-DEFAULT_MAX_EVENTS),
    };
  }
}
