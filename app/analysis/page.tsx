"use client";

import Link from "next/link";
import type React from "react";
import { useMemo, useRef } from "react";
import { AnalysisVideoPlayer } from "@/components/analysis/analysis-video-player";
import { useAnalysisSession } from "@/components/analysis/video-watch-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Pipeline step definition ────────────────────────────────────────────────

type StepStatus = "complete" | "active" | "pending" | "error";

interface PipelineStep {
  id: string;
  icon: string;
  label: string;
  stat?: string;
  status: StepStatus;
}

function buildPipelineSteps(
  uploadPhase: string,
  analyzedFrames: number,
  totalFrames: number,
  etaLabel: string | null,
  hasError: boolean,
): PipelineStep[] {
  const completed = (step: string) => {
    const order = ["uploading", "extracting", "analyzing", "combining", "completed"];
    const currentIdx = order.indexOf(uploadPhase);
    const stepIdx = order.indexOf(step);
    if (uploadPhase === "completed") return true;
    return currentIdx > stepIdx;
  };

  const isCurrent = (step: string) => uploadPhase === step || (step === "uploading" && uploadPhase === "checking_cache");

  const status = (step: string): StepStatus => {
    if (hasError && isCurrent(step)) return "error";
    if (completed(step)) return "complete";
    if (isCurrent(step)) return "active";
    return "pending";
  };

  return [
    {
      id: "uploading",
      icon: "check_circle",
      label: "Pre-process Payload",
      stat: status("uploading") === "complete" ? "100%" : "--",
      status: status("uploading"),
    },
    {
      id: "extracting",
      icon: "check_circle",
      label: "Frame Extraction",
      stat: status("extracting") === "complete" ? "done" : "--",
      status: status("extracting"),
    },
    {
      id: "analyzing",
      icon: "radar",
      label: "Object Detection (YOLOv8)",
      stat:
        uploadPhase === "analyzing"
          ? `${Math.round((analyzedFrames / Math.max(totalFrames, 1)) * 100)}%`
          : status("analyzing") === "complete"
            ? "100%"
            : "--",
      status: status("analyzing"),
    },
    {
      id: "face",
      icon: "face",
      label: "Face Recognition Track",
      stat: "--",
      status: "pending",
    },
    {
      id: "combining",
      icon: "memory",
      label: "VLM Context Analysis",
      stat: status("combining") === "complete" || uploadPhase === "completed" ? "done" : "--",
      status: status("combining"),
    },
    {
      id: "report",
      icon: "summarize",
      label: "Post-process & Report",
      stat: uploadPhase === "completed" ? "done" : "--",
      status: uploadPhase === "completed" ? "complete" : "pending",
    },
  ];
}

// ─── Face crop thumbnails (mock – face recognition not yet wired) ─────────────

type FaceCrop =
  | { id: string; border: string; highlight: false; label: string; processing?: false }
  | { id: string; border: string; highlight: true; label: string; processing?: false }
  | { id: string; border: string; highlight?: false; label: null; processing: true };

const FACE_CROPS: FaceCrop[] = [
  { id: "14:21:10", border: "border-op-border-active", label: "14:21:10", highlight: false },
  { id: "UNKNOWN", border: "border-op-critical", label: "UID: UNKNOWN", highlight: true },
  { id: "14:22:04", border: "border-op-border-active", label: "14:22:04", highlight: false },
  { id: "PROC", border: "border-op-border-active", label: null, processing: true },
];

// ─── Event log rows (mock + real phase label) ─────────────────────────────────

