import path from "node:path";

export const CACHE_ROOT = path.join(process.cwd(), "tmp", "video-watch-cache");

/** Bump when analysis pipeline or persisted shape changes (invalidates disk cache). */
export const CONFIG_VERSION = "video-watch-v14-llm-trace-faithful-cache";

/** Model returns this when the frame matches the prior situation (no new actions/layout). */
export const SCENE_UNCHANGED_SENTINEL = "[SCENE_UNCHANGED]" as const;

export function isSceneUnchangedAnalysis(text: string): boolean {
  return text.trim() === SCENE_UNCHANGED_SENTINEL;
}

export const SAMPLE_FPS = 1;
export const FRAME_TARGET_SIZE = 160;
export const FRAME_COMPRESSION_QUALITY = 0.45;

export const MAX_VISIBLE_OBJECTS = 6;
export const MAX_OBJECT_ID_ENTRIES = 8;
/** Narrative agent output cap (characters); no short-caption limit. */
export const MAX_NARRATIVE_CHARS = 8000;

export const FRAME_MODEL_KEY =
  process.env.VIDEO_WATCH_FRAME_MODEL_KEY ?? "lfm-ucf-400m";

/** Parallel tracking agent; defaults to the same loaded model as the frame model. */
export const TRACKING_MODEL_KEY =
  process.env.VIDEO_WATCH_TRACKING_MODEL_KEY ?? FRAME_MODEL_KEY;

export const SUMMARY_MODEL_KEY =
  process.env.VIDEO_WATCH_SUMMARY_MODEL_KEY ?? "google/gemma-4-e4b";

export const LMSTUDIO_BASE_URL =
  process.env.LMSTUDIO_BASE_URL ?? "ws://127.0.0.1:1234";

export const CHAT_CONTEXT_BUFFER_TOKENS = 128;
export const CHAT_MAX_RESPONSE_TOKENS =
  Number.parseInt(process.env.VIDEO_WATCH_CHAT_MAX_TOKENS ?? "", 10) || 1536;
export const MIN_CHAT_PROMPT_TOKENS = 512;
export const MIN_TIMELINE_LINE_LIMIT = 6;
export const LIST_TIMELINE_LINE_CAP = 400;
export const MIN_SUMMARY_CHAR_LIMIT = 160;

export const CHAT_STOPWORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "any",
  "are",
  "at",
  "be",
  "can",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
  "you",
]);
