"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type React from "react";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  askVideoAnalysisQuestion,
  clearVideoAnalysisJob,
  createVideoAnalysisJob,
  fetchVideoAnalysisJob,
  type VideoAnalysisUiPhase,
} from "@/app/lib/video-analysis-client";
import type {
  VideoAnalysisChatMessage,
  VideoAnalysisJob,
} from "@/types/video-analysis";

export type AnalysisChatMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly isThinking?: boolean;
};

type PersistedAnalysisSession = {
  readonly jobId: string;
  readonly fingerprint: string;
  readonly sourceFileName: string;
};

type AnalysisSessionContextValue = {
  readonly activeJobId: string | null;
  readonly clientFingerprint: string | null;
  readonly error: string | null;
  readonly etaLabel: string | null;
  readonly isAnalyzing: boolean;
  readonly isCacheActionPending: boolean;
  readonly isHydrated: boolean;
  readonly isReplyProcessing: boolean;
  readonly isVideoReady: boolean;
  readonly job: VideoAnalysisJob | null;
  readonly messages: readonly AnalysisChatMessage[];
  readonly phaseLabel: string;
  readonly selectedVideo: File | null;
  readonly selectedVideoName: string;
  readonly selectedVideoUrl: string | null;
  readonly totalFrames: number;
  readonly analyzedFrames: number;
  readonly uploadPhase: VideoAnalysisUiPhase;
  readonly attachVideo: (
    file: File,
    options?: { readonly forceFresh?: boolean },
  ) => Promise<void>;
  readonly buildHref: (pathname: string) => string;
  readonly clearCache: () => Promise<void>;
  readonly clearError: () => void;
  readonly clearMessages: () => void;
  readonly refreshJob: () => Promise<void>;
  readonly runFreshAnalysis: () => Promise<void>;
  readonly sendMessage: (question: string) => Promise<void>;
};

const LOCAL_CACHE_PREFIX = "video-analysis:fingerprint:";
const PERSISTED_SESSION_KEY = "video-analysis:analysis-session";

const AnalysisSessionContext =
  createContext<AnalysisSessionContextValue | null>(null);

function getPhaseLabel(
  job: VideoAnalysisJob | null,
  uploadPhase: VideoAnalysisUiPhase,
): string {
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
    return `${job.progress.completedFrames}/${job.progress.totalFrames} frames analyzed`;
  }
  if (job.status === "summarizing") {
    return "Summarizing timeline...";
  }
  if (job.status === "completed") {
    return "Ready to chat";
  }
  if (job.status === "error") {
    return "Analysis failed";
  }
  return "Preparing analysis...";
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

async function hashFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function parsePersistedSession(
  rawValue: string | null,
): PersistedAnalysisSession | null {
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedAnalysisSession>;
    if (
      typeof parsed.jobId === "string" &&
      typeof parsed.fingerprint === "string" &&
      typeof parsed.sourceFileName === "string"
    ) {
      return {
        jobId: parsed.jobId,
        fingerprint: parsed.fingerprint,
        sourceFileName: parsed.sourceFileName,
      };
    }
  } catch {}
  return null;
}

