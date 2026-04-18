export type CameraStreamKind =
  | "device"
  | "rtsp"
  | "http"
  | "https"
  | "file"
  | "unknown";

export interface CameraStreamDescriptor {
  readonly kind: CameraStreamKind;
  readonly rawSource: string;
  readonly normalizedSource: string;
  readonly isRelayRequired: boolean;
  readonly isDirectBrowserPlayable: boolean;
  readonly isLikelyVideoFile: boolean;
  readonly protocolLabel: string;
}

export interface CameraPlaybackDescriptor {
  readonly src: string;
  readonly useVideoElement: boolean;
}

function normalizeSourceValue(value: string): string {
  return value.trim();
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function isUncPath(value: string): boolean {
  return value.startsWith("\\\\");
}

function isLikelyLocalFilePath(value: string): boolean {
  if (isWindowsAbsolutePath(value) || isUncPath(value)) return true;
  if (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../")
  )
    return true;
  return false;
}

function isLikelyVideoFileSource(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.endsWith(".mp4") ||
    lower.endsWith(".webm") ||
    lower.endsWith(".ogg") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".m4v") ||
    lower.endsWith(".m3u8")
  );
}

function getProtocolLabel(kind: CameraStreamKind): string {
  switch (kind) {
    case "device":
      return "DEVICE";
    case "rtsp":
      return "RTSP";
    case "http":
      return "HTTP";
    case "https":
      return "HTTPS";
    case "file":
      return "FILE";
    default:
      return "UNKNOWN";
  }
}

export function describeCameraStreamSource(
  source: string,
): CameraStreamDescriptor {
  const normalizedSource = normalizeSourceValue(source);
  const lower = normalizedSource.toLowerCase();

  let kind: CameraStreamKind = "unknown";

  if (lower.startsWith("device://")) {
    kind = "device";
  } else if (lower.startsWith("rtsp://")) {
    kind = "rtsp";
  } else if (lower.startsWith("https://")) {
    kind = "https";
  } else if (lower.startsWith("http://")) {
    kind = "http";
  } else if (
    lower.startsWith("file://") ||
    isLikelyLocalFilePath(normalizedSource)
  ) {
    kind = "file";
  }

  const isLikelyVideoFile = isLikelyVideoFileSource(normalizedSource);
  const isDirectBrowserPlayable =
    kind === "device" ||
    ((kind === "http" || kind === "https") && isLikelyVideoFile);

  const isRelayRequired =
    kind === "rtsp" ||
    kind === "file" ||
    ((kind === "http" || kind === "https") && !isDirectBrowserPlayable);

  return {
    kind,
    rawSource: source,
    normalizedSource,
    isRelayRequired,
    isDirectBrowserPlayable,
    isLikelyVideoFile,
    protocolLabel: getProtocolLabel(kind),
  };
}

export function isDeviceCameraSource(source: string): boolean {
  return describeCameraStreamSource(source).kind === "device";
}

export function needsCameraStreamRelay(source: string): boolean {
  return describeCameraStreamSource(source).isRelayRequired;
}

export function canPlayCameraStreamDirectly(source: string): boolean {
  return describeCameraStreamSource(source).isDirectBrowserPlayable;
}

export function buildCameraStreamRelayUrl(source: string): string {
  const normalizedSource = normalizeSourceValue(source);
  const params = new URLSearchParams({
    source: normalizedSource,
  });
  return `/api/camera-stream?${params.toString()}`;
}

export function buildCameraFilePlaybackUrl(source: string): string {
  const normalizedSource = normalizeSourceValue(source);
  const params = new URLSearchParams({
    source: normalizedSource,
  });
  return `/api/camera-file?${params.toString()}`;
}

export function buildCameraPlaybackDescriptor(
  source: string,
): CameraPlaybackDescriptor {
  const descriptor = describeCameraStreamSource(source);

  if (descriptor.kind === "file" && descriptor.isLikelyVideoFile) {
    return {
      src: buildCameraFilePlaybackUrl(source),
      useVideoElement: true,
    };
  }

  if (descriptor.isDirectBrowserPlayable) {
    return {
      src: descriptor.normalizedSource,
      useVideoElement: true,
    };
  }

  return {
    src: buildCameraStreamRelayUrl(source),
    useVideoElement: false,
  };
}

export function getCameraStreamDisplayLabel(source: string): string {
  const descriptor = describeCameraStreamSource(source);
  return descriptor.protocolLabel;
}
