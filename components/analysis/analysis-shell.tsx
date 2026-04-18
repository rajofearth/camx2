"use client";

import type React from "react";
import { SubNav } from "@/components/shell";
import { useAnalysisSession } from "./video-watch-session";

export function AnalysisShell({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const { buildHref } = useAnalysisSession();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-op-base text-foreground">
      <SubNav
        items={[
          {
            href: buildHref("/analysis"),
            label: "VIDEO ANALYSIS",
            exact: true,
          },
          {
            href: buildHref("/analysis/query"),
            label: "AI QUERY",
            exact: true,
          },
        ]}
      />
      <main className="min-h-0 flex-1 overflow-hidden bg-op-base">
        {children}
      </main>
    </div>
  );
}
