"use client";

import type React from "react";
import { NavAvatar, NavIconButton, SubNav, TopNav } from "@/components/shell";
import { useAnalysisSession } from "./video-watch-session";

export function AnalysisShell({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const { buildHref } = useAnalysisSession();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-op-base text-foreground">
      <TopNav
        items={[
          { href: "/monitor", label: "LIVE MONITOR" },
          { href: "/analysis", label: "ANALYSIS & QUERY", exact: false },
          { href: "/settings/camera-management", label: "SETTINGS", exact: false },
        ]}
        actions={
          <>
            <NavIconButton icon="notifications" badge />
            <NavIconButton icon="sensors" />
            <div className="ml-1">
              <NavAvatar />
            </div>
          </>
        }
      />
      <SubNav
        items={[
          { href: buildHref("/analysis"), label: "VIDEO ANALYSIS", exact: true },
          {
            href: buildHref("/analysis/query"),
            label: "AI QUERY",
            exact: true,
          },
        ]}
      />
      <main className="min-h-0 flex-1 overflow-hidden bg-op-base">{children}</main>
    </div>
  );
}
