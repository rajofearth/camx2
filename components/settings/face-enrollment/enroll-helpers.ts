import { customAlphabet, nanoid } from "nanoid";

import type { EnrollmentSubject, ThreatLevel } from "./types";

const nano = customAlphabet("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", 4);

export function generateRegistryUid(): string {
  return `UID_${nano()}-${nano().slice(0, 2)}`;
}

export function defaultWatchlistCode(level: ThreatLevel): string {
  switch (level) {
    case "critical":
      return "CRITICAL_LEVEL_V";
    case "high":
      return "HIGH_LEVEL_II";
    case "medium":
      return "MEDIUM_LEVEL_III";
    case "low":
      return "LOW_LEVEL_IV";
  }
}

export function formatAliasLine(aliasesCsv: string): string {
  const parts = aliasesCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return "AKA: —";
  }
  return `AKA: ${parts.join(", ")}`;
}

export function formatAliasesDetail(aliasesCsv: string): string {
  return aliasesCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ")
    .toUpperCase();
}

export function parseCrimeCategories(raw: string): string[] {
  return raw
    .split(/[,|]/)
    .map((s) => s.trim().toUpperCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

export function buildEnrollmentSubjectFromForm(input: {
  name: string;
  aliases: string;
  threatLevel: ThreatLevel;
  confidence: number;
  heightCm: number;
  weightKg: number;
  crimeCategories: string;
  watchlistCode: string;
  lastSeen: string;
  imageUrl: string;
  imageAlt: string;
}): EnrollmentSubject {
  const id = nanoid();
  const uid = generateRegistryUid();
  const cats = parseCrimeCategories(input.crimeCategories);

  return {
    id,
    uid,
    name: input.name.trim(),
    aliasLine: formatAliasLine(input.aliases),
    threatLevel: input.threatLevel,
    confidence: input.confidence,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    crimeCategories: cats.length > 0 ? cats : ["UNSPECIFIED"],
    imageUrl: input.imageUrl,
    imageAlt: input.imageAlt.trim() || "Enrolled subject portrait",
    watchlistCode:
      input.watchlistCode.trim() || defaultWatchlistCode(input.threatLevel),
    aliasesDetail: formatAliasesDetail(input.aliases) || "—",
    lastSeen: input.lastSeen.trim() || "NOT_ON_FILE",
  };
}
