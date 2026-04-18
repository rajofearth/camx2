"use client";

import {
  ArrowUp,
  Bug,
  FileText,
  Film,
  Image as ImageIcon,
  Paperclip,
  Square,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { startTransition, useEffect, useRef, useState } from "react";
import {
  askVideoWatchQuestion,
  clearVideoWatchCache,
  fetchVideoWatchStatus,
  uploadVideoForWatch,
} from "@/app/lib/video-watch-client";
import type {
  VideoWatchChatMessage,
  VideoWatchJob,
  VideoWatchPhase,
} from "@/app/lib/video-watch-types";
import GridLoader from "@/components/grid-loader";
import { SiteNav } from "./SiteNav";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isThinking?: boolean;
};

const ATTACHMENT_ITEMS = [
  {
    label: "Video file",
    icon: Film,
    action: "video",
  },
  {
    label: "Snapshots",
    icon: ImageIcon,
    action: "snapshots",
  },
  {
    label: "Notes",
    icon: FileText,
    action: "notes",
  },
] as const;

const LOCAL_CACHE_PREFIX = "video-watch:fingerprint:";

function getPhaseLabel(
  job: VideoWatchJob | null,
  uploadPhase: VideoWatchPhase,
) {
  if (uploadPhase === "checking_cache") {
    return "Checking cache...";
  }

  if (uploadPhase === "uploading") {
    return "Uploading video...";
  }

  if (!job) {
    return "Upload a video file to begin";
  }

  if (job.status === "extracting") {
    return "Extracting frames...";
  }

  if (job.status === "analyzing") {
    return `${job.analyzedFrames}/${job.totalFrames} frames analyzed`;
  }

  if (job.status === "combining") {
    return "Combining timeline...";
  }

  if (job.status === "completed") {
    return "Ready to chat";
  }

  if (job.status === "error") {
    return "Analysis failed";
  }

  return "Preparing analysis...";
}

