"use client";

/**
 * Live Monitor Page
 *
 * Displays the primary camera feed with detection overlays, a clickable camera
 * grid, a real-time intel stream log, and an active-detections summary panel.
 * The large left feed is always the currently promoted camera; clicking any
 * right-side tile promotes it and demotes the previous primary feed back into
 * the grid. Detection and watch only run against the primary feed.
 */

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCameraDevices } from "@/app/hooks/useCameraDevices";
import { useWebcamDetect } from "@/app/hooks/useWebcamDetect";
import { useWebcamWatch } from "@/app/hooks/useWebcamWatch";
import type { CameraSourceRef } from "@/app/lib/camera-source";
import { useCameraSettings } from "@/app/lib/camera-settings-store";
import { cocoClassName } from "@/app/lib/coco";
import { appendThreatLogEntry } from "@/app/lib/threat-log-store";
import type { Detection } from "@/app/lib/types";
import type { WatchResult } from "@/app/lib/watch-types";
import { OverlayCanvas } from "@/components/OverlayCanvas";
import { CameraStreamSurface } from "@/components/camera/camera-stream-surface";
import { ThreatModal } from "@/components/threat";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { IntelLog, IntelLogEntry, IntelTag } from "@/components/ui/intel-log";
import { MonoLabel } from "@/components/ui/mono-label";
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

const MINI_CAMERA_LIMIT = 4;
const MAX_LOG_ENTRIES = 50;

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
        · System initialised. <IntelTag>CAMERAS</IntelTag> registry active.
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

