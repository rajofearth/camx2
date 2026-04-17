"use client";

import * as React from "react";

const STORAGE_KEY = "camx2.threat-log";
const STORE_EVENT = "camx2:threat-log-updated";
const MAX_ENTRIES = 250;

type ThreatSeverity = "critical" | "warning" | "nominal";
type ThreatStatus = "ACTIVE" | "ACKNOWLEDGED" | "ESCALATED" | "FALSE_POSITIVE";

interface ThreatVerificationSnapshot {
  applied: boolean;
  matchesPrompt: boolean | null;
  overturned: boolean;
  reason: string | null;
  modelKey: string | null;
  latencyMs: number | null;
}

interface ThreatLogEntry {
  id: string;
  requestId: string;
  timestamp: string;
  cameraId: string;
  classification: string;
  classKey: string;
  confidence: number;
  severity: ThreatSeverity;
  previewText: string;
  frameSrc: string | null;
  frameId: string | null;
  vlmAnalysis: string[];
  verification: ThreatVerificationSnapshot;
  status: ThreatStatus;
  tags: string[];
  updatedAt: string;
}

interface ThreatLogDraft {
  requestId: string;
  timestamp: string;
  cameraId: string;
  classification: string;
  confidence: number;
  previewText: string;
  frameSrc?: string | null;
  frameId?: string | null;
  vlmAnalysis: string[];
  verification: ThreatVerificationSnapshot;
  tags?: string[];
}

function buildStoredEntry(value: unknown): ThreatLogEntry | null {
  if (typeof value !== "object" || value === null) return null;

  const entry = value as Record<string, unknown>;

  if (
    typeof entry.id !== "string" ||
    typeof entry.requestId !== "string" ||
    typeof entry.timestamp !== "string" ||
    typeof entry.cameraId !== "string" ||
    typeof entry.classification !== "string" ||
    typeof entry.classKey !== "string" ||
    typeof entry.confidence !== "number" ||
    typeof entry.severity !== "string" ||
    typeof entry.previewText !== "string" ||
    !Array.isArray(entry.vlmAnalysis) ||
    typeof entry.status !== "string" ||
    !Array.isArray(entry.tags) ||
    typeof entry.updatedAt !== "string"
  ) {
    return null;
  }

  if (
    entry.severity !== "critical" &&
    entry.severity !== "warning" &&
    entry.severity !== "nominal"
  ) {
    return null;
  }

  if (
    entry.status !== "ACTIVE" &&
    entry.status !== "ACKNOWLEDGED" &&
    entry.status !== "ESCALATED" &&
    entry.status !== "FALSE_POSITIVE"
  ) {
    return null;
  }

  const verification = entry.verification;
  if (typeof verification !== "object" || verification === null) return null;

  const snapshot = verification as Record<string, unknown>;

  if (
    typeof snapshot.applied !== "boolean" ||
    typeof snapshot.overturned !== "boolean"
  ) {
    return null;
  }

  return {
    id: entry.id,
    requestId: entry.requestId,
    timestamp: entry.timestamp,
    cameraId: entry.cameraId,
    classification: entry.classification,
    classKey: entry.classKey,
    confidence: entry.confidence,
    severity: entry.severity,
    previewText: entry.previewText,
    frameSrc: typeof entry.frameSrc === "string" ? entry.frameSrc : null,
    frameId: typeof entry.frameId === "string" ? entry.frameId : null,
    vlmAnalysis: entry.vlmAnalysis.filter(
      (item): item is string => typeof item === "string",
    ),
    verification: {
      applied: snapshot.applied,
      matchesPrompt:
        typeof snapshot.matchesPrompt === "boolean"
          ? snapshot.matchesPrompt
          : null,
      overturned: snapshot.overturned,
      reason: typeof snapshot.reason === "string" ? snapshot.reason : null,
      modelKey:
        typeof snapshot.modelKey === "string" ? snapshot.modelKey : null,
      latencyMs:
        typeof snapshot.latencyMs === "number" ? snapshot.latencyMs : null,
    },
    status: entry.status,
    tags: entry.tags.filter((item): item is string => typeof item === "string"),
    updatedAt: entry.updatedAt,
  };
}

function readThreatLogEntries(): ThreatLogEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => buildStoredEntry(entry))
      .filter((entry): entry is ThreatLogEntry => entry !== null);
  } catch {
    return [];
  }
}

function writeThreatLogEntries(entries: ThreatLogEntry[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(STORE_EVENT));
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = () => callback();
  window.addEventListener("storage", handleChange);
  window.addEventListener(STORE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(STORE_EVENT, handleChange);
  };
}

function createId() {
  return `threat-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function classifySeverity(confidence: number): ThreatSeverity {
  if (confidence >= 90) return "critical";
  if (confidence >= 75) return "warning";
  return "nominal";
}

function createClassKey(classification: string) {
  return (
    classification
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "THREAT"
  );
}

function updateEntries(
  update: (current: ThreatLogEntry[]) => ThreatLogEntry[],
) {
  const current = readThreatLogEntries();
  const next = update(current);
  writeThreatLogEntries(next);
  return next;
}

export function appendThreatLogEntry(
  draft: ThreatLogDraft,
): ThreatLogEntry | null {
  let appended: ThreatLogEntry | null = null;

  updateEntries((current) => {
    if (current.some((entry) => entry.requestId === draft.requestId)) {
      return current;
    }

    appended = {
      id: createId(),
      requestId: draft.requestId,
      timestamp: draft.timestamp,
      cameraId: draft.cameraId,
      classification: draft.classification,
      classKey: createClassKey(draft.classification),
      confidence: draft.confidence,
      severity: classifySeverity(draft.confidence),
      previewText: draft.previewText,
      frameSrc: draft.frameSrc ?? null,
      frameId: draft.frameId ?? null,
      vlmAnalysis: draft.vlmAnalysis,
      verification: draft.verification,
      status: "ACTIVE",
      tags: draft.tags ?? [],
      updatedAt: nowIso(),
    };

    return [appended, ...current].slice(0, MAX_ENTRIES);
  });

  return appended;
}

export function updateThreatLogStatus(
  ids: string[],
  status: ThreatStatus,
): ThreatLogEntry[] {
  const targetIds = new Set(ids);

  return updateEntries((current) =>
    current.map((entry) =>
      targetIds.has(entry.id)
        ? { ...entry, status, updatedAt: nowIso() }
        : entry,
    ),
  );
}

export function useThreatLogEntries() {
  const [entries, setEntries] = React.useState<ThreatLogEntry[]>([]);
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    const sync = () => {
      setEntries(readThreatLogEntries());
      setIsHydrated(true);
    };

    sync();
    return subscribe(sync);
  }, []);

  return { entries, isHydrated };
}

export type {
  ThreatLogDraft,
  ThreatLogEntry,
  ThreatSeverity,
  ThreatStatus,
  ThreatVerificationSnapshot,
};