export function AnalysisSessionProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<AnalysisChatMessage[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [job, setJob] = useState<VideoAnalysisJob | null>(null);
  const [uploadPhase, setUploadPhase] = useState<VideoAnalysisUiPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isReplyProcessing, setIsReplyProcessing] = useState(false);
  const [isCacheActionPending, setIsCacheActionPending] = useState(false);
  const [clientFingerprint, setClientFingerprint] = useState<string | null>(
    null,
  );
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(
    null,
  );
  const [isHydrated, setIsHydrated] = useState(false);

  const restoreAttemptedRef = useRef<string | null>(null);
  const analyzedFrames = job?.progress.completedFrames ?? 0;
  const totalFrames = job?.progress.totalFrames ?? 0;
  const etaSeconds =
    job?.status === "analyzing" &&
    analysisStartedAt !== null &&
    analyzedFrames > 0 &&
    totalFrames > analyzedFrames
      ? ((Date.now() - analysisStartedAt) / 1000 / analyzedFrames) *
        (totalFrames - analyzedFrames)
      : null;
  const etaLabel = formatEtaLabel(etaSeconds);
  const isVideoReady = job?.status === "completed";
  const isAnalyzing =
    uploadPhase === "checking_cache" ||
    uploadPhase === "uploading" ||
    (!!job && job.status !== "completed" && job.status !== "error");
  const phaseLabel = getPhaseLabel(job, uploadPhase);
  const activeJobId = job?.jobId ?? null;
  const selectedVideoName = selectedVideo?.name ?? job?.sourceFileName ?? "";

  useEffect(() => {
    if (!selectedVideo) {
      setSelectedVideoUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return null;
      });
      return;
    }

    const nextUrl = URL.createObjectURL(selectedVideo);
    setSelectedVideoUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return nextUrl;
    });

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [selectedVideo]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

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
      const next = await fetchVideoAnalysisJob(job.jobId);
      if (next.ok) {
        startTransition(() => {
          setJob(next);
          setUploadPhase(next.status);
          setError(next.error ?? null);
        });
        if (clientFingerprint) {
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

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    if (!job?.jobId || !clientFingerprint) {
      window.localStorage.removeItem(PERSISTED_SESSION_KEY);
      return;
    }
    window.localStorage.setItem(
      PERSISTED_SESSION_KEY,
      JSON.stringify({
        jobId: job.jobId,
        fingerprint: clientFingerprint,
        sourceFileName: job.sourceFileName,
      } satisfies PersistedAnalysisSession),
    );
  }, [clientFingerprint, isHydrated, job]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    const nextJobId = job?.jobId ?? null;
    const currentJobId = searchParams.get("jobId");
    if (nextJobId === currentJobId) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextJobId) {
      nextParams.set("jobId", nextJobId);
    } else {
      nextParams.delete("jobId");
    }
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [isHydrated, job?.jobId, pathname, router, searchParams]);

  useEffect(() => {
    if (!isHydrated || job) {
      return;
    }
    const persisted = parsePersistedSession(
      window.localStorage.getItem(PERSISTED_SESSION_KEY),
    );
    const targetJobId = searchParams.get("jobId") ?? persisted?.jobId ?? null;
    if (!targetJobId || restoreAttemptedRef.current === targetJobId) {
      return;
    }
    restoreAttemptedRef.current = targetJobId;
    if (persisted?.fingerprint) {
      setClientFingerprint(persisted.fingerprint);
    }
    void (async () => {
      const restored = await fetchVideoAnalysisJob(targetJobId);
      if (!restored.ok) {
        setError(restored.message);
        setUploadPhase("error");
        return;
      }
      setJob(restored);
      setUploadPhase(restored.status);
      setError(restored.error ?? null);
    })();
  }, [isHydrated, job, searchParams]);

  const clearLocalCacheEntry = useCallback((fingerprint: string | null) => {
    if (!fingerprint) {
      return;
    }
    window.localStorage.removeItem(`${LOCAL_CACHE_PREFIX}${fingerprint}`);
  }, []);

  const resetSession = useCallback(
    ({
      keepSelectedVideo = false,
    }: {
      readonly keepSelectedVideo?: boolean;
    } = {}) => {
      setJob(null);
      setMessages([]);
      setError(null);
      setUploadPhase("idle");
      setAnalysisStartedAt(null);
      setIsReplyProcessing(false);
      if (!keepSelectedVideo) {
        setSelectedVideo(null);
      }
    },
    [],
  );

  const uploadSelectedVideo = useCallback(
    async (
      file: File,
      fingerprint: string,
      options?: { readonly forceRefresh?: boolean },
    ) => {
      setUploadPhase("uploading");
      const uploaded = await createVideoAnalysisJob(file, fingerprint, options);
      if (!uploaded.ok) {
        setError(uploaded.message);
        setUploadPhase("error");
        return;
      }

      setJob(uploaded);
      setUploadPhase(uploaded.status);
      setError(uploaded.error ?? null);
      window.localStorage.setItem(
        `${LOCAL_CACHE_PREFIX}${fingerprint}`,
        uploaded.jobId,
      );
    },
    [],
  );

  const attachVideo = useCallback(
    async (file: File, options?: { readonly forceFresh?: boolean }) => {
      setSelectedVideo(file);
      setJob(null);
      setMessages([]);
      setError(null);
      setUploadPhase("checking_cache");
      setAnalysisStartedAt(null);
      setIsReplyProcessing(false);

      try {
        const fingerprint = await hashFileSha256(file);
        setClientFingerprint(fingerprint);
        await uploadSelectedVideo(file, fingerprint, {
          forceRefresh: options?.forceFresh,
        });
      } catch (uploadError) {
        const message =
          uploadError instanceof Error ? uploadError.message : "Upload failed";
        setError(message);
        setUploadPhase("error");
      }
    },
    [uploadSelectedVideo],
  );

  const clearCache = useCallback(async () => {
    if (!job?.jobId) {
      return;
    }
    setIsCacheActionPending(true);
    try {
      const response = await clearVideoAnalysisJob(job.jobId);
      if (response.ok !== true) {
        setError(response.message);
        return;
      }
      clearLocalCacheEntry(response.fingerprint);
      window.localStorage.removeItem(PERSISTED_SESSION_KEY);
      resetSession({ keepSelectedVideo: true });
    } catch (cacheError) {
      setError(
        cacheError instanceof Error
          ? cacheError.message
          : "Failed to clear cache",
      );
    } finally {
      setIsCacheActionPending(false);
    }
  }, [clearLocalCacheEntry, job?.jobId, resetSession]);

  const runFreshAnalysis = useCallback(async () => {
    if (!selectedVideo) {
      return;
    }
    setIsCacheActionPending(true);
    try {
      const fingerprint =
        clientFingerprint ?? (await hashFileSha256(selectedVideo));
      setClientFingerprint(fingerprint);
      clearLocalCacheEntry(fingerprint);
      window.localStorage.removeItem(PERSISTED_SESSION_KEY);
      resetSession({ keepSelectedVideo: true });
      await uploadSelectedVideo(selectedVideo, fingerprint, {
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
  }, [
    clearLocalCacheEntry,
    clientFingerprint,
    resetSession,
    selectedVideo,
    uploadSelectedVideo,
  ]);

  const refreshJob = useCallback(async () => {
    if (!job?.jobId) {
      return;
    }
    const next = await fetchVideoAnalysisJob(job.jobId);
    if (!next.ok) {
      setError(next.message);
      setUploadPhase("error");
      return;
    }
    setJob(next);
    setUploadPhase(next.status);
    setError(next.error ?? null);
  }, [job?.jobId]);

  const sendMessage = useCallback(
    async (question: string) => {
      const trimmedQuestion = question.trim();
      if (!trimmedQuestion || !isVideoReady || !job || isReplyProcessing) {
        return;
      }

      const timestamp = Date.now();
      const userMessage: AnalysisChatMessage = {
        id: `${timestamp}`,
        role: "user",
        content: trimmedQuestion,
      };
      const thinkingMessage: AnalysisChatMessage = {
        id: `${timestamp + 1}`,
        role: "assistant",
        content: "",
        isThinking: true,
      };

      setMessages((current) => [...current, userMessage, thinkingMessage]);
      setIsReplyProcessing(true);

      try {
        const conversation: VideoAnalysisChatMessage[] = [
          ...messages
            .filter((message) => !message.isThinking)
            .map(({ content, role }) => ({ content, role })),
          {
            role: userMessage.role,
            content: userMessage.content,
          },
        ];
        const response = await askVideoAnalysisQuestion({
          jobId: job.jobId,
          question: trimmedQuestion,
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
    },
    [isReplyProcessing, isVideoReady, job, messages],
  );

  const buildHref = useCallback(
    (targetPathname: string) => {
      const jobId = job?.jobId ?? searchParams.get("jobId");
      if (!jobId) {
        return targetPathname;
      }
      const params = new URLSearchParams();
      params.set("jobId", jobId);
      return `${targetPathname}?${params.toString()}`;
    },
    [job?.jobId, searchParams],
  );

  const value = useMemo<AnalysisSessionContextValue>(
    () => ({
      activeJobId,
      analyzedFrames,
      attachVideo,
      buildHref,
      clearCache,
      clearError: () => setError(null),
      clearMessages: () => setMessages([]),
      clientFingerprint,
      error,
      etaLabel,
      isAnalyzing,
      isCacheActionPending,
      isHydrated,
      isReplyProcessing,
      isVideoReady: !!isVideoReady,
      job,
      messages,
      phaseLabel,
      refreshJob,
      runFreshAnalysis,
      selectedVideo,
      selectedVideoName,
      selectedVideoUrl,
      sendMessage,
      totalFrames,
      uploadPhase,
    }),
    [
      activeJobId,
      analyzedFrames,
      attachVideo,
      buildHref,
      clearCache,
      clientFingerprint,
      error,
      etaLabel,
      isAnalyzing,
      isCacheActionPending,
      isHydrated,
      isReplyProcessing,
      isVideoReady,
      job,
      messages,
      phaseLabel,
      refreshJob,
      runFreshAnalysis,
      selectedVideo,
      selectedVideoName,
      selectedVideoUrl,
      sendMessage,
      totalFrames,
      uploadPhase,
    ],
  );

  return (
    <AnalysisSessionContext.Provider value={value}>
      {children}
    </AnalysisSessionContext.Provider>
  );
}

export function useAnalysisSession(): AnalysisSessionContextValue {
  const value = useContext(AnalysisSessionContext);
  if (!value) {
    throw new Error(
      "useAnalysisSession must be used inside AnalysisSessionProvider",
    );
  }
  return value;
}