const MOCK_EVENT_ROWS = [
  { time: "14:21:10.05", cam: "NORTH_ENT", cls: "PERSON",       conf: "0.94", note: "Individual carrying dark briefcase, steady pace.", tone: "normal", active: false },
  { time: "14:21:45.22", cam: "NORTH_ENT", cls: "UNAUTHORIZED", conf: "0.88", note: "Subject loitering near restricted access door B. Face partially obscured.", tone: "error", active: false },
  { time: "14:22:01.00", cam: "NORTH_ENT", cls: "VEHICLE",      conf: "0.91", note: "White delivery van, license plate illegible due to glare.", tone: "normal", active: false },
  { time: "14:22:04.15", cam: "NORTH_ENT", cls: "PERSON",       conf: "0.96", note: "Multiple individuals entering frame from east corridor.", tone: "normal", active: true },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalysisPage(): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    analyzedFrames,
    attachVideo,
    buildHref,
    clearCache,
    etaLabel,
    isCacheActionPending,
    job,
    phaseLabel,
    runFreshAnalysis,
    selectedVideoName,
    selectedVideoUrl,
    totalFrames,
    uploadPhase,
    error,
  } = useAnalysisSession();

  const pipelineSteps = useMemo(
    () =>
      buildPipelineSteps(
        uploadPhase,
        analyzedFrames,
        totalFrames,
        etaLabel,
        uploadPhase === "error",
      ),
    [analyzedFrames, etaLabel, totalFrames, uploadPhase],
  );

  const seqLabel = job?.jobId?.slice(0, 7).toUpperCase() ?? "SEQ-094";
  const cameraLabel = job?.sourceFileName ?? "CAM-04-NORTH_ENTRANCE";

  return (
    <div className="flex h-full min-h-0 overflow-hidden p-2 gap-2">

      {/* ── Left aside: Upload + Pipeline ──────────────────────────── */}
      <aside className="w-72 flex flex-col gap-2 shrink-0">

        {/* Source Payload card */}
        <div className="bg-op-surface border border-op-border rounded-sm p-4 flex flex-col gap-3">
          <div className="font-mono text-xs text-foreground uppercase tracking-wider mb-1">
            Source Payload
          </div>

          {/* Drop zone */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-op-border-active hover:border-op-silver transition-colors bg-op-base p-6 flex flex-col items-center justify-center text-center gap-2 cursor-pointer h-32 rounded-sm"
          >
            <span className="material-symbols-outlined text-op-text-sec text-[28px]">
              upload_file
            </span>
            <span className="text-xs text-op-text-sec">
              {selectedVideoName ? (
                <span className="text-op-silver">{selectedVideoName}</span>
              ) : (
                <>
                  Drag &amp; drop video payload
                  <br />
                  or{" "}
                  <span className="text-foreground underline underline-offset-2">
                    browse directory
                  </span>
                </>
              )}
            </span>
          </button>

          <div className="flex justify-between items-center text-[10px] font-mono text-op-text-sec">
            <span>MAX: 2GB (MP4, MKV)</span>
            <span>H.264/H.265</span>
          </div>

          {/* Action buttons – only shown when a job exists */}
          {(job || selectedVideoUrl) && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-op-border">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] font-mono text-op-text-sec hover:text-foreground uppercase tracking-wider transition-colors"
              >
                Replace
              </button>
              <span className="text-op-border">|</span>
              <button
                type="button"
                onClick={() => { void runFreshAnalysis(); }}
                disabled={isCacheActionPending || !selectedVideoUrl}
                className="text-[10px] font-mono text-op-text-sec hover:text-foreground uppercase tracking-wider transition-colors disabled:opacity-40"
              >
                Fresh Run
              </button>
              <span className="text-op-border">|</span>
              <button
                type="button"
                onClick={() => { void clearCache(); }}
                disabled={isCacheActionPending || !job}
                className="text-[10px] font-mono text-op-text-sec hover:text-op-critical uppercase tracking-wider transition-colors disabled:opacity-40"
              >
                Clear Cache
              </button>
            </div>
          )}
        </div>

        {/* Analysis Pipeline card */}
        <div className="flex-1 bg-op-surface border border-op-border rounded-sm p-4 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <span className="font-mono text-xs text-foreground uppercase tracking-wider">
              Analysis Pipeline
            </span>
            <span className="px-2 py-0.5 bg-op-base border border-op-border-active text-[10px] font-mono text-op-text-sec rounded-sm">
              {seqLabel}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-2">
            <ul className="flex flex-col font-mono text-xs">
              {pipelineSteps.map((step, idx) => {
                const isLast = idx === pipelineSteps.length - 1;
                const isActive = step.status === "active";
                const isComplete = step.status === "complete";
                const isPending = step.status === "pending" || step.status === "error";

                const rowColor = isActive
                  ? "text-foreground"
                  : isComplete
                    ? "text-op-silver"
                    : "text-op-text-sec";

                const iconColor = isActive
                  ? "text-foreground"
                  : isComplete
                    ? "text-op-silver"
                    : "text-op-text-sec";

                return (
                  <li key={step.id} className="flex flex-col relative">
                    {isActive && (
                      <div className="absolute -left-4 top-0 bottom-0 w-1 bg-op-silver" />
                    )}
                    <div
                      className={`flex items-center gap-3 py-2 ${rowColor} ${
                        isActive
                          ? "bg-op-elevated px-2 -mx-2 rounded-sm border border-op-border"
                          : ""
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[16px] ${iconColor} ${isActive ? "animate-pulse" : ""}`}
                        style={
                          isComplete
                            ? { fontVariationSettings: '"FILL" 1' }
                            : undefined
                        }
                      >
                        {step.icon}
                      </span>
                      <span className={isActive ? "font-medium" : ""}>{step.label}</span>
                      <span className={`ml-auto text-[10px] ${isComplete ? "text-op-silver" : "text-op-text-sec"}`}>
                        {step.stat}
                      </span>
                    </div>
                    {!isLast && (
                      <div
                        className={`h-4 border-l ml-[7px] ${
                          isComplete ? "border-op-border-active" : "border-op-border"
                        }`}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </aside>

      {/* ── Right section: Viewer + Bottom Row ─────────────────────── */}
      <section className="flex-1 flex flex-col gap-2 min-w-0">

        {/* Error banner */}
        {error && (
          <div className="border border-op-critical bg-op-critical/10 px-4 py-2 font-mono text-xs text-foreground rounded-sm">
            {error}
          </div>
        )}

        {/* Viewer & Scrubber – flex-[3] */}
        <div className="flex-[3] bg-op-surface border border-op-border rounded-sm relative overflow-hidden flex flex-col min-h-0">
          <AnalysisVideoPlayer
            src={selectedVideoUrl}
            title={cameraLabel.toUpperCase()}
            timelineMarkers={[20, 45, 70]}
            overlays={
              selectedVideoUrl ? (
                <>
                  {/* PERSON bbox */}
                  <div className="absolute top-[30%] left-[45%] w-32 h-64 border border-op-silver bg-op-silver/10 pointer-events-none">
                    <div className="absolute -top-5 left-[-1px] bg-op-silver text-op-base px-1 text-[9px] font-mono font-bold uppercase">
                      PERSON 94%
                    </div>
                  </div>
                  {/* UNAUTHORIZED bbox */}
                  <div className="absolute top-[45%] left-[20%] w-24 h-48 border border-op-critical bg-op-critical/10 pointer-events-none">
                    <div className="absolute -top-5 left-[-1px] bg-op-critical text-foreground px-1 text-[9px] font-mono font-bold uppercase">
                      UNAUTHORIZED 88%
                    </div>
                  </div>
                </>
              ) : null
            }
          />

          {/* Summary strip */}
          {job?.summary && (
            <div className="border-t border-op-border bg-op-elevated px-4 py-3 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-op-text-sec uppercase tracking-widest">
                  Analysis Summary
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-op-text-sec">
                    {job.cache.cacheHit ? `Cache hit (${job.cache.source})` : "Fresh run"}
                  </span>
                  <Link
                    href={buildHref("/analysis/query")}
                    className="flex items-center gap-1 font-mono text-[10px] text-op-silver hover:text-foreground transition-colors uppercase tracking-wider"
                  >
                    <span className="material-symbols-outlined text-[12px]">psychology</span>
                    Query with AI
                  </Link>
                </div>
              </div>
              <p className="text-sm leading-6 text-op-silver">{job.summary.summaryText}</p>
            </div>
          )}

          {/* Header action row */}
          <div className="absolute top-[calc(var(--player-header-h,2rem)+1px)] right-0 z-20 hidden">
            {/* kept for potential use */}
          </div>
        </div>

        {/* Bottom row – flex-[2] */}
        <div className="flex-[2] flex gap-2 overflow-hidden min-h-0">

          {/* Face Track Cluster */}
          <div className="w-80 bg-op-surface border border-op-border rounded-sm flex flex-col overflow-hidden shrink-0">
            <div className="h-8 border-b border-op-border bg-op-elevated px-3 flex items-center justify-between shrink-0">
              <span className="font-mono text-[10px] text-foreground uppercase tracking-widest">
                Face Track Cluster
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline-warning" className="text-[8px]">MOCK</Badge>
                <span className="material-symbols-outlined text-[14px] text-op-text-sec">group</span>
              </div>
            </div>
            <div className="flex-1 p-2 grid grid-cols-3 gap-2 overflow-y-auto content-start">
              {FACE_CROPS.map((crop) => (
                <div
                  key={crop.id}
                  className={`aspect-square border ${crop.border} bg-op-base relative group`}
                >
                  {crop.processing === true ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="font-mono text-[10px] text-op-text-sec">PROCESSING</span>
                    </div>
                  ) : crop.highlight ? (
                    <>
                      <div className="w-full h-full bg-op-elevated opacity-70 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute top-0 right-0 w-2 h-2 bg-op-critical rounded-full translate-x-1 -translate-y-1" />
                      <div className="absolute bottom-0 w-full bg-op-critical text-center py-0.5 font-mono text-[8px] text-foreground font-bold">
                        {crop.label}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Greyed placeholder – face recognition not wired */}
                      <div className="w-full h-full bg-op-elevated opacity-70 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-0 w-full bg-op-elevated/90 text-center py-0.5 border-t border-op-border font-mono text-[8px] text-foreground">
                        {crop.label}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Analysis Event Log */}
          <div className="flex-1 bg-op-surface border border-op-border rounded-sm flex flex-col overflow-hidden">
            <div className="h-10 border-b border-op-border bg-op-elevated px-4 flex items-center justify-between shrink-0">
              <span className="font-mono text-[10px] text-foreground uppercase tracking-widest">
                Analysis Event Log
              </span>
              <button
                type="button"
                className="bg-foreground text-op-base px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-sm hover:bg-op-silver transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[12px]">download</span>
                Export Report
              </button>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-op-border bg-op-surface font-mono text-[9px] text-op-text-sec uppercase tracking-wider shrink-0">
              <div className="col-span-2">TIME</div>
              <div className="col-span-2">CAMERA</div>
              <div className="col-span-2">CLASS</div>
              <div className="col-span-1 text-right">CONF</div>
              <div className="col-span-5 pl-4">VLM NOTE</div>
            </div>

            {/* Table body */}
            <div className="flex-1 overflow-y-auto font-mono text-[10px]">
              {MOCK_EVENT_ROWS.map((row) => (
                <div
                  key={`${row.time}-${row.cls}`}
                  className={`grid grid-cols-12 gap-2 px-4 py-2 border-b border-op-border items-center relative transition-colors ${
                    row.tone === "error"
                      ? "bg-op-critical/5 hover:bg-op-critical/10 text-op-critical"
                      : row.active
                        ? "bg-op-elevated hover:bg-op-elevated text-op-text-sec"
                        : "hover:bg-op-elevated text-op-text-sec"
                  }`}
                >
                  {row.active && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-foreground" />
                  )}
                  <div className={`col-span-2 ${row.active ? "text-foreground" : "text-op-silver"}`}>
                    {row.time}
                  </div>
                  <div className="col-span-2 truncate text-op-text-sec">{row.cam}</div>
                  <div className={`col-span-2 ${row.tone === "error" ? "font-bold" : ""}`}>{row.cls}</div>
                  <div className={`col-span-1 text-right ${row.tone === "error" ? "font-bold" : "text-op-silver"}`}>
                    {row.conf}
                  </div>
                  <div className={`col-span-5 pl-4 truncate ${row.tone === "error" ? "" : "text-op-text-sec"}`}>
                    {row.note}
                  </div>
                </div>
              ))}

              {/* Live job phase row */}
              {job && job.status !== "completed" && (
                <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-op-border items-center text-op-text-sec">
                  <div className="col-span-2 text-op-warning animate-pulse">LIVE</div>
                  <div className="col-span-2 truncate">PIPELINE</div>
                  <div className="col-span-2 text-op-warning">{job.status.toUpperCase()}</div>
                  <div className="col-span-1 text-right">—</div>
                  <div className="col-span-5 pl-4 truncate">{phaseLabel}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Open AI Query CTA — visible when analysis is done */}
      {uploadPhase === "completed" && (
        <Link
          href={buildHref("/analysis/query")}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-op-silver text-op-base px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider hover:bg-foreground transition-colors duration-75 shadow-lg"
        >
          <span className="material-symbols-outlined text-[16px]">psychology</span>
          Query with AI
          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </Link>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void attachVideo(file);
        }}
      />
    </div>
  );
}
