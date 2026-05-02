import type {
  VideoAnalysisResolvedTimeRange,
  VideoAnalysisTimeRangeInput,
} from "@/types/video-analysis";
import { VideoAnalysisError } from "../contracts/error-codes";

const RANGE_PATTERN =
  /\b((?:\d{1,2}:)?\d{2}:\d{2}(?:\.\d{1,3})?)\s*(?:-|to)\s*((?:\d{1,2}:)?\d{2}:\d{2}(?:\.\d{1,3})?)\b/i;

export function parseTimestampToMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const [base, fraction = ""] = trimmed.split(".", 2);
  const parts = base.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length !== 2 && parts.length !== 3) return null;

  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0] ?? 0, parts[1] ?? 0];

  if (minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59 || hours < 0) {
    return null;
  }

  const millis = Number(fraction.padEnd(3, "0").slice(0, 3) || "0");
  if (Number.isNaN(millis) || millis < 0) return null;

  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

export function parseTimeRangeInput(
  input: VideoAnalysisTimeRangeInput,
): VideoAnalysisResolvedTimeRange {
  const startMs = parseTimestampToMs(input.start);
  const endMs = parseTimestampToMs(input.end);
  if (startMs === null || endMs === null) {
    throw new VideoAnalysisError(
      "BAD_REQUEST",
      400,
      "Invalid time range. Use mm:ss or hh:mm:ss.",
    );
  }
  if (endMs < startMs) {
    throw new VideoAnalysisError(
      "BAD_REQUEST",
      400,
      "Time range end must be greater than or equal to start.",
    );
  }
  return { startMs, endMs };
}

export function extractTimeRangeFromQuestion(
  question: string,
): VideoAnalysisResolvedTimeRange | null {
  const match = RANGE_PATTERN.exec(question);
  const startText = match?.[1];
  const endText = match?.[2];
  if (!startText || !endText) {
    return null;
  }

  const startMs = parseTimestampToMs(startText);
  const endMs = parseTimestampToMs(endText);
  if (startMs === null || endMs === null || endMs < startMs) {
    return null;
  }
  return { startMs, endMs };
}

export function resolveTimeRange(
  explicit: VideoAnalysisTimeRangeInput | undefined,
  question: string,
): VideoAnalysisResolvedTimeRange | null {
  if (explicit) {
    return parseTimeRangeInput(explicit);
  }
  return extractTimeRangeFromQuestion(question);
}

export function timeRangeIntersects(
  left: VideoAnalysisResolvedTimeRange,
  right: VideoAnalysisResolvedTimeRange,
): boolean {
  return left.startMs <= right.endMs && right.startMs <= left.endMs;
}
