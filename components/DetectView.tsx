"use client";

import type React from "react";
import { useState } from "react";
import { SITE_NAME, SITE_TAGLINE } from "@/app/lib/branding";
import type { WatchResult } from "@/app/lib/watch-types";
import { AlertPopup } from "./AlertPopup";
import { CameraCard } from "./CameraCard";
import { useRouteActivity } from "./RouteActivityProvider";
import { SiteNav } from "./SiteNav";

export function DetectView(): React.JSX.Element {
  const [alertData, setAlertData] = useState<{
    watchResult: WatchResult;
    cameraLabel: string;
  } | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const { isCameraPaused } = useRouteActivity();

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
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[14px] overflow-y-auto p-5">
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
        <div className="grid w-full max-w-[1400px] grid-cols-1 gap-[14px] sm:grid-cols-2">
          <CameraCard
            cameraIndex={0}
            label="Camera 1"
            isPaused={isCameraPaused}
            onHarmDetected={handleHarmDetected}
          />
          <CameraCard
            cameraIndex={1}
            label="Camera 2"
            isPaused={isCameraPaused}
            onHarmDetected={handleHarmDetected}
          />
          <CameraCard
            cameraIndex={2}
            label="Camera 3"
            isPaused={isCameraPaused}
            onHarmDetected={handleHarmDetected}
          />
          <CameraCard
            cameraIndex={3}
            label="Camera 4"
            isPaused={isCameraPaused}
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