async function hashFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function formatEtaLabel(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

function getInputPlaceholder(input: {
  readonly hasVideo: boolean;
  readonly isVideoReady: boolean;
  readonly uploadPhase: VideoWatchPhase;
  readonly jobStatus?: VideoWatchPhase;
}): string {
  if (input.isVideoReady) {
    return "Ask about the uploaded footage...";
  }

  if (!input.hasVideo) {
    return "Upload a video and wait until analysis is ready...";
  }

  if (input.uploadPhase === "checking_cache") {
    return "Checking whether this video was already analyzed...";
  }

  if (input.uploadPhase === "uploading") {
    return "Uploading your video for analysis...";
  }

  if (input.jobStatus === "extracting") {
    return "Extracting frames from your uploaded video...";
  }

  if (input.jobStatus === "analyzing") {
    return "Analyzing your uploaded video frames...";
  }

  if (input.jobStatus === "combining") {
    return "Combining frame descriptions into a timeline...";
  }

  if (input.jobStatus === "error") {
    return "Analysis failed. Clear cache or try a fresh run.";
  }

  return "Preparing your uploaded video...";
}

export function VideoChatExperience(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isReplyProcessing, setIsReplyProcessing] = useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [job, setJob] = useState<VideoWatchJob | null>(null);
  const [uploadPhase, setUploadPhase] = useState<VideoWatchPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isCacheActionPending, setIsCacheActionPending] = useState(false);
  const [forceFreshUploads, setForceFreshUploads] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [clientFingerprint, setClientFingerprint] = useState<string | null>(
    null,
  );
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(
    null,
  );

  const hiddenFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;
  const isVideoReady = job?.status === "completed";
  const phaseLabel = getPhaseLabel(job, uploadPhase);
  const hasVideo = !!selectedVideo;
  const isAnalyzing =
    uploadPhase === "checking_cache" ||
    uploadPhase === "uploading" ||
    (!!job && job.status !== "completed" && job.status !== "error");
  const selectedVideoName = selectedVideo?.name ?? "";
  const analyzedFrames = job?.analyzedFrames ?? 0;
  const totalFrames = job?.totalFrames ?? 0;
  const etaSeconds =
    job?.status === "analyzing" &&
    analysisStartedAt !== null &&
    analyzedFrames > 0 &&
    totalFrames > analyzedFrames
      ? ((Date.now() - analysisStartedAt) / 1000 / analyzedFrames) *
        (totalFrames - analyzedFrames)
      : null;
  const etaLabel = formatEtaLabel(etaSeconds);
  const inputPlaceholder = getInputPlaceholder({
    hasVideo,
    isVideoReady: !!isVideoReady,
    uploadPhase,
    jobStatus: job?.status,
  });

  const buttonLabel = !hasVideo
    ? "Attach"
    : isAnalyzing
      ? selectedVideoName.length > 16
        ? `${selectedVideoName.slice(0, 13)}…`
        : selectedVideoName
      : "Replace video";

  const ButtonIcon = !hasVideo ? Paperclip : isAnalyzing ? Film : Paperclip;

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    void inputValue;
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      200,
    )}px`;
  }, [inputValue]);

  useEffect(() => {
    if (job?.status === "analyzing" && analyzedFrames === 0) {
      setAnalysisStartedAt(Date.now());
      return;
    }

    if (job?.status !== "analyzing") {
      setAnalysisStartedAt(null);
    }
  }, [analyzedFrames, job?.status]);

  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "error") {
      return;
    }

    const interval = window.setInterval(async () => {
      const next = await fetchVideoWatchStatus({ jobId: job.jobId });
      if (next.ok) {
        startTransition(() => {
          setJob(next);
          setUploadPhase(next.status);
          setError(next.error ?? null);
        });

        if (next.status === "completed" && clientFingerprint) {
          window.localStorage.setItem(
            `${LOCAL_CACHE_PREFIX}${clientFingerprint}`,
            next.jobId,
          );
        }
      } else {
        startTransition(() => {
          setError(next.message);
          setUploadPhase("error");
        });
      }
    }, 1500);

    return () => {
      window.clearInterval(interval);
    };
  }, [clientFingerprint, job]);

  const openVideoPicker = () => {
    hiddenFileInputRef.current?.click();
  };

  const clearLocalCacheEntry = (fingerprint: string | null) => {
    if (!fingerprint) {
      return;
    }

    window.localStorage.removeItem(`${LOCAL_CACHE_PREFIX}${fingerprint}`);
  };

  const uploadSelectedVideo = async (
    file: File,
    fingerprint: string,
    options?: {
      readonly forceRefresh?: boolean;
    },
  ) => {
    setUploadPhase("uploading");
    const uploaded = await uploadVideoForWatch(file, fingerprint, options);
    if (!uploaded.ok) {
      setError(uploaded.message);
      setUploadPhase("error");
      return;
    }

    setJob(uploaded);
    setUploadPhase(uploaded.status);
    window.localStorage.setItem(
      `${LOCAL_CACHE_PREFIX}${fingerprint}`,
      uploaded.jobId,
    );
  };

  const handleVideoSelection = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    setSelectedVideo(file);
    setJob(null);
    setMessages([]);
    setInputValue("");
    setError(null);
    setUploadPhase("checking_cache");
    setAnalysisStartedAt(null);
    setIsReplyProcessing(false);
    setIsAttachmentMenuOpen(false);

    try {
      const fingerprint = await hashFileSha256(file);
      setClientFingerprint(fingerprint);

      const cachedStatus = await fetchVideoWatchStatus({ fingerprint });
      if (cachedStatus.ok) {
        setJob(cachedStatus);
        setUploadPhase(cachedStatus.status);
        window.localStorage.setItem(
          `${LOCAL_CACHE_PREFIX}${fingerprint}`,
          cachedStatus.jobId,
        );
        return;
      }

      await uploadSelectedVideo(file, fingerprint, {
        forceRefresh: forceFreshUploads,
      });
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : "Upload failed";
      setError(message);
      setUploadPhase("error");
    }
  };

  const handleClearCache = async () => {
    if (!clientFingerprint && !job?.jobId) {
      return;
    }

    setIsCacheActionPending(true);
    try {
      const response = await clearVideoWatchCache({
        fingerprint: clientFingerprint ?? undefined,
        jobId: job?.jobId,
      });

      if (!response.ok) {
        setError(response.message);
        return;
      }

      clearLocalCacheEntry(response.fingerprint);
      setJob(null);
      setMessages([]);
      setError(null);
      setUploadPhase("idle");
      setAnalysisStartedAt(null);
    } catch (cacheError) {
      setError(
        cacheError instanceof Error
          ? cacheError.message
          : "Failed to clear cache",
      );
    } finally {
      setIsCacheActionPending(false);
    }
  };

  const handleFreshRun = async () => {
    if (!selectedVideo || !clientFingerprint) {
      return;
    }

    setIsCacheActionPending(true);
    try {
      clearLocalCacheEntry(clientFingerprint);
      setJob(null);
      setMessages([]);
      setError(null);
      setAnalysisStartedAt(null);
      await uploadSelectedVideo(selectedVideo, clientFingerprint, {
        forceRefresh: true,
      });
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Fresh run failed",
      );
      setUploadPhase("error");
    } finally {
      setIsCacheActionPending(false);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !isVideoReady || !job || isReplyProcessing) {
      return;
    }

    const question = inputValue.trim();
    const timestamp = Date.now();
    const userMessage: ChatMessage = {
      id: `${timestamp}`,
      role: "user",
      content: question,
    };
    const thinkingMessage: ChatMessage = {
      id: `${timestamp + 1}`,
      role: "assistant",
      content: "",
      isThinking: true,
    };

    setMessages((current) => [...current, userMessage, thinkingMessage]);
    setInputValue("");
    setIsReplyProcessing(true);

    try {
      const conversation: VideoWatchChatMessage[] = [
        ...messages
          .filter((message) => !message.isThinking)
          .map(({ content, role }) => ({ content, role })),
        {
          role: userMessage.role,
          content: userMessage.content,
        },
      ];
      const response = await askVideoWatchQuestion({
        jobId: job.jobId,
        question,
        messages: conversation,
      });

      setMessages((current) =>
        current.map((message) =>
          message.id === thinkingMessage.id
            ? {
                ...message,
                isThinking: false,
                content:
                  response.ok === true
                    ? response.answer
                    : `I couldn't answer that yet: ${response.message}`,
              }
            : message,
        ),
      );
    } catch (chatError) {
      const message =
        chatError instanceof Error ? chatError.message : "Chat failed";
      setMessages((current) =>
        current.map((messageItem) =>
          messageItem.id === thinkingMessage.id
            ? {
                ...messageItem,
                isThinking: false,
                content: `I couldn't answer that yet: ${message}`,
              }
            : messageItem,
        ),
      );
    } finally {
      setIsReplyProcessing(false);
    }
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#000000] text-white antialiased">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 h-150 w-25 -translate-x-1/2 rounded-full bg-blue-500/10 opacity-50 blur-[120px]" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-linear-to-t from-black via-black/80 to-transparent" />
      </div>

      <div className="relative z-20 px-6 pt-6">
        <SiteNav />
      </div>

      <div className="no-scrollbar relative z-10 flex-1 overflow-y-auto px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pt-6 pb-40">
          {job?.summary ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-neutral-500">
                <span>Analysis Summary</span>
                <span>
                  {job.cache.cacheHit
                    ? `Cache hit (${job.cache.source})`
                    : "Fresh run"}
                </span>
              </div>
              <p className="text-sm leading-6 text-neutral-300">
                {job.summary.summaryText}
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <AnimatePresence initial={false}>
            {!hasMessages ? (
              <motion.div
                key="hero"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
                className="flex min-h-24 flex-1 flex-col items-center justify-center space-y-5 text-center"
              >
                <div className="space-y-3">
                  <h1 className="text-4xl font-semibold tracking-tight text-white">
                    Chat with recorded footage
                  </h1>
                  <p className="mx-auto max-w-2xl text-sm leading-6 text-neutral-500">
                    Upload a video once, let the frame pipeline build a cached
                    timeline, and then ask questions about the footage.
                  </p>
                </div>
              </motion.div>
            ) : (
              messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
                  className={`mb-4 flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="max-w-[85%] rounded-[14px] bg-[#121212] px-4 py-2 text-[15px] leading-[1.6] font-medium">
                    {message.isThinking ? (
                      <div className="flex items-center gap-2">
                        <GridLoader
                          pattern="frame"
                          mode="stagger"
                          color="white"
                          size="sm"
                          blur={1}
                          gap={1}
                        />
                        <span className="text-sm font-medium text-neutral-300">
                          Thinking...
                        </span>
                      </div>
                    ) : (
                      <div className="text-base whitespace-pre-wrap text-neutral-400">
                        {message.content}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>
      </div>

      <motion.div
        layout
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
        className={`pointer-events-none relative z-20 flex w-full justify-center px-4 pb-8 ${
          hasMessages ? "mt-auto" : "flex-1 items-center pb-64"
        }`}
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-black via-black/90 to-transparent" />
        <motion.div
          layout
          initial={false}
          className="pointer-events-auto relative z-10 w-full max-w-3xl"
        >
          <motion.div
            layout
            initial={false}
            className={`relative flex flex-col rounded-2xl border-[1.2px] shadow-2xl shadow-black/20 backdrop-blur-xl transition-all duration-300 ${
              isInputFocused
                ? "border-white/15 bg-[#121212]"
                : "border-white/8 bg-[#0d0d0d]/95"
            }`}
          >
            <div className="absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-blue-500/70 to-transparent" />

            <div className="flex flex-col px-0">
              <div className="mb-1 flex min-h-6 items-end gap-3 rounded-2xl border-b border-[#121212] bg-black/80 px-5 py-4">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  disabled={!isVideoReady}
                  placeholder={inputPlaceholder}
                  className="flex-1 resize-none overflow-hidden border-none bg-transparent py-1 text-[16px] leading-relaxed font-normal text-neutral-100 outline-none placeholder:text-[#555] disabled:cursor-not-allowed disabled:text-neutral-500"
                  style={{ minHeight: "28px" }}
                />

                <AnimatePresence mode="popLayout" initial={false}>
                  {(inputValue.trim() || isReplyProcessing) && (
                    <motion.button
                      key="send"
                      type="button"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                      onClick={() => {
                        void handleSend();
                      }}
                      disabled={isReplyProcessing || !isVideoReady}
                      className={`mb-1 flex items-center justify-center rounded-full p-1.5 ${
                        isReplyProcessing
                          ? "bg-neutral-800 text-neutral-500"
                          : "bg-white text-black"
                      }`}
                    >
                      {isReplyProcessing ? (
                        <Square size={16} fill="currentColor" />
                      ) : (
                        <ArrowUp size={18} strokeWidth={3} />
                      )}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() =>
                        setIsAttachmentMenuOpen((current) => !current)
                      }
                      className={`group relative flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-sm transition-all duration-300 hover:bg-white/3 hover:text-neutral-300 ${
                        !hasVideo
                          ? "bg-[#0b0b12]/80 text-neutral-500 shadow-[0_0_0_1px_rgba(59,130,246,0.28),inset_0_0.75px_0_rgba(255,255,255,0.06)]"
                          : isAnalyzing
                            ? "bg-[#0e172a]/90 text-blue-200 shadow-[0_0_0_1px_rgba(96,165,250,0.55),inset_0_0.75px_0_rgba(255,255,255,0.1),0_0_8px_rgba(59,130,246,0.2)]"
                            : "bg-[#0b0b12]/80 text-neutral-300 shadow-[0_0_0_1px_rgba(59,130,246,0.32),inset_0_0.75px_0_rgba(255,255,255,0.06)] hover:shadow-[0_0_0_1px_rgba(96,165,250,0.45),inset_0_0.75px_0_rgba(255,255,255,0.08)]"
                      }`}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={buttonLabel}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.18 }}
                          className="flex items-center gap-2"
                        >
                          <ButtonIcon
                            size={14}
                            className={
                              isAnalyzing
                                ? "opacity-100"
                                : "opacity-80 transition-opacity group-hover:opacity-100"
                            }
                          />
                          <span className="font-medium whitespace-nowrap">
                            {buttonLabel}
                          </span>
                        </motion.span>
                      </AnimatePresence>
                    </motion.button>

                    <AnimatePresence>
                      {isAttachmentMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.98 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className="absolute bottom-[calc(100%+12px)] left-0 z-30 w-52 rounded-xl border border-white/10 bg-[#0d0d0d] p-2 shadow-2xl shadow-black/50"
                        >
                          {ATTACHMENT_ITEMS.map(
                            ({ action, icon: Icon, label }) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() => {
                                  if (action === "video") {
                                    openVideoPicker();
                                  } else {
                                    setIsAttachmentMenuOpen(false);
                                  }
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-white/[0.04]"
                              >
                                <Icon size={16} />
                                {label}
                              </button>
                            ),
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <motion.div className="relative flex items-center gap-2 overflow-hidden rounded-full px-3 py-1.5 text-neutral-500">
                    {job?.status === "analyzing" ? (
                      <div className="flex items-center gap-2 text-[13px] font-medium whitespace-nowrap text-neutral-500">
                        <span>Frames</span>
                        <span className="tabular-nums text-neutral-300">
                          {analyzedFrames}
                        </span>
                        <span>/</span>
                        <span className="tabular-nums text-neutral-300">
                          {totalFrames}
                        </span>
                        <span className="text-neutral-600">|</span>
                        <span>ETA</span>
                        <span className="tabular-nums text-neutral-300">
                          {etaLabel ?? "--"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[13px] font-medium whitespace-nowrap text-neutral-500">
                        {phaseLabel}
                      </span>
                    )}
                  </motion.div>
                </div>

                <div className="flex items-center gap-2">
                  {isDebugMode ? (
                    <>
                      <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-neutral-400">
                        <input
                          type="checkbox"
                          checked={forceFreshUploads}
                          onChange={(event) =>
                            setForceFreshUploads(event.target.checked)
                          }
                          className="h-3.5 w-3.5 accent-blue-400"
                        />
                        Fresh upload
                      </label>

                      {clientFingerprint || job?.jobId ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleClearCache();
                          }}
                          disabled={isCacheActionPending}
                          className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-neutral-300 transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Clear cache
                        </button>
                      ) : null}

                      {selectedVideo && clientFingerprint ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleFreshRun();
                          }}
                          disabled={isCacheActionPending}
                          className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-amber-200 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Fresh run
                        </button>
                      ) : null}
                    </>
                  ) : null}

                  {job?.cache.cacheHit ? (
                    <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-blue-200">
                      Cache hit
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>

      <input
        ref={hiddenFileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          void handleVideoSelection(event);
        }}
      />

      <button
        type="button"
        onClick={() => setIsDebugMode((current) => !current)}
        className={`fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.18em] backdrop-blur-sm transition ${
          isDebugMode
            ? "border-amber-400/35 bg-amber-400/12 text-amber-200"
            : "border-white/10 bg-black/55 text-neutral-400 hover:border-white/20 hover:text-neutral-200"
        }`}
      >
        <Bug size={14} />
        {isDebugMode ? "Debug on" : "Debug off"}
      </button>
    </div>
  );
}
