import {
  parseVideoWatchChatResponse,
  parseVideoWatchResponse,
  type VideoWatchChatMessage,
  type VideoWatchChatResponse,
  type VideoWatchResponse,
} from "./video-watch-types";

// Uploads a video file to the backend for processing
export async function uploadVideoForWatch(
  video: File,
  clientFingerprint?: string,
  options?: { readonly forceRefresh?: boolean },
): Promise<VideoWatchResponse> {
  const formData = new FormData();
  formData.append("video", video);
  if (clientFingerprint)
    formData.append("clientFingerprint", clientFingerprint);
  if (options?.forceRefresh) formData.append("forceRefresh", "true");

  const res = await fetch("/api/video-watch", {
    method: "POST",
    body: formData,
  });
  return parseVideoWatchResponse(await res.json());
}

// Clears a cached job/video using jobId or fingerprint
export async function clearVideoWatchCache(input: {
  readonly jobId?: string;
  readonly fingerprint?: string;
}): Promise<
  { ok: true; fingerprint: string } | { ok: false; message: string }
> {
  const params = new URLSearchParams();
  if (input.jobId) params.set("jobId", input.jobId);
  if (input.fingerprint) params.set("fingerprint", input.fingerprint);

  const res = await fetch(`/api/video-watch?${params.toString()}`, {
    method: "DELETE",
  });
  const json = await res.json();
  if (json.ok === true && typeof json.fingerprint === "string") {
    return { ok: true, fingerprint: json.fingerprint };
  }
  return {
    ok: false,
    message:
      typeof json.message === "string" ? json.message : "Failed to clear cache",
  };
}

// Gets the current status/result of a video processing job
export async function fetchVideoWatchStatus(input: {
  readonly jobId?: string;
  readonly fingerprint?: string;
}): Promise<VideoWatchResponse> {
  const params = new URLSearchParams();
  if (input.jobId) params.set("jobId", input.jobId);
  if (input.fingerprint) params.set("fingerprint", input.fingerprint);

  const res = await fetch(`/api/video-watch?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  return parseVideoWatchResponse(await res.json());
}

// Sends a question and optional chat history to the backend for Q&A on the video job
export async function askVideoWatchQuestion(input: {
  readonly jobId: string;
  readonly question: string;
  readonly messages?: readonly VideoWatchChatMessage[];
}): Promise<VideoWatchChatResponse> {
  const res = await fetch("/api/video-watch/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseVideoWatchChatResponse(await res.json());
}