function appendLogEntry(
  entries: readonly LogEntry[],
  entry: LogEntry,
): LogEntry[] {
  return [...entries.slice(-(MAX_LOG_ENTRIES - 1)), entry];
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
  const cameraSourceRef = useRef<CameraSourceRef | null>(null);

  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isWatchActive] = useState(false);

  const { devices } = useCameraDevices();
  const { rows } = useCameraSettings(devices);
  const enabledCameras = useMemo(
    () => rows.filter((row) => row.enabled),
    [rows],
  );
  const [activeCameraKey, setActiveCameraKey] = useState<string | null>(null);

  useEffect(() => {
    if (enabledCameras.length === 0) {
      setActiveCameraKey(null);
      setIsCameraReady(false);
      setCameraError(null);
      return;
    }

    const hasActiveCamera = enabledCameras.some(
      (camera) => camera.id === activeCameraKey,
    );

    if (!hasActiveCamera) {
      setActiveCameraKey(enabledCameras[0]?.id ?? null);
    }
  }, [activeCameraKey, enabledCameras]);

  useEffect(() => {
    setIsCameraReady(false);
    setCameraError(null);
    cameraSourceRef.current = null;
  }, [activeCameraKey]);

  const activeCamera =
    enabledCameras.find((camera) => camera.id === activeCameraKey) ?? null;
  const activeCameraId = activeCamera?.cameraId ?? "NO_CAMERA";
  const gridCameras = enabledCameras
    .filter((camera) => camera.id !== activeCameraKey)
    .slice(0, MINI_CAMERA_LIMIT);

  const [logEntries, setLogEntries] = useState<LogEntry[]>(SEED_LOG);
  const intelStreamScrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = intelStreamScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logEntries]);
  const [threatOpen, setThreatOpen] = useState(false);
  const [threatData, setThreatData] = useState<ThreatState | null>(null);
  const [systemLoad, setSystemLoad] = useState(0);

  const {
    detections,
    lastLatency: detectLatency,
    isProcessing: isDetectProcessing,
    error: _detectError,
    frameDimensions,
  } = useWebcamDetect(cameraSourceRef, isCameraReady, { maxFps: 5 });

  const {
    latest: watchResult,
    lastMeta,
    lastRequestId,
    isProcessing: isWatchProcessing,
    error: _watchError,
  } = useWebcamWatch(cameraSourceRef, isCameraReady && isWatchActive);

  // ── [5] SESSION detection totals (per class, cumulative for this primary feed) ──
  const [sessionDetectionCounts, setSessionDetectionCounts] = useState<
    Map<string, number>
  >(() => new Map());

  useEffect(() => {
    setSessionDetectionCounts(new Map());
  }, [activeCameraKey]);

  useEffect(() => {
    if (!isCameraReady) return;
    const frameMap = aggregateDetections(detections);
    if (frameMap.size === 0) return;
    setSessionDetectionCounts((prev) => {
      const next = new Map(prev);
      for (const [label, n] of frameMap) {
        next.set(label, (next.get(label) ?? 0) + n);
      }
      return next;
    });
  }, [detections, isCameraReady]);

  const sessionCountsSorted = useMemo(() => {
    return [...sessionDetectionCounts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
  }, [sessionDetectionCounts]);

  // ── [6] VLM_STATUS ───────────────────────────────────────────────────────
  const vlmStatus = deriveVlmStatus(watchResult, isWatchProcessing);

  // ── Host CPU load (Next server process sees machine-wide CPU via os.cpus()) ──
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/system/cpu", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: unknown = await res.json();
        if (
          typeof data === "object" &&
          data !== null &&
          "load" in data &&
          typeof (data as { load: unknown }).load === "number"
        ) {
          setSystemLoad(
            Math.min(100, Math.max(0, Math.round((data as { load: number }).load))),
          );
        }
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 1600);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── [3] INTEL_LOG: push detection events ─────────────────────────────────
  const lastDetectionCountRef = useRef(0);
  const lastReadyCameraIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (detections.length === 0) return;
    if (detections.length === lastDetectionCountRef.current) return;
    lastDetectionCountRef.current = detections.length;

    const topDet = detections[0];
    if (!topDet) return;

    const label = classLabel(topDet.class);
    const conf = Math.round(topDet.confidence * 100);

    setLogEntries((prev) =>
      appendLogEntry(prev, {
        id: uid(),
        timestamp: nowTimestamp(),
        source: activeCameraId.slice(0, 6),
        message: (
          <>
            · <IntelTag>{label}</IntelTag> — detected at {conf}% confidence.
            {detections.length > 1 && ` +${detections.length - 1} more.`}
          </>
        ),
      }),
    );
  }, [activeCameraId, detections]);

  // ── [3] INTEL_LOG: push VLM watch events ─────────────────────────────────
  useEffect(() => {
    if (!watchResult) return;
    setLogEntries((prev) =>
      appendLogEntry(prev, {
        id: uid(),
        timestamp: nowTimestamp(),
        source: "VLM",
        message:
          watchResult.isHarm === true
            ? `· HARM DETECTED — ${watchResult.description ?? "No description."}`
            : "· Frame assessed. No threat identified.",
      }),
    );
  }, [watchResult]);

  const lastLoggedThreatRequestIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lastRequestId) return;
    if (lastLoggedThreatRequestIdRef.current === lastRequestId) return;
    if (!isVerifiedThreat(watchResult, lastMeta?.verification)) return;

    const screenshot = cameraSourceRef.current?.getScreenshot() ?? null;
    const verification = lastMeta?.verification ?? null;
    const description = watchResult?.description ?? "Verified threat detected.";
    const confidence =
      detections.length > 0
        ? Math.round(Math.max(...detections.map((d) => d.confidence)) * 100)
        : 90;

    appendThreatLogEntry({
      requestId: lastRequestId,
      timestamp: new Date().toISOString(),
      cameraId: activeCameraId,
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
    setLogEntries((prev) =>
      appendLogEntry(prev, {
        id: uid(),
        timestamp: nowTimestamp(),
        source: "SYS",
        message: (
          <>
            · Verified threat archived in <IntelTag>THREAT_LOG</IntelTag>.
          </>
        ),
      }),
    );
  }, [activeCameraId, detections, lastMeta, lastRequestId, watchResult]);

  // ── [4] THREAT_MODAL: trigger on harm ────────────────────────────────────
  useEffect(() => {
    if (watchResult?.isHarm !== true || !watchResult.description) return;
    if (threatOpen) return; // don't stack modals

    const screenshot = cameraSourceRef.current?.getScreenshot() ?? undefined;

    setThreatData({
      threatId: `THT-${uid().toUpperCase()}`,
      cameraId: activeCameraId,
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
  }, [activeCameraId, watchResult, threatOpen, detections]);

  // ── Camera event handlers ─────────────────────────────────────────────────
  const handlePrimaryReady = () => {
    setCameraError(null);
    setIsCameraReady(true);

    if (lastReadyCameraIdRef.current === activeCameraId) {
      return;
    }

    lastReadyCameraIdRef.current = activeCameraId;
    setLogEntries((prev) =>
      appendLogEntry(prev, {
        id: uid(),
        timestamp: nowTimestamp(),
        source: "SYS",
        message: `· Camera ${activeCameraId} online.`,
      }),
    );
  };

  const handlePrimaryError = (message: string) => {
    lastReadyCameraIdRef.current = null;
    setCameraError(message);
    setIsCameraReady(false);
  };

  const handlePromoteCamera = (cameraId: string) => {
    if (cameraId === activeCameraKey) return;
    lastReadyCameraIdRef.current = null;
    setActiveCameraKey(cameraId);
  };

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
          <div className="flex w-[60%] min-h-0">
            <CameraStreamSurface
              key={activeCamera?.id ?? "no-camera"}
              camera={activeCamera}
              error={cameraError}
              isPrimary
              isReady={isCameraReady}
              onError={handlePrimaryError}
              onReady={handlePrimaryReady}
              sourceRef={cameraSourceRef}
              overlays={
                <>
                  {isCameraReady && frameDimensions && (
                    <OverlayCanvas
                      webcamRef={cameraSourceRef}
                      detections={detections}
                      frameDimensions={frameDimensions}
                      detectionModel="rfdetr"
                    />
                  )}

                  {!isCameraReady && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined animate-pulse text-[40px] text-op-border">
                          videocam
                        </span>
                        <MonoLabel>
                          {activeCamera ? "CONNECTING…" : "NO_ENABLED_CAMERAS"}
                        </MonoLabel>
                      </div>
                    </div>
                  )}

                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
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

                  {detectLatency !== null && (
                    <div className="absolute bottom-3 left-3 border border-op-border bg-op-elevated px-2 py-1">
                      <MonoLabel size="xs">
                        {isDetectProcessing
                          ? "INFERRING…"
                          : `${detectLatency.toFixed(0)}ms`}
                      </MonoLabel>
                    </div>
                  )}
                </>
              }
            />
          </div>

          {/* Camera grid (40%) — clickable active streams */}
          <div className="grid w-[40%] min-h-0 grid-cols-2 grid-rows-2 gap-2">
            {gridCameras.map((camera) => (
              <CameraStreamSurface
                key={camera.id}
                camera={camera}
                isSelected={false}
                onSelect={handlePromoteCamera}
              />
            ))}
            {gridCameras.length < MINI_CAMERA_LIMIT &&
              Array.from({
                length: MINI_CAMERA_LIMIT - gridCameras.length,
              }).map((_, index) => (
                <CameraStreamSurface
                  key={"empty-mini-" + String(index)}
                  camera={null}
                />
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

            <div
              ref={intelStreamScrollRef}
              className="flex-1 overflow-y-auto bg-op-base/20 p-3"
            >
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
            setLogEntries((prev) =>
              appendLogEntry(prev, {
                id: uid(),
                timestamp: nowTimestamp(),
                source: "OPR",
                message: `· Threat ${threatData.threatId} flagged for review.`,
              }),
            );
            setThreatOpen(false);
          }}
          onAcknowledge={() => {
            setLogEntries((prev) =>
              appendLogEntry(prev, {
                id: uid(),
                timestamp: nowTimestamp(),
                source: "OPR",
                message: `· Threat ${threatData.threatId} acknowledged.`,
              }),
            );
            setThreatOpen(false);
          }}
          onDispatch={() => {
            setLogEntries((prev) =>
              appendLogEntry(prev, {
                id: uid(),
                timestamp: nowTimestamp(),
                source: "OPR",
                message: `· DISPATCH initiated for ${threatData.threatId}.`,
              }),
            );
            setThreatOpen(false);
          }}
        />
      )}
    </div>
  );
}
