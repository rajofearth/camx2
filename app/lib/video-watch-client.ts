import {
  parseVideoWatchChatResponse,
  parseVideoWatchResponse,
  type VideoWatchChatMessage,
  type VideoWatchChatResponse,
  type VideoWatchResponse,
} from "./video-watch-types";

export async function uploadVideoForWatch(
  video: File,
  clientFingerprint?: string,
  options?: {
    readonly forceRefresh?: boolean;
  },
): Promise<VideoWatchResponse> {
  const formData = new FormData();
  formData.append("video", video);

  if (clientFingerprint) {
    formData.append("clientFingerprint", clientFingerprint);
  }
  if (options?.forceRefresh) {
    formData.append("forceRefresh", "true");
  }

  const response = await fetch("/api/video-watch", {
    method: "POST",
    body: formData,
  });

  const json = await response.json();
  return parseVideoWatchResponse(json);
}

export async function clearVideoWatchCache(input: {
  readonly jobId?: string;
  readonly fingerprint?: string;
}): Promise<
  { ok: true; fingerprint: string } | { ok: false; message: string }
> {
  const params = new URLSearchParams();

  if (input.jobId) {
    params.set("jobId", input.jobId);
  }
  if (input.fingerprint) {
    params.set("fingerprint", input.fingerprint);
  }

  const response = await fetch(`/api/video-watch?${params.toString()}`, {
    method: "DELETE",
  });

  const json = (await response.json()) as Record<string, unknown>;
  if (json.ok === true && typeof json.fingerprint === "string") {
    return { ok: true, fingerprint: json.fingerprint };
  }

  return {
    ok: false,
    message:
      typeof json.message === "string" ? json.message : "Failed to clear cache",
  };
}

export async function fetchVideoWatchStatus(input: {
  readonly jobId?: string;
  readonly fingerprint?: string;
}): Promise<VideoWatchResponse> {
  const params = new URLSearchParams();

  if (input.jobId) {
    params.set("jobId", input.jobId);
  }
  if (input.fingerprint) {
    params.set("fingerprint", input.fingerprint);
  }

  const response = await fetch(`/api/video-watch?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  const json = await response.json();
  return parseVideoWatchResponse(json);
}

export async function askVideoWatchQuestion(input: {
  readonly jobId: string;
  readonly question: string;
  readonly messages?: readonly VideoWatchChatMessage[];
}): Promise<VideoWatchChatResponse> {
  const response = await fetch("/api/video-watch/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const json = await response.json();
  return parseVideoWatchChatResponse(json);
}
