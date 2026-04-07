"use client";

import {
  ArrowUp,
  FileText,
  Film,
  Image as ImageIcon,
  Paperclip,
  Square,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteNav } from "./SiteNav";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isThinking?: boolean;
};

type AnalysisPhase =
  | "idle"
  | "preparing"
  | "extracting"
  | "analyzing"
  | "ready";

const TOTAL_ANALYSIS_FRAMES = 12;

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

function getPhaseLabel(
  phase: AnalysisPhase,
  analyzedFrames: number,
  totalFrames: number,
) {
  if (phase === "preparing") {
    return "Preparing video file...";
  }

  if (phase === "extracting") {
    return "Extracting frames...";
  }

  if (phase === "analyzing") {
    return `${analyzedFrames}/${totalFrames} frame analysing`;
  }

  if (phase === "ready") {
    return "Ready to chat";
  }

  return "Upload a video file to begin";
}

export function VideoChatExperience(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isReplyProcessing, setIsReplyProcessing] = useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>("idle");
  const [analyzedFrames, setAnalyzedFrames] = useState(0);

  const hiddenFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;
  const isVideoReady = analysisPhase === "ready";
  const phaseLabel = getPhaseLabel(
    analysisPhase,
    analyzedFrames,
    TOTAL_ANALYSIS_FRAMES,
  );

  const helperText = useMemo(() => {
    if (!selectedVideo) {
      return "Start by attaching a recorded footage file.";
    }

    if (!isVideoReady) {
      return "We are simulating the analysis pipeline before chat unlocks.";
    }

    return `Video loaded: ${selectedVideo.name}`;
  }, [isVideoReady, selectedVideo]);

  useEffect(() => {
    if (!messages.length) return;

    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    void inputValue;
    if (!textareaRef.current) return;

    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      200,
    )}px`;
  }, [inputValue]);

  useEffect(() => {
    if (!selectedVideo) {
      setAnalysisPhase("idle");
      setAnalyzedFrames(0);
      return;
    }

    setAnalysisPhase("preparing");
    setAnalyzedFrames(0);

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let frameInterval: ReturnType<typeof setInterval> | null = null;

    timers.push(
      setTimeout(() => {
        setAnalysisPhase("extracting");
      }, 1100),
    );

    timers.push(
      setTimeout(() => {
        setAnalysisPhase("analyzing");
        frameInterval = setInterval(() => {
          setAnalyzedFrames((current) => {
            const nextValue = current + 1;

            if (nextValue >= TOTAL_ANALYSIS_FRAMES) {
              if (frameInterval) {
                clearInterval(frameInterval);
              }

              setAnalysisPhase("ready");
              return TOTAL_ANALYSIS_FRAMES;
            }

            return nextValue;
          });
        }, 320);
      }, 2400),
    );

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }

      if (frameInterval) {
        clearInterval(frameInterval);
      }
    };
  }, [selectedVideo]);

  const openVideoPicker = () => {
    hiddenFileInputRef.current?.click();
  };

  const handleVideoSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    setSelectedVideo(file);
    setMessages([]);
    setInputValue("");
    setIsReplyProcessing(false);
    setIsAttachmentMenuOpen(false);
    event.target.value = "";
  };

  const handleSend = () => {
    if (!inputValue.trim() || !isVideoReady || isReplyProcessing) {
      return;
    }

    const timestamp = Date.now();
    const userMessage: ChatMessage = {
      id: `${timestamp}`,
      role: "user",
      content: inputValue.trim(),
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
    setIsAttachmentMenuOpen(false);

    window.setTimeout(() => {
      setMessages((current) =>
        current.map((message) =>
          message.id === thinkingMessage.id
            ? {
                ...message,
                isThinking: false,
                content: `Footage chat is ready. This is a placeholder answer for "${userMessage.content}" while backend analysis is still not wired.`,
              }
            : message,
        ),
      );
      setIsReplyProcessing(false);
    }, 1800);
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#000000] text-white antialiased">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 h-[600px] w-[100px] -translate-x-1/2 rounded-full bg-blue-500/10 opacity-50 blur-[120px]" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black via-black/80 to-transparent" />
      </div>

      <div className="relative z-20 px-6 pt-6">
        <SiteNav />
      </div>

      <div className="no-scrollbar relative z-10 flex-1 overflow-y-auto px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col pt-6 pb-40">
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
                    Upload a video first, let the analysis pipeline finish, and
                    then start asking questions about the footage.
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
                  className={`mb-8 flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="max-w-[85%] rounded-[14px] bg-[#121212] px-4 py-2 text-[15px] leading-[1.6] font-medium">
                    {message.isThinking ? (
                      <div className="flex items-center gap-2">
                        <ShimmerLabel active>Thinking...</ShimmerLabel>
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/90 to-transparent" />
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
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/70 to-transparent" />

            <div className="flex flex-col px-0">
              <div className="mb-1 flex min-h-[24px] items-end gap-3 rounded-[16px] border-b border-[#121212] bg-black/80 px-5 py-4">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  disabled={!isVideoReady}
                  placeholder={
                    isVideoReady
                      ? "Ask about the uploaded footage..."
                      : "Upload a video and wait until analysis is ready..."
                  }
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
                      onClick={handleSend}
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
                      className="group flex items-center gap-2 rounded-full px-3 py-1.5 text-neutral-500 transition-all duration-300 hover:bg-white/[0.03] hover:text-neutral-300"
                    >
                      <Paperclip size={14} />
                      <span className="text-[13px] font-medium whitespace-nowrap">
                        Attach
                      </span>
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

                  <motion.div
                    whileTap={{ scale: 0.97 }}
                    className="relative flex items-center gap-2 overflow-hidden rounded-full px-3 py-1.5 text-neutral-500"
                  >
                    <div className="relative flex h-4 items-center overflow-hidden">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={analysisPhase}
                          initial={{ y: 10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -10, opacity: 0 }}
                          className="relative"
                        >
                          <ShimmerLabel active={selectedVideo !== null}>
                            {phaseLabel}
                          </ShimmerLabel>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </motion.div>
                </div>

                <div className="flex items-center gap-2 pr-1">
                  <span className="text-[12px] font-medium tracking-wider text-neutral-700 uppercase select-none">
                    {isVideoReady ? "Footage ready" : "Waiting for video"}
                  </span>
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
        onChange={handleVideoSelection}
      />
    </div>
  );
}

function ShimmerLabel({
  active = false,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  if (!active) {
    return (
      <span className="text-[13px] font-medium whitespace-nowrap text-neutral-500">
        {children}
      </span>
    );
  }

  return (
    <motion.span
      className="bg-clip-text text-[13px] font-semibold whitespace-nowrap text-transparent"
      style={{
        backgroundImage:
          "linear-gradient(90deg, #737373 0%, #737373 40%, #ffffff 50%, #737373 60%, #737373 100%)",
        backgroundSize: "200% 100%",
      }}
      animate={{ backgroundPositionX: ["100%", "-100%"] }}
      transition={{
        repeat: Number.POSITIVE_INFINITY,
        duration: 2,
        ease: "linear",
      }}
    >
      {children}
    </motion.span>
  );
}
