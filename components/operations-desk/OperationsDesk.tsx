"use client";

import type React from "react";
import { useCallback, useState } from "react";
import { SITE_NAME, SITE_TAGLINE } from "@/app/lib/branding";
import { appendThreatLogEntry } from "@/app/lib/threat-log-store";
import { dedupeVlmAnalysisLines } from "@/app/lib/vlm-analysis-lines";
import type { VerifiedWatchThreatPayload } from "@/app/lib/watch-verification";
import { useRouteActivity } from "@/components/RouteActivityProvider";
import { ThreatModal } from "@/components/threat";
import { OperationsCameraCard } from "./OperationsCameraCard";
import { OperationsNav } from "./OperationsNav";

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function nowTimestampCompact(): string {
  return new Date()
    .toLocaleTimeString("en-GB", { hour12: false })
    .replace(/:/g, "");
}

interface ThreatModalState {
  threatId: string;
  cameraId: string;
  timestamp: string;
  classification: string;
  confidence: number;
  frameSrc?: string;
  frameId?: string;
  vlmAnalysis: string[];
}

/** Verified watch pipeline → threat log + modal (separate from legacy home detect view). */
export function OperationsDesk(): React.JSX.Element {
  const [threatOpen, setThreatOpen] = useState(false);
  const [threatData, setThreatData] = useState<ThreatModalState | null>(null);
  const { isCameraPaused } = useRouteActivity();

  const handleVerifiedThreat = useCallback(
    (payload: VerifiedWatchThreatPayload) => {
      const description =
        payload.watchResult.description ?? "Verified threat detected.";
      const verification = payload.verification;
      const vlmLines = dedupeVlmAnalysisLines([
        description,
        verification?.reason ?? "Verification confirmed the watch output.",
      ]);

      appendThreatLogEntry({
        requestId: payload.requestId,
        timestamp: new Date().toISOString(),
        cameraId: payload.cameraId,
        classification: description,
        confidence: payload.confidence,
        previewText: description,
        frameSrc: payload.frameSrc,
        frameId: `FRAME_CAP_${nowTimestampCompact()}`,
        vlmAnalysis: vlmLines,
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

      setThreatData({
        threatId: `THT-${uid().toUpperCase()}`,
        cameraId: payload.cameraId,
        timestamp: `${new Date().toISOString().replace("T", " ").slice(0, 19)}Z`,
        classification: description,
        confidence: payload.confidence,
        frameSrc: payload.frameSrc ?? undefined,
        frameId: `FRAME_CAP_${nowTimestampCompact()}`,
        vlmAnalysis: vlmLines,
      });
      setThreatOpen(true);
    },
    [],
  );

  return (
    <>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[14px] overflow-y-auto p-5">
        <OperationsNav />
        <header style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "-0.5px",
            }}
          >
            {SITE_NAME}{" "}
            <span className="text-sm font-normal opacity-70">operations</span>
          </div>
          <div style={{ fontSize: "14px", opacity: 0.8 }}>{SITE_TAGLINE}</div>
        </header>
        <div className="grid w-full max-w-[1400px] grid-cols-1 gap-[14px] sm:grid-cols-2">
          <OperationsCameraCard
            cameraIndex={0}
            label="Camera 1"
            isPaused={isCameraPaused}
            onVerifiedThreat={handleVerifiedThreat}
          />
          <OperationsCameraCard
            cameraIndex={1}
            label="Camera 2"
            isPaused={isCameraPaused}
            onVerifiedThreat={handleVerifiedThreat}
          />
          <OperationsCameraCard
            cameraIndex={2}
            label="Camera 3"
            isPaused={isCameraPaused}
            onVerifiedThreat={handleVerifiedThreat}
          />
          <OperationsCameraCard
            cameraIndex={3}
            label="Camera 4"
            isPaused={isCameraPaused}
            onVerifiedThreat={handleVerifiedThreat}
          />
        </div>
      </div>

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
          onFlag={() => setThreatOpen(false)}
          onAcknowledge={() => setThreatOpen(false)}
          onDispatch={() => setThreatOpen(false)}
        />
      )}
    </>
  );
}
