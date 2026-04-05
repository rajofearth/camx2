import type { WatchOk, WatchResponse } from "./watch-types";
import { parseWatchResponse } from "./watch-types";

export interface FetchWatchOptions {
  readonly signal?: AbortSignal;
}

/**
 * Result when the fetch is successful (parsed WatchOk)
 */
export interface FetchWatchResult {
  readonly success: true;
  readonly data: WatchOk;
}

/**
 * Error result
 */
export interface FetchWatchError {
  readonly success: false;
  readonly error: string;
  readonly errorCode?: Extract<WatchResponse, { ok: false }>["errorCode"];
}

export type FetchWatchResultType = FetchWatchResult | FetchWatchError;

/**
 * Send both the original captured frame and the processed frame (smaller) to the server.
 * - `originalBlob` is the raw capture from the camera/input.
 * - `processedBlob` is the (optional) reduced/compressed image you want the server to analyze.
 *
 * The server will save both and can use processedBlob for analysis while keeping original for debugging.
 */
export async function fetchWatch(
  originalBlob: Blob,
  processedBlob?: Blob,
  options?: FetchWatchOptions,
): Promise<FetchWatchResultType> {
  try {
    const formData = new FormData();
    // Attach the original capture for debugging/audit purposes.
    formData.append("original_frame", originalBlob);
    // Attach the processed frame for analysis. If none provided, fall back to original.
    formData.append("frame", processedBlob ?? originalBlob);

    const response = await fetch("/api/watch", {
      method: "POST",
      body: formData,
      signal: options?.signal,
    });

    if (!response.ok && response.status >= 500) {
      return {
        success: false,
        error: `Server error: ${response.status} ${response.statusText}`,
      };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to parse response";
      return {
        success: false,
        error: `Invalid response: ${message}`,
      };
    }

    const parsed = parseWatchResponse(json);
    if (!parsed.ok) {
      return {
        success: false,
        error: parsed.message,
        errorCode: parsed.errorCode,
      };
    }

    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Request cancelled" };
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Network error: ${message}` };
  }
}
