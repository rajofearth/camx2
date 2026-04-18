import type { WatchResult, WatchVerificationMeta } from "./watch-types";

/**
 * True when the watch model reported harm, a verification pass ran, and the
 * verifier agrees (not overturned, matches prompt when applicable).
 */
export function isVerifiedThreat(
  watchResult: WatchResult | null,
  verification: WatchVerificationMeta | null | undefined,
): boolean {
  if (watchResult?.isHarm !== true || !watchResult.description) return false;
  if (!verification?.applied) return false;
  if (verification.overturned === true) return false;
  if (verification.matchesPrompt === false) return false;
  return true;
}

export interface VerifiedWatchThreatPayload {
  readonly requestId: string;
  readonly cameraLabel: string;
  /** Stable id for threat log rows (card label, e.g. "Camera 1"). */
  readonly cameraId: string;
  readonly watchResult: WatchResult;
  readonly verification: WatchVerificationMeta | null;
  readonly frameSrc: string | null;
  readonly confidence: number;
}
