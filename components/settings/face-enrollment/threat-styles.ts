import type { ThreatLevel } from "./types";

/** Border / badge colors aligned with the static reference HTML */
export function getThreatAccent(level: ThreatLevel): {
  border: string;
  badge: string;
} {
  switch (level) {
    case "critical":
      return { border: "border-l-[#8B1A1A]", badge: "bg-[#8B1A1A]/80" };
    case "high":
      return { border: "border-l-[#A57C00]", badge: "bg-[#A57C00]/80" };
    case "medium":
      return { border: "border-l-[#1A3A28]", badge: "bg-[#1A3A28]/80" };
    case "low":
      return { border: "border-l-[#2E2E2E]", badge: "bg-[#2E2E2E]/80" };
  }
}

export function threatLabel(level: ThreatLevel): string {
  switch (level) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
  }
}

/** Detail bar watchlist line — emphasis by tier (matches reference palette) */
export function watchlistDetailClass(level: ThreatLevel): string {
  switch (level) {
    case "critical":
      return "text-op-critical";
    case "high":
      return "text-[#A57C00]";
    case "medium":
      return "text-[#1A3A28]";
    case "low":
      return "text-op-text-sec";
  }
}
