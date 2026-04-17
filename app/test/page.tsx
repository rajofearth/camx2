'use client'

import { TopNav, NavAvatar, NavIconButton } from "@/components/shell";
import {
  Panel,
  PanelHeader,
  PanelLabel,
  PanelContent,
} from "@/components/ui/panel";
import { StatusDot } from "@/components/ui/status-dot";
import { BoundingBox } from "@/components/ui/bounding-box";
import { CameraFeed } from "@/components/camera";
import { ThreatModal } from "@/components/threat";
import { useState } from "react";

export default function ComponentShowcasePage() {
  const [threatOpen, setThreatOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen">
      <TopNav
        actions={
          <div className="flex items-center gap-2">
            <NavIconButton icon="alert" onClick={() => setThreatOpen(true)} />
            <NavAvatar />
          </div>
        }
      />
      <main className="flex-1 overflow-auto bg-muted">
        <Panel>
          <PanelHeader>
            <PanelLabel>Component Showcase</PanelLabel>
          </PanelHeader>
          <PanelContent>
            {/* CameraFeed demo */}
            <div>
              <div className="mb-2 font-mono text-xs text-muted-foreground">
                CameraFeed components
              </div>
              <div className="flex gap-6 mb-8 flex-wrap">
                <CameraFeed cameraId="1" />
                <CameraFeed cameraId="2" />
                <CameraFeed cameraId="3" />
              </div>
            </div>

            {/* StatusDot demo */}
            <div>
              <div className="mb-2 font-mono text-xs text-muted-foreground">
                StatusDot variants & sizes
              </div>
              <div className="flex flex-wrap items-center gap-8 mb-8">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted-foreground">nominal</span>
                  <StatusDot variant="nominal" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted-foreground">warning</span>
                  <StatusDot variant="warning" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted-foreground">critical</span>
                  <StatusDot variant="critical" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted-foreground">silver</span>
                  <StatusDot variant="silver" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted-foreground">muted</span>
                  <StatusDot variant="muted" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted-foreground">pulse</span>
                  <StatusDot variant="critical" pulse />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted-foreground">lg</span>
                  <StatusDot variant="nominal" size="lg" />
                </div>
              </div>
            </div>

            {/* BoundingBox demo */}
            <div>
              <div className="mb-2 font-mono text-xs text-muted-foreground">
                BoundingBox examples
              </div>
              <div className="relative h-60 w-full border rounded bg-background">
                <BoundingBox
                  variant="nominal"
                  label="Person"
                  style={{
                    position: "absolute",
                    top: 24,
                    left: 40,
                    width: 120,
                    height: 90,
                  }}
                />
                <BoundingBox
                  variant="warning"
                  label="Suspicious bag"
                  style={{
                    position: "absolute",
                    top: 110,
                    left: 190,
                    width: 90,
                    height: 60,
                  }}
                />
                <BoundingBox
                  variant="critical"
                  label="Threat"
                  crosshair
                  style={{
                    position: "absolute",
                    top: 60,
                    left: 310,
                    width: 100,
                    height: 100,
                  }}
                />
              </div>
            </div>

            {/* ThreatModal demo trigger */}
            <div className="mt-10">
              <button
                className="px-4 py-2 font-mono rounded bg-op-critical text-white hover:bg-op-critical/80 transition"
                onClick={() => setThreatOpen(true)}
              >
                Show Threat Modal
              </button>
            </div>
          </PanelContent>
        </Panel>
        <ThreatModal open={threatOpen} onDismiss={() => setThreatOpen(false)} onFlag={() => {}} onAcknowledge={() => {}} onDispatch={() => {}} threatId="1" cameraId="1" timestamp="2026-04-17T12:00:00Z" classification="Harm" confidence={0.95} frameSrc="https://via.placeholder.com/150" frameId="1" vlmAnalysis={["Harm detected"]} boundingBox={{ top: "100", left: "100", width: "100", height: "100" }} />
      </main>
    </div>
  );
}