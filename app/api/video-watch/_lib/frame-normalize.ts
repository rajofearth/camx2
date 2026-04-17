import type { VideoWatchFrameResult } from "@/app/lib/video-watch-types";
import {
  isSceneUnchangedAnalysis,
  MAX_OBJECT_ID_ENTRIES,
  MAX_VISIBLE_OBJECTS,
} from "./config";
import {
  parseNarrativeAnalysisFromResponseRaw,
  parseTrackingObjectsFromResponseRaw,
} from "./frame-llm-parse";
import {
  applyAuthoritativePriorFields,
  frameAnalysisFromTrackedObjects,
  isPlaceholderFrameAnalysis,
  normalizeNarrativePayload,
  PRIOR_FRAME_SENTINEL,
  sanitizePriorFrameAnalysis,
  sanitizeStringList,
  sanitizeStringRecord,
} from "./prior-frame";
import { trimNarrativeText } from "./text-utils";

export function normalizeFrameResult(
  result: VideoWatchFrameResult,
): VideoWatchFrameResult {
  const legacy = result as unknown as Record<string, unknown>;

  if (result.llm) {
    let frameAnalysis = result.frameAnalysis;
    try {
      frameAnalysis = parseNarrativeAnalysisFromResponseRaw(
        result.llm.narrative.responseRaw,
      );
    } catch {}
    let objects: Record<string, string>;
    try {
      objects = parseTrackingObjectsFromResponseRaw(
        result.llm.tracking.responseRaw,
      );
    } catch {
      objects = sanitizeStringRecord(
        result.objects ?? legacy.objects,
        MAX_OBJECT_ID_ENTRIES,
      );
    }
    return {
      ...result,
      frameAnalysis,
      priorFrameAnalysis: sanitizePriorFrameAnalysis(result.priorFrameAnalysis),
      priorVisibleObjects: sanitizeStringList(
        result.priorVisibleObjects ?? legacy.visibleObjects,
        MAX_VISIBLE_OBJECTS,
      ),
      objects,
      error: result.error ?? null,
      priorFieldsOrigin: result.priorFieldsOrigin ?? "server",
    };
  }

  // Back-compat branch for legacy results without llm metadata
  const objects = sanitizeStringRecord(
    result.objects ?? legacy.objects,
    MAX_OBJECT_ID_ENTRIES,
  );
  const payload = normalizeNarrativePayload({
    analysis: result.frameAnalysis,
    frameAnalysis: result.frameAnalysis,
    summaryText: legacy.summaryText,
    description: legacy.description,
    objects,
  });

  let frameAnalysis = payload;
  // If not a substantive analysis, but contains objects, build string from objects
  if (
    !isSceneUnchangedAnalysis(frameAnalysis) &&
    isPlaceholderFrameAnalysis(frameAnalysis)
  ) {
    const fromObjects = frameAnalysisFromTrackedObjects(objects);
    if (fromObjects) frameAnalysis = trimNarrativeText(fromObjects);
  }

  return {
    ...result,
    frameAnalysis,
    priorFrameAnalysis: sanitizePriorFrameAnalysis(result.priorFrameAnalysis),
    priorVisibleObjects: sanitizeStringList(
      result.priorVisibleObjects ?? legacy.visibleObjects,
      MAX_VISIBLE_OBJECTS,
    ),
    objects,
    error: result.error ?? null,
  };
}

export function repairOrderedResultsPriorFields(
  ordered: readonly VideoWatchFrameResult[],
): VideoWatchFrameResult[] {
  return ordered.map((frame, index) => {
    if (index === 0) {
      return {
        ...frame,
        priorFrameAnalysis: PRIOR_FRAME_SENTINEL,
        priorVisibleObjects: [],
        priorFieldsOrigin: "server",
      };
    }
    const prev = ordered[index - 1];
    if (!prev) return frame;
    const fixed = applyAuthoritativePriorFields(
      prev,
      frame.priorVisibleObjects,
    );
    return {
      ...frame,
      priorFrameAnalysis: fixed.priorFrameAnalysis,
      priorVisibleObjects: fixed.priorVisibleObjects,
      priorFieldsOrigin: "server",
    };
  });
}
