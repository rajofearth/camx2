"use client";

/**
 * Live Monitor Page
 *
 * Displays the primary camera feed with detection overlays, a 2×2 mini camera
 * grid, a real-time intel stream log, and an active-detections summary panel.
 *
 * ─── BACKEND INTEGRATION POINTS (wired by subagent) ────────────────────────
 *  [1] WEBCAM_SETUP       – sync webcamRef → cameraSourceRef (effect below)
 *  [2] DETECTION_OVERLAY  – render OverlayCanvas over the primary feed
 *  [3] INTEL_LOG          – push detection & watch events into logEntries
 *  [4] THREAT_MODAL       – open modal when watchResult.isHarm === true
 *  [5] DETECT_COUNTS      – aggregate detections[] by class label
 *  [6] VLM_STATUS         – derive vlmStatus from watchResult
 * ────────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import { useCameraDevices } from "@/app/hooks/useCameraDevices";
import { useWebcamDetect } from "@/app/hooks/useWebcamDetect";
import { useWebcamWatch } from "@/app/hooks/useWebcamWatch";
import type { CameraSourceRef } from "@/app/lib/camera-source";
import { cocoClassName } from "@/app/lib/coco";
import { appendThreatLogEntry } from "@/app/lib/threat-log-store";
import type { Detection } from "@/app/lib/types";
import type { WatchResult } from "@/app/lib/watch-types";
import { OverlayCanvas } from "@/components/OverlayCanvas";
import { NavAvatar, NavIconButton, TopNav } from "@/components/shell";
import { ThreatModal } from "@/components/threat";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { IntelLog, IntelLogEntry, IntelTag } from "@/components/ui/intel-log";
import { MonoLabel } from "@/components/ui/mono-label";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  id: string;
  timestamp: string;
  source: string;
  message: React.ReactNode;
  dimmed?: boolean;
}

interface ThreatState {
  threatId: string;
  cameraId: string;
  timestamp: string;
  classification: string;
  confidence: number;
  frameSrc?: string;
  frameId?: string;
  vlmAnalysis: string[];
}

type VlmStatus = "NOMINAL" | "ANALYZING" | "THREAT" | "OFFLINE";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIMARY_CAM_ID = "CAM_01_MAIN_CORRIDOR";
const VIDEO_W = 640;
const VIDEO_H = 480;

/** Mini cameras shown in the 2×2 grid — no real source, purely display. */
const MINI_CAMERAS: { id: string; label: string }[] = [
  { id: "cam-ng", label: "NORTH_GATE" },
  { id: "cam-la", label: "LOBBY_A" },
  { id: "cam-sr", label: "SERVER_RM" },
  { id: "cam-ep", label: "EXT_PERIMETER" },
];

/** Seed entries shown before real events arrive. */
const SEED_LOG: LogEntry[] = [
  {
    id: "seed-1",
    timestamp: "14:09:45",
    source: "SYS",
    message: "· Routine diagnostic complete. All sensors nominal.",
  },
  {
    id: "seed-2",
    timestamp: "14:10:02",
    source: "SYS",
    message: (
      <>
        · System initialised. <IntelTag>{PRIMARY_CAM_ID}</IntelTag> feed active.
      </>
    ),
  },
  {
    id: "seed-3",
    timestamp: "14:10:05",
    source: "SYS",
    message: "· Detection engine ready. Waiting for frames…",
  },
];

