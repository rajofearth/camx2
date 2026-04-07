"use client";

import type React from "react";
import { useState } from "react";
import { SITE_NAME, SITE_TAGLINE } from "@/app/lib/branding";
import type { WatchResult } from "@/app/lib/watch-types";
import { AlertPopup } from "./AlertPopup";
import { CameraCard } from "./CameraCard";
import { SiteNav } from "./SiteNav";

export function DetectView(): React.JSX.Element {
  const [alertData, setAlertData] = useState<{
    watchResult: WatchResult;
    cameraLabel: string;
  } | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const handleHarmDetected = (result: WatchResult, cameraLabel: string) => {
    setAlertData({ watchResult: result, cameraLabel });
    setIsAlertOpen(true);
  };

  const handleCloseAlert = () => {
    setIsAlertOpen(false);
    // Clear alert data after a short delay to allow animation
    setTimeout(() => {
      setAlertData(null);
    }, 300);
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          width: "100%",
          gap: "14px",
          padding: "20px",
          boxSizing: "border-box",
        }}
      >
        <SiteNav />
        <header style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "-0.5px",
            }}
          >
            {SITE_NAME}
          </div>
          <div style={{ fontSize: "14px", opacity: 0.8 }}>{SITE_TAGLINE}</div>
        </header>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "14px",
            width: "100%",
            maxWidth: "1400px",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <CameraCard
            cameraIndex={0}
            label="Camera 1"
            onHarmDetected={handleHarmDetected}
          />
          <CameraCard
            cameraIndex={1}
            label="Camera 2"
            onHarmDetected={handleHarmDetected}
          />
          <CameraCard
            cameraIndex={2}
            label="Camera 3"
            onHarmDetected={handleHarmDetected}
          />
          <CameraCard
            cameraIndex={3}
            label="Camera 4"
            onHarmDetected={handleHarmDetected}
          />
        </div>
      </div>

      <AlertPopup
        isOpen={isAlertOpen}
        watchResult={alertData?.watchResult ?? null}
        cameraLabel={alertData?.cameraLabel ?? ""}
        onClose={handleCloseAlert}
      />
    </>
  );
}
