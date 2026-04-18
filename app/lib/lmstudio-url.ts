/**
 * Normalize user input into an LM Studio SDK–compatible WebSocket base URL.
 * Rejects trailing slashes and credentials in the URL (SDK rules).
 */
export function normalizeLmStudioWsUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("LM Studio base URL is required.");
  }

  let urlString = trimmed;
  if (urlString.startsWith("http://")) {
    urlString = `ws://${urlString.slice("http://".length)}`;
  } else if (urlString.startsWith("https://")) {
    urlString = `wss://${urlString.slice("https://".length)}`;
  }

  if (urlString.endsWith("/")) {
    urlString = urlString.slice(0, -1);
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid LM Studio URL.");
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error('LM Studio URL must use ws:// or wss:// (or http/https — we convert those).');
  }

  if (parsed.search !== "") {
    throw new Error("LM Studio URL must not include query parameters.");
  }

  if (parsed.hash !== "") {
    throw new Error("LM Studio URL must not include a hash fragment.");
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("LM Studio URL must not include username or password.");
  }

  return urlString;
}

/** WebSocket base URL → `http(s)://host:port` origin for LM Studio REST (`/api/v1/...`). */
export function wsUrlToHttpOrigin(wsUrl: string): string {
  const trimmed = wsUrl.trim();
  let httpLike = trimmed;
  if (httpLike.startsWith("ws://")) {
    httpLike = `http://${httpLike.slice("ws://".length)}`;
  } else if (httpLike.startsWith("wss://")) {
    httpLike = `https://${httpLike.slice("wss://".length)}`;
  }
  return new URL(httpLike).origin;
}

export function isLmStudioConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  return (
    lower.includes("econnrefused") ||
    lower.includes("connect") ||
    lower.includes("websocket") ||
    lower.includes("failed to connect") ||
    lower.includes("not running") ||
    lower.includes("unreachable") ||
    lower.includes("network") ||
    lower.includes("etimedout") ||
    lower.includes("ehostunreach")
  );
}

export function formatLmStudioError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