function nowTimestamp(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

/** Map a COCO class index to a display-friendly uppercase string. */
function classLabel(classIdx: number): string {
  return cocoClassName(classIdx, "rfdetr").replace(/_/g, " ").toUpperCase();
}

/** Aggregate detections by class label → count map. */
function aggregateDetections(dets: readonly Detection[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of dets) {
    const label = classLabel(d.class);
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return map;
}

/**
 * Map a detection class to a BoundingBox threat variant.
 * Extend this as needed for project-specific threat classes.
 */
function _detectionVariant(
  _classIdx: number,
): "default" | "warning" | "critical" {
  return "default"; // subagent can refine per-class mapping
}

/** Derive VLM status string from watch result. */
function deriveVlmStatus(
  watchResult: WatchResult | null,
  isProcessing: boolean,
): VlmStatus {
  if (isProcessing) return "ANALYZING";
  if (!watchResult) return "NOMINAL";
  if (watchResult.isHarm === true) return "THREAT";
  if (watchResult.isHarm === false) return "NOMINAL";
  return "NOMINAL";
}

function isVerifiedThreat(
  watchResult: WatchResult | null,
  verificationMeta:
    | {
        applied?: boolean;
        matchesPrompt?: boolean | null;
        overturned?: boolean;
      }
    | null
    | undefined,
): boolean {
  if (watchResult?.isHarm !== true || !watchResult.description) return false;
  if (!verificationMeta?.applied) return false;
  if (verificationMeta.overturned === true) return false;
  if (verificationMeta.matchesPrompt === false) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Mini camera cell in the 2×2 grid (no live source, shows placeholder). */
function MiniCameraCell({ label }: { label: string }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-sm border border-op-border bg-op-surface">
      {/* Gradient label overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between bg-linear-to-b from-black/80 to-transparent p-1.5">
        <span className="bg-black/50 px-1 font-mono text-[9px] text-op-silver">
          {label}
        </span>
      </div>
      {/* Placeholder feed area */}
      <div className="flex flex-1 items-center justify-center bg-black">
        <span className="material-symbols-outlined text-[20px] text-op-border">
          videocam_off
        </span>
      </div>
    </div>
  );
}

/** Detection count row inside the Active Detections panel. */
function DetectionRow({
  icon,
  label,
  count,
  active,
}: {
  icon: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-op-border/50 pb-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "material-symbols-outlined text-[16px]",
            active ? "text-op-silver" : "text-op-text-sec",
          )}
        >
          {icon}
        </span>
        <span
          className={cn(
            "font-mono text-[11px]",
            active ? "text-op-silver" : "text-op-text-sec",
          )}
        >
          {label}
        </span>
      </div>
      <span
        className={cn(
          "font-mono text-[14px]",
          active ? "text-op-silver" : "text-op-text-sec",
        )}
      >
        {count}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LiveMonitorPage() {
  // ── Camera refs ──────────────────────────────────────────────────────────
  const webcamRef = useRef<InstanceType<typeof Webcam> | null>(null);
  /** [1] WEBCAM_SETUP: cameraSourceRef bridges Webcam instance → hooks */
  const cameraSourceRef = useRef<CameraSourceRef | null>(null);

  // ── Camera active state ───────────────────────────────────────────────────
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ── VLM watch toggle (disabled by default – resource-intensive) ──────────
  const [isWatchActive, setIsWatchActive] = useState(false);

  // ── Camera device selection ───────────────────────────────────────────────
  const { devices, isLoading: isLoadingDevices } = useCameraDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Auto-select first available device
  useEffect(() => {
    if (isLoadingDevices || devices.length === 0 || selectedDeviceId) return;
    const first = devices[0];
    if (first) setSelectedDeviceId(first.deviceId);
  }, [devices, isLoadingDevices, selectedDeviceId]);

  const handleDeviceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedDeviceId(e.target.value || null);
      setIsCameraReady(false);
      setCameraError(null);
    },
    [],
  );

  // ── Intel log ─────────────────────────────────────────────────────────────
  const [logEntries, setLogEntries] = useState<LogEntry[]>(SEED_LOG);

  // ── Threat modal ──────────────────────────────────────────────────────────
  const [threatOpen, setThreatOpen] = useState(false);
  const [threatData, setThreatData] = useState<ThreatState | null>(null);

  // ── System load (proxy: last detect latency as % of 1000ms budget) ───────
  const [systemLoad, setSystemLoad] = useState(0);

  // ── Detection hook ────────────────────────────────────────────────────────
  const {
    detections,
    lastLatency: detectLatency,
    isProcessing: isDetectProcessing,
    error: _detectError,
    frameDimensions,
  } = useWebcamDetect(cameraSourceRef, isCameraReady, { maxFps: 5 });

  // ── Watch hook ────────────────────────────────────────────────────────────
  const {
    latest: watchResult,
    lastMeta,
    lastRequestId,
    isProcessing: isWatchProcessing,
    error: _watchError,
  } = useWebcamWatch(cameraSourceRef, isCameraReady && isWatchActive);

  // ── [1] WEBCAM_SETUP: sync webcamRef → cameraSourceRef ───────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: camera source ref must stay in sync with camera ready state and device selection
  useEffect(() => {
    cameraSourceRef.current = webcamRef.current;
  }, [isCameraReady, selectedDeviceId]);

  // ── [5] DETECT_COUNTS: aggregate by class ────────────────────────────────
  const detectionsByClass = useMemo(
    () => aggregateDetections(detections),
    [detections],
  );
  const personCount = detectionsByClass.get("PERSON") ?? 0;
  const vehicleCount =
    (detectionsByClass.get("CAR") ?? 0) +
    (detectionsByClass.get("TRUCK") ?? 0) +
    (detectionsByClass.get("BUS") ?? 0) +
    (detectionsByClass.get("MOTORCYCLE") ?? 0);
  const anomalyCount = [...detectionsByClass.entries()]
    .filter(
      ([k]) => !["PERSON", "CAR", "TRUCK", "BUS", "MOTORCYCLE"].includes(k),
    )
    .reduce((sum, [, v]) => sum + v, 0);

  // ── [6] VLM_STATUS ───────────────────────────────────────────────────────
  const vlmStatus = deriveVlmStatus(watchResult, isWatchProcessing);

  // ── [5] SYSTEM_LOAD proxy ─────────────────────────────────────────────────
  useEffect(() => {
    if (detectLatency !== null) {
      setSystemLoad(Math.min(99, Math.round((detectLatency / 1000) * 100)));
    }
  }, [detectLatency]);

  // ── [3] INTEL_LOG: push detection events ─────────────────────────────────
  const lastDetectionCountRef = useRef(0);
  useEffect(() => {
    if (detections.length === 0) return;
    if (detections.length === lastDetectionCountRef.current) return;
    lastDetectionCountRef.current = detections.length;

    const topDet = detections[0];
    if (!topDet) return;

    const label = classLabel(topDet.class);
    const conf = Math.round(topDet.confidence * 100);

    setLogEntries((prev) => [
      ...prev.slice(-49), // keep last 50 entries
      {
        id: uid(),
        timestamp: nowTimestamp(),
        source: PRIMARY_CAM_ID.slice(0, 6),
        message: (
          <>
            · <IntelTag>{label}</IntelTag> — detected at {conf}% confidence.
            {detections.length > 1 && ` +${detections.length - 1} more.`}
          </>
        ),
      },
    ]);
  }, [detections]);

  // ── [3] INTEL_LOG: push VLM watch events ─────────────────────────────────
  useEffect(() => {
    if (!watchResult) return;
    setLogEntries((prev) => [
      ...prev.slice(-49),
      {
        id: uid(),
        timestamp: nowTimestamp(),
        source: "VLM",
        message:
          watchResult.isHarm === true
            ? `· HARM DETECTED — ${watchResult.description ?? "No description."}`
            : "· Frame assessed. No threat identified.",
      },
    ]);
  }, [watchResult]);

  const lastLoggedThreatRequestIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lastRequestId) return;
    if (lastLoggedThreatRequestIdRef.current === lastRequestId) return;
    if (!isVerifiedThreat(watchResult, lastMeta?.verification)) return;

    const screenshot = webcamRef.current?.getScreenshot() ?? null;
    const verification = lastMeta?.verification ?? null;
    const description = watchResult?.description ?? "Verified threat detected.";
    const confidence =
      detections.length > 0
        ? Math.round(Math.max(...detections.map((d) => d.confidence)) * 100)
        : 90;

    appendThreatLogEntry({
      requestId: lastRequestId,
      timestamp: new Date().toISOString(),
      cameraId: PRIMARY_CAM_ID,
      classification: description,
      confidence,
      previewText: description,
      frameSrc: screenshot,
      frameId: `FRAME_CAP_${nowTimestamp().replace(/:/g, "")}`,
      vlmAnalysis: [
        description,
        verification?.reason ?? "Verification confirmed the watch output.",
      ],
      verification: {
        applied: verification?.applied ?? false,
        matchesPrompt: verification?.matchesPrompt ?? null,
        overturned: verification?.overturned ?? false,
        reason: verification?.reason ?? null,
        modelKey: verification?.modelKey ?? null,
        latencyMs: verification?.latencyMs ?? null,
      },
      tags: [
        "WATCH_VERIFIED",
        ...(verification?.modelKey ? [verification.modelKey] : []),
      ],
    });

    lastLoggedThreatRequestIdRef.current = lastRequestId;
    setLogEntries((prev) => [
      ...prev.slice(-49),
      {
        id: uid(),
        timestamp: nowTimestamp(),
        source: "SYS",
        message: (
          <>
            · Verified threat archived in <IntelTag>THREAT_LOG</IntelTag>.
          </>
        ),
      },
    ]);
  }, [detections, lastMeta, lastRequestId, watchResult]);

  // ── [4] THREAT_MODAL: trigger on harm ────────────────────────────────────
  useEffect(() => {
    if (watchResult?.isHarm !== true || !watchResult.description) return;
    if (threatOpen) return; // don't stack modals

    const screenshot = webcamRef.current?.getScreenshot() ?? undefined;

    setThreatData({
      threatId: `THT-${uid().toUpperCase()}`,
      cameraId: PRIMARY_CAM_ID,
      timestamp: `${new Date().toISOString().replace("T", " ").slice(0, 19)}Z`,
      classification: watchResult.description,
      confidence:
        detections.length > 0
          ? Math.round(Math.max(...detections.map((d) => d.confidence)) * 100)
          : 90,
      frameSrc: screenshot,
      frameId: `FRAME_CAP_${nowTimestamp().replace(/:/g, "")}`,
      vlmAnalysis: [watchResult.description],
    });
    setThreatOpen(true);
  }, [watchResult, threatOpen, detections]);

  // ── Camera event handlers ─────────────────────────────────────────────────
  const handleUserMedia = useCallback(() => {
    setCameraError(null);
    setIsCameraReady(true);
    setLogEntries((prev) => [
      ...prev,
      {
        id: uid(),
        timestamp: nowTimestamp(),
        source: "SYS",
        message: `· Camera ${PRIMARY_CAM_ID} online.`,
      },
    ]);
  }, []);

  const handleCameraError = useCallback(() => {
    setCameraError("Camera access denied or unavailable.");
    setIsCameraReady(false);
  }, []);

  const toggleWatch = useCallback(() => {
    setIsWatchActive((v) => {
      const next = !v;
      setLogEntries((prev) => [
        ...prev,
        {
          id: uid(),
          timestamp: nowTimestamp(),
          source: "SYS",
          message: next ? "· VLM_WATCH activated." : "· VLM_WATCH deactivated.",
        },
      ]);
      return next;
    });
  }, []);

  // ── VLM status chip colour ─────────────────────────────────────────────────
  const vlmChipColor: Record<VlmStatus, string> = {
    NOMINAL: "text-op-silver",
    ANALYZING: "text-op-warning",
    THREAT: "text-op-critical",
    OFFLINE: "text-op-text-sec",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-op-base">
      {/* TopNav provided by AppShell (centralised) */}

      {/* ── Main content ── */}
      <main className="flex flex-1 flex-col gap-2 overflow-hidden p-2">
        {/* ── TOP ROW: Feeds ── */}
        <div className="flex min-h-0 flex-1 gap-2">
          {/* Primary feed (60%) */}
          <div className="flex w-[60%] flex-col overflow-hidden rounded-sm border border-op-border bg-op-surface">
            {/* Feed header */}
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-op-border bg-op-surface px-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-op-text-sec">
                  videocam
                </span>
                <MonoLabel variant="silver">{PRIMARY_CAM_ID}</MonoLabel>
              </div>
              {/* Camera device selector */}
              {devices.length > 0 && (
                <select
                  value={selectedDeviceId ?? ""}
                  onChange={handleDeviceChange}
                  disabled={isLoadingDevices}
                  className="mx-2 flex-1 max-w-[200px] truncate border border-op-border bg-op-base px-1.5 py-0.5 font-mono text-[10px] text-op-silver outline-none"
                >
                  {isLoadingDevices ? (
                    <option>Loading…</option>
                  ) : (
                    <>
                      <option value="">SELECT_CAMERA</option>
                      {devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              )}
              <div className="flex items-center gap-1.5">
                {isCameraReady && (
                  <>
                    <StatusDot variant="silver" pulse size="xs" />
                    <MonoLabel variant="silver">LIVE</MonoLabel>
                  </>
                )}
                {cameraError && (
                  <MonoLabel variant="critical">NO_SIGNAL</MonoLabel>
                )}
              </div>
            </div>

            {/* Video area */}
            <div className="group relative flex-1 bg-black">
              {/* [2] DETECTION_OVERLAY: Webcam + OverlayCanvas */}
              <Webcam
                ref={webcamRef}
                width={VIDEO_W}
                height={VIDEO_H}
                screenshotFormat="image/jpeg"
                videoConstraints={
                  selectedDeviceId
                    ? {
                        width: VIDEO_W,
                        height: VIDEO_H,
                        deviceId: { exact: selectedDeviceId },
                      }
                    : { width: VIDEO_W, height: VIDEO_H }
                }
                onUserMedia={handleUserMedia}
                onUserMediaError={handleCameraError}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  opacity: 0.85,
                  filter: "grayscale(30%)",
                }}
              />

              {/* [2] DETECTION_OVERLAY: canvas overlay for bounding boxes */}
              {isCameraReady && frameDimensions && (
                <OverlayCanvas
                  webcamRef={cameraSourceRef}
                  detections={detections}
                  frameDimensions={frameDimensions}
                  detectionModel="rfdetr"
                />
              )}

              {/* Camera offline / error state */}
              {!isCameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined animate-pulse text-[40px] text-op-border">
                      videocam
                    </span>
                    <MonoLabel>CONNECTING…</MonoLabel>
                  </div>
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-[40px] text-op-critical">
                      videocam_off
                    </span>
                    <MonoLabel variant="critical">NO_SIGNAL</MonoLabel>
                    <span className="font-mono text-[10px] text-op-text-sec">
                      {cameraError}
                    </span>
                  </div>
                </div>
              )}

              {/* VLM status chip */}
              <div className="absolute bottom-3 right-3 flex items-center gap-2 border border-op-border bg-op-elevated px-2 py-1">
                <span className="material-symbols-outlined text-[14px] text-op-text-sec">
                  neurology
                </span>
                <div className="flex flex-col">
                  <MonoLabel size="2xs">VLM_ANALYSIS</MonoLabel>
                  <MonoLabel size="xs" className={vlmChipColor[vlmStatus]}>
                    {vlmStatus}
                  </MonoLabel>
                </div>
              </div>

              {/* Detect latency chip */}
              {detectLatency !== null && (
                <div className="absolute bottom-3 left-3 border border-op-border bg-op-elevated px-2 py-1">
                  <MonoLabel size="xs">
                    {isDetectProcessing
                      ? "INFERRING…"
                      : `${detectLatency.toFixed(0)}ms`}
                  </MonoLabel>
                </div>
              )}
            </div>
          </div>

          {/* Camera grid (40%) — 2×2 mini feeds */}
          <div className="grid w-[40%] min-h-0 grid-cols-2 grid-rows-2 gap-2">
            {MINI_CAMERAS.map((cam) => (
              <MiniCameraCell key={cam.id} label={cam.label} />
            ))}
          </div>
        </div>

        {/* ── BOTTOM ROW: Panels ── */}
        <div className="flex h-48 shrink-0 gap-2">
          {/* Intel Stream panel */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-sm border border-op-border bg-op-surface">
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-op-border bg-op-surface px-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-op-text-sec">
                  terminal
                </span>
                <MonoLabel>INTEL_STREAM</MonoLabel>
              </div>
              <MonoLabel>AUTO_SCROLL: ON</MonoLabel>
            </div>

            <div className="flex-1 overflow-y-auto bg-op-base/20 p-3">
              <IntelLog>
                {logEntries.map((entry, _i) => (
                  <IntelLogEntry
                    key={entry.id}
                    timestamp={entry.timestamp}
                    source={entry.source}
                    message={entry.message}
                    dimmed={entry.dimmed}
                  />
                ))}
                {/* Live cursor */}
                <IntelLogEntry timestamp="" source="" message="" cursor />
              </IntelLog>
            </div>
          </div>

          {/* Active Detections panel */}
          <div className="flex w-[30%] flex-col overflow-hidden rounded-sm border border-op-border bg-op-surface">
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-op-border bg-op-surface px-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-op-text-sec">
                  frame_inspect
                </span>
                <MonoLabel>ACTIVE_DETECTIONS</MonoLabel>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2 p-3">
              <DetectionRow
                icon="person"
                label="PERSON"
                count={personCount}
                active={personCount > 0}
              />
              <DetectionRow
                icon="directions_car"
                label="VEHICLE"
                count={vehicleCount}
                active={vehicleCount > 0}
              />
              <DetectionRow
                icon="warning_circle"
                label="ANOMALY"
                count={anomalyCount}
                active={anomalyCount > 0}
              />

              {/* System load */}
              <div className="mt-auto">
                <div className="mb-1 flex items-end justify-between">
                  <MonoLabel>SYSTEM_LOAD</MonoLabel>
                  <MonoLabel variant="silver">{systemLoad}%</MonoLabel>
                </div>
                <ConfidenceBar
                  value={systemLoad}
                  showLabel={false}
                  variant="silver"
                />
              </div>

              <Link
                className="mt-3 inline-flex items-center gap-2 border-t border-op-border pt-3 font-mono text-[10px] uppercase tracking-widest text-op-text-sec transition-colors hover:text-op-silver"
                href="/settings/threat-log"
              >
                <span className="material-symbols-outlined text-[14px]">
                  open_in_new
                </span>
                View Threat Log
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* ── Threat Modal ── */}
      {threatData && (
        <ThreatModal
          open={threatOpen}
          threatId={threatData.threatId}
          cameraId={threatData.cameraId}
          timestamp={threatData.timestamp}
          classification={threatData.classification}
          confidence={threatData.confidence}
          frameSrc={threatData.frameSrc}
          frameId={threatData.frameId}
          vlmAnalysis={threatData.vlmAnalysis}
          onDismiss={() => setThreatOpen(false)}
          onFlag={() => {
            setLogEntries((prev) => [
              ...prev,
              {
                id: uid(),
                timestamp: nowTimestamp(),
                source: "OPR",
                message: `· Threat ${threatData.threatId} flagged for review.`,
              },
            ]);
            setThreatOpen(false);
          }}
          onAcknowledge={() => {
            setLogEntries((prev) => [
              ...prev,
              {
                id: uid(),
                timestamp: nowTimestamp(),
                source: "OPR",
                message: `· Threat ${threatData.threatId} acknowledged.`,
              },
            ]);
            setThreatOpen(false);
          }}
          onDispatch={() => {
            setLogEntries((prev) => [
              ...prev,
              {
                id: uid(),
                timestamp: nowTimestamp(),
                source: "OPR",
                message: `· DISPATCH initiated for ${threatData.threatId}.`,
              },
            ]);
            setThreatOpen(false);
          }}
        />
      )}
    </div>
  );
}
