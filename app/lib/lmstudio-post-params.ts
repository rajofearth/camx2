import {
  formatLmStudioError,
  normalizeLmStudioWsUrl,
} from "@/app/lib/lmstudio-url";

export interface LmStudioPostParams {
  readonly baseUrl: string;
  readonly apiToken?: string;
}

/** Shared JSON body for `/api/lmstudio/ping` and `/api/lmstudio/models`. */
export function parseLmStudioPostParams(body: {
  readonly baseUrl?: unknown;
  readonly apiToken?: unknown;
}): { ok: true; params: LmStudioPostParams } | { ok: false; error: string } {
  const rawUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
  const apiToken =
    typeof body.apiToken === "string" && body.apiToken.trim().length > 0
      ? body.apiToken.trim()
      : undefined;
  try {
    return {
      ok: true,
      params: { baseUrl: normalizeLmStudioWsUrl(rawUrl), apiToken },
    };
  } catch (error) {
    return { ok: false, error: formatLmStudioError(error) };
  }
}
