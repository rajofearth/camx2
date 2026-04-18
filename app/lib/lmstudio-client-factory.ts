import { LMStudioClient } from "@lmstudio/sdk";

/**
 * Construct an {@link LMStudioClient} compatible with `@lmstudio/sdk` 1.5.x: the published
 * package validates constructor options with a strict schema that does **not** accept an
 * `apiToken` field (you get “unrecognized key: apiToken”). Authentication uses
 * `process.env.LM_API_TOKEN` instead, which the SDK reads during construction.
 *
 * When `apiToken` is provided, we set `LM_API_TOKEN` only for the constructor call and restore
 * the previous value afterward so the process env is not permanently mutated.
 */
export function createLmStudioClientForRequest(
  baseUrl: string,
  apiToken?: string,
): LMStudioClient {
  const previousToken = process.env.LM_API_TOKEN;
  const overrideToken =
    apiToken !== undefined && apiToken.trim() !== ""
      ? apiToken.trim()
      : undefined;

  try {
    if (overrideToken !== undefined) {
      process.env.LM_API_TOKEN = overrideToken;
    }

    return new LMStudioClient({
      baseUrl,
      verboseErrorMessages: false,
    });
  } finally {
    if (overrideToken !== undefined) {
      if (previousToken === undefined) {
        delete process.env.LM_API_TOKEN;
      } else {
        process.env.LM_API_TOKEN = previousToken;
      }
    }
  }
}
