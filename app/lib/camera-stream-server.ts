import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ServerCameraSourceKind =
  | "device"
  | "rtsp"
  | "http"
  | "https"
  | "file"
  | "unknown";

export interface ServerCameraSourceDescriptor {
  readonly kind: ServerCameraSourceKind;
  readonly rawSource: string;
  readonly normalizedSource: string;
  readonly filePath: string | null;
  readonly isLocalFile: boolean;
  readonly isRelayRequired: boolean;
  readonly isDirectBrowserPlayable: boolean;
  readonly isLikelyVideoFile: boolean;
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function isUncPath(value: string): boolean {
  return /^\\\\/.test(value);
}

function isHttpSource(value: string): boolean {
  return /^http:\/\//i.test(value);
}

function isHttpsSource(value: string): boolean {
  return /^https:\/\//i.test(value);
}

function isRtspSource(value: string): boolean {
  return /^rtsp:\/\//i.test(value);
}

function isFileUrlSource(value: string): boolean {
  return /^file:\/\//i.test(value);
}

function isLikelyLocalPath(value: string): boolean {
  return (
    isWindowsAbsolutePath(value) ||
    isUncPath(value) ||
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../")
  );
}

function isLikelyVideoFileSource(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.endsWith(".mp4") ||
    lower.endsWith(".webm") ||
    lower.endsWith(".ogg") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".m4v") ||
    lower.endsWith(".m3u8") ||
    lower.endsWith(".avi") ||
    lower.endsWith(".mkv")
  );
}

export function normalizeCameraSourceValue(
  value: string | null | undefined,
): string {
  const normalized = stripWrappingQuotes(value ?? "");

  if (!normalized) {
    throw new Error("Missing required camera source.");
  }

  return normalized;
}

export function normalizeCameraSourceQueryValue(
  value: string | null | undefined,
): string {
  try {
    return normalizeCameraSourceValue(value);
  } catch {
    throw new Error("Missing required 'source' query parameter.");
  }
}

export function getServerCameraSourceKind(
  source: string,
): ServerCameraSourceKind {
  const normalized = normalizeCameraSourceValue(source);
  const lower = normalized.toLowerCase();

  if (lower.startsWith("device://")) return "device";
  if (isRtspSource(lower)) return "rtsp";
  if (isHttpsSource(lower)) return "https";
  if (isHttpSource(lower)) return "http";
  if (isFileUrlSource(lower) || isLikelyLocalPath(normalized)) return "file";

  return "unknown";
}

export function tryResolveLocalFilePath(source: string): string | null {
  const normalized = normalizeCameraSourceValue(source);

  if (isFileUrlSource(normalized)) {
    try {
      return fileURLToPath(normalized);
    } catch {
      return null;
    }
  }

  if (isLikelyLocalPath(normalized)) {
    return resolve(normalized);
  }

  return null;
}

export function describeServerCameraSource(
  source: string,
): ServerCameraSourceDescriptor {
  const normalizedSource = normalizeCameraSourceValue(source);
  const kind = getServerCameraSourceKind(normalizedSource);
  const isLikelyVideoFile = isLikelyVideoFileSource(normalizedSource);
  const filePath =
    kind === "file" ? tryResolveLocalFilePath(normalizedSource) : null;
  const isDirectBrowserPlayable =
    kind === "device" ||
    ((kind === "http" || kind === "https") && isLikelyVideoFile);

  return {
    kind,
    rawSource: source,
    normalizedSource,
    filePath,
    isLocalFile: kind === "file",
    isRelayRequired:
      kind === "rtsp" ||
      kind === "file" ||
      ((kind === "http" || kind === "https") && !isDirectBrowserPlayable),
    isDirectBrowserPlayable,
    isLikelyVideoFile,
  };
}

export async function resolveAccessibleCameraSource(
  source: string,
): Promise<ServerCameraSourceDescriptor> {
  const descriptor = describeServerCameraSource(source);

  if (descriptor.kind === "unknown") {
    throw new Error(
      "Unsupported source. Use a device:// identifier, rtsp:// URL, http(s):// URL, file:// URL, or a local filesystem path.",
    );
  }

  if (descriptor.kind !== "file") {
    return descriptor;
  }

  if (!descriptor.filePath) {
    throw new Error("The specified local file source could not be resolved.");
  }

  try {
    await access(descriptor.filePath);
  } catch {
    throw new Error("The specified local file path could not be accessed.");
  }

  return {
    ...descriptor,
    normalizedSource: descriptor.filePath,
    filePath: descriptor.filePath,
  };
}

export async function resolveAccessibleCameraSourceFromQuery(
  value: string | null | undefined,
): Promise<ServerCameraSourceDescriptor> {
  const source = normalizeCameraSourceQueryValue(value);
  return resolveAccessibleCameraSource(source);
}

export function isServerCameraSourceFileLike(source: string): boolean {
  return getServerCameraSourceKind(source) === "file";
}

export function isServerCameraSourceHttpLike(source: string): boolean {
  const kind = getServerCameraSourceKind(source);
  return kind === "http" || kind === "https";
}

export function isServerCameraSourceRtsp(source: string): boolean {
  return getServerCameraSourceKind(source) === "rtsp";
}
