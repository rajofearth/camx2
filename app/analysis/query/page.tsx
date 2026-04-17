"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useAnalysisSession } from "@/components/analysis/video-watch-session";

// ─── Mock sessions (left sidebar) ────────────────────────────────────────────

const MOCK_SESSIONS = [
  { id: "s1", title: "Anomalies at Bay Entrance", ts: "14:22:05Z", msgCount: 4, active: true, dot: "nominal" },
  { id: "s2", title: "Vehicle Count Analysis", ts: "11:45:12Z", msgCount: 12, active: false, dot: null },
  { id: "s3", title: "Suspicious Behavior Log", ts: "09:12:00Z", msgCount: 2, active: false, dot: null },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalysisQueryPage(): React.JSX.Element {
  const {
    isReplyProcessing,
    isVideoReady,
    job,
    messages,
    selectedVideoName,
    selectedVideoUrl,
    sendMessage,
    clearMessages,
    uploadPhase,
  } = useAnalysisSession();

  const [inputValue, setInputValue] = useState("");
  const [videoExpanded, setVideoExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isReplyProcessing || !isVideoReady) return;
    void sendMessage(trimmed);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const cameraLabel = selectedVideoName
    ? selectedVideoName.replace(/\.[^.]+$/, "").toUpperCase()
    : "CAM_04";

  const systemStatus =
    uploadPhase === "completed" ? "SYS.READY"
    : uploadPhase === "error" ? "SYS.ERROR"
    : uploadPhase === "idle" ? "SYS.IDLE"
    : "SYS.PROCESSING";

  const statusDotClass =
    uploadPhase === "completed" ? "bg-op-nominal"
    : uploadPhase === "error" ? "bg-op-critical"
    : "bg-op-warning";

  const placeholder = isVideoReady
    ? "Query the intelligence layer..."
    : uploadPhase === "idle"
    ? "Upload a video on the Analysis tab first..."
    : "Analysis in progress, please wait...";

  return (
    <div className="flex-1 flex overflow-hidden h-full">

      {/* ── Left Sidebar: Session Management ─────────────── */}
      <aside className="w-72 border-r border-op-border bg-op-surface flex-col h-full shrink-0 hidden lg:flex">

        {/* Header */}
        <div className="p-4 border-b border-op-border flex justify-between items-center bg-op-elevated shrink-0">
          <h2 className="font-mono text-base font-medium text-foreground">
            Active Recording
          </h2>
          <span className="px-2 py-0.5 border border-op-border-active text-op-silver text-[10px] font-mono uppercase tracking-wider">
            {cameraLabel.slice(0, 8)}
          </span>
        </div>

        {/* New Query button */}
        <div className="p-4 border-b border-op-border shrink-0">
          <button
            type="button"
            onClick={clearMessages}
            className="w-full bg-op-elevated border border-op-border hover:border-op-border-active text-op-silver py-2.5 px-4 text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-colors duration-75"
          >
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: '"wght" 300' }}
            >
              add
            </span>
            New Query
          </button>
        </div>

        {/* Recent Sessions */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
          <div className="text-[10px] text-op-text-sec font-mono uppercase tracking-widest mb-3 px-1">
            RECENT SESSIONS
          </div>

          {MOCK_SESSIONS.map((s) => (
            <div
              key={s.id}
              className={`p-3.5 cursor-pointer transition-all duration-75 ${
                s.active
                  ? "bg-op-elevated border border-op-silver hover:border-foreground"
                  : "bg-transparent border border-op-border hover:bg-op-elevated/70 hover:border-op-border-active"
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="font-mono text-[13px] text-foreground leading-tight pr-2 line-clamp-2">
                  {s.title}
                </span>
                <span
                  className="material-symbols-outlined text-[16px] flex-shrink-0"
                  style={{
                    color: s.active ? "#C0C0C0" : "#5C5C5C",
                    fontVariationSettings: '"wght" 300',
                  }}
                >
                  more_vert
                </span>
              </div>
              <div className="flex justify-between items-center mt-3 text-[10px] font-mono text-op-text-sec">
                <span>{s.ts}</span>
                <span className="flex items-center gap-1">
                  {s.dot === "nominal" && (
                    <span className="w-1.5 h-1.5 bg-op-nominal rounded-full" />
                  )}
                  {s.msgCount} MSGS
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-op-border p-3 text-[10px] font-mono text-op-text-sec text-center shrink-0">
          {MOCK_SESSIONS.length} SESSIONS •{" "}
          {MOCK_SESSIONS.reduce((a, s) => a + s.msgCount, 0)} MSGS TOTAL
        </div>
      </aside>

      {/* ── Center Column: Chat ────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col bg-op-surface border-x border-op-border">

        {/* Status bar */}
        <div className="h-10 border-b border-op-border flex items-center px-4 justify-between bg-op-elevated shrink-0">
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${statusDotClass}`} />
            <span className="font-mono text-xs text-op-text-sec">{systemStatus}</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="font-mono text-xs text-op-text-sec">VLM_MODE: ON</span>
            <span className="font-mono text-xs text-op-text-sec hidden sm:inline">MODEL: SEC-L-V3</span>
          </div>
        </div>

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col min-h-0">

          {/* Empty state */}
          {messages.length === 0 && !isReplyProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <span
                className="material-symbols-outlined text-[3rem] text-op-text-muted"
                style={{ fontVariationSettings: '"wght" 100' }}
              >
                neurology
              </span>
              <div className="font-mono text-sm text-op-text-sec">SYSTEM WAITING FOR QUERY</div>
              {isVideoReady && (
                <div className="flex flex-wrap justify-center gap-2 max-w-[500px] mt-4">
                  {[
                    "Summarize all events in this footage",
                    "What objects were detected?",
                    "Identify any unusual activity",
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => { setInputValue(q); }}
                      className="bg-op-elevated border border-op-border hover:border-op-border-active text-op-silver px-3 py-1.5 font-mono text-xs duration-75"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {!isVideoReady && uploadPhase === "idle" && (
                <p className="font-mono text-xs text-op-text-muted max-w-xs">
                  Navigate to the Video Analysis tab, upload a video, and wait for analysis to complete before querying.
                </p>
              )}
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col w-full ${isUser ? "items-end" : "items-start"}`}
              >
                {/* Sender label */}
                <div
                  className={`text-[0.65rem] font-mono text-op-text-sec mb-1 flex items-center space-x-2 ${
                    isUser ? "flex-row-reverse space-x-reverse" : ""
                  }`}
                >
                  {!isUser && (
                    <span
                      className="material-symbols-outlined text-[12px] text-op-silver"
                      style={{ fontVariationSettings: '"wght" 300' }}
                    >
                      smart_toy
                    </span>
                  )}
                  <span>{isUser ? "USER" : "VLM"}</span>
                </div>

                {/* Bubble */}
                {isUser ? (
                  <div className="bg-op-elevated border border-op-border-active p-3 max-w-[80%] text-sm text-op-silver font-mono">
                    {msg.content}
                  </div>
                ) : (
                  <div className="bg-op-base border border-op-border p-4 w-full text-sm font-mono text-op-silver space-y-3">
                    <p>{msg.content}</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Thinking indicator */}
          {isReplyProcessing && (
            <div className="flex flex-col items-start w-full">
              <div className="text-[0.65rem] font-mono text-op-text-sec mb-1 flex items-center space-x-2">
                <span
                  className="material-symbols-outlined text-[12px] text-op-silver"
                  style={{ fontVariationSettings: '"wght" 300' }}
                >
                  smart_toy
                </span>
                <span>VLM // PROCESSING...</span>
              </div>
              <div className="bg-op-base border border-op-border p-4 w-full">
                <div className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-op-silver animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-op-silver animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-op-silver animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-op-border bg-op-surface shrink-0">
          <div className="relative flex items-center border border-op-border bg-op-base focus-within:border-op-silver duration-75">
            <div className="pl-3 pr-2 text-op-silver font-mono font-bold">&gt;</div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); }}
              onKeyDown={handleKeyDown}
              disabled={!isVideoReady || isReplyProcessing}
              placeholder={placeholder}
              className="w-full bg-transparent border-none text-sm text-op-silver placeholder:text-op-text-muted focus:ring-0 font-mono py-3 outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!isVideoReady || isReplyProcessing || !inputValue.trim()}
              className="pr-3 pl-2 text-op-text-sec hover:text-op-silver duration-75 flex items-center disabled:opacity-30"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: '"wght" 200' }}
              >
                send
              </span>
            </button>
          </div>

          <div className="flex justify-between items-center mt-2 px-1">
            <div className="flex space-x-3">
              <button
                type="button"
                className="text-[0.65rem] font-mono text-op-text-sec hover:text-op-silver flex items-center space-x-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">attachment</span>
                <span>ADD REF</span>
              </button>
              <button
                type="button"
                className="text-[0.65rem] font-mono text-op-text-sec hover:text-op-silver flex items-center space-x-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">history</span>
                <span>HISTORY</span>
              </button>
            </div>
            <span className="text-[0.65rem] font-mono text-op-text-muted">CMD+ENTER TO SEND</span>
          </div>
        </div>
      </main>

      {/* ── Right Panel: Context Sources ───────────────────── */}
      <aside className="w-[220px] bg-op-surface border-l border-op-border flex-col flex-shrink-0 hidden xl:flex">

        {/* Header */}
        <div className="h-10 border-b border-op-border flex items-center px-3 bg-op-elevated shrink-0">
          <span className="font-mono text-xs text-op-text-sec tracking-tight">
            CONTEXT SOURCES
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">

          {/* Active video preview */}
          {selectedVideoUrl && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[0.65rem] font-mono text-op-text-sec">ACTIVE VIDEO</div>
                <button
                  type="button"
                  onClick={() => setVideoExpanded((v) => !v)}
                  className="text-[0.65rem] font-mono text-op-text-sec hover:text-op-silver transition-colors"
                >
                  {videoExpanded ? "HIDE" : "SHOW"}
                </button>
              </div>
              {videoExpanded && (
                <div className="relative bg-black border border-op-border overflow-hidden aspect-video mb-1.5">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={selectedVideoUrl}
                    className="w-full h-full object-contain grayscale"
                    muted
                    playsInline
                  />
                  <div className="absolute inset-0 pointer-events-none border border-op-border-active" />
                </div>
              )}
              <div className="text-[0.65rem] font-mono text-op-text-sec truncate">
                {selectedVideoName || "UNKNOWN"}
              </div>
            </div>
          )}

          {/* Active Ingestion */}
          <div>
            <div className="text-[0.65rem] font-mono text-op-text-sec mb-2">ACTIVE INGESTION</div>
            {job ? (
              <>
                <div className="text-sm font-mono text-op-silver">
                  {job.totalFrames ?? "—"} FRAMES
                </div>
                <div className="text-[0.65rem] font-mono text-op-text-sec mt-1 truncate">
                  SOURCE: {selectedVideoName ?? "UNKNOWN"}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-mono text-op-silver">47 RECORDINGS</div>
                <div className="text-[0.65rem] font-mono text-op-text-sec mt-1">TIME WINDOW: 4H 00M</div>
              </>
            )}
          </div>

          {/* Referenced Cams */}
          <div>
            <div className="text-[0.65rem] font-mono text-op-text-sec mb-2 border-b border-op-border pb-1">
              REFERENCED CAMS
            </div>
            <div className="space-y-1 mt-2">
              {[
                { id: "LDK_CAM_01", dot: "nominal" },
                { id: "LDK_CAM_02", dot: "nominal" },
                { id: "LDK_CAM_04_A", dot: "warn" },
              ].map((cam) => (
                <div
                  key={cam.id}
                  className="flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-1 h-1 rounded-full ${
                        cam.dot === "warn" ? "bg-op-warning" : "bg-op-nominal"
                      }`}
                    />
                    <span className="font-mono text-xs text-op-silver group-hover:text-foreground transition-colors">
                      {cam.id}
                    </span>
                  </div>
                  <span
                    className="material-symbols-outlined text-[12px] text-op-text-muted group-hover:text-op-text-sec transition-colors"
                    style={{ fontVariationSettings: '"wght" 200' }}
                  >
                    visibility
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* VLM Parameters */}
          <div className="border border-op-border bg-op-base p-2">
            <div className="text-[0.65rem] font-mono text-op-text-sec mb-1">VLM PARAMETERS</div>
            <div className="flex justify-between items-center mt-1">
              <span className="font-mono text-[0.65rem] text-op-text-sec">TEMP</span>
              <span className="font-mono text-xs text-op-silver">0.2</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="font-mono text-[0.65rem] text-op-text-sec">TOP_K</span>
              <span className="font-mono text-xs text-op-silver">40</span>
            </div>
            <div className="flex justify-between items-center mt-1 pt-1 border-t border-op-border">
              <span className="font-mono text-[0.65rem] text-op-text-sec">TOKENS</span>
              <span className="font-mono text-xs text-op-silver">1,402</span>
            </div>
          </div>

          {/* Export Log */}
          <button
            type="button"
            className="w-full bg-transparent border border-op-border text-op-silver font-mono text-xs py-2 hover:border-op-silver hover:bg-op-elevated duration-75 flex items-center justify-center space-x-2"
          >
            <span
              className="material-symbols-outlined text-[14px]"
              style={{ fontVariationSettings: '"wght" 200' }}
            >
              download
            </span>
            <span>EXPORT LOG</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
