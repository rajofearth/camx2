import type { ReactNode } from "react";
import { AnalysisShell } from "@/components/analysis/analysis-shell";
import { AnalysisSessionProvider } from "@/components/analysis/video-watch-session";

export default function AnalysisLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <AnalysisSessionProvider>
      <AnalysisShell>{children}</AnalysisShell>
    </AnalysisSessionProvider>
  );
}
