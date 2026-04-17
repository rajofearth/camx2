"use client";

import * as React from "react";

import type { CameraDevice } from "@/app/hooks/useCameraDevices";

const STORAGE_KEY = "camx2.camera-settings";
const STORE_EVENT = "camx2:camera-settings-updated";

type CameraSourceType = "device" | "network";

interface CameraSettingsRecord {
  id: string;
  cameraId: string;
  name: string;
  location: string;
  zone: string;
  sourceType: CameraSourceType;
  sourceKey: string;
  sourceUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CameraDraft {
  cameraId: string;
  name: string;
  location: string;
  zone: string;
  sourceUrl: string;
  enabled: boolean;
}

interface CameraSettingsRow extends CameraSettingsRecord {
  deviceLabel: string | null;
  isDetected: boolean;
  liveStatus: "active" | "offline" | "disabled";
  sourceDisplay: string;
}

interface UseCameraSettingsResult {
  rows: CameraSettingsRow[];
  isHydrated: boolean;
  createNetworkCamera: (draft: CameraDraft) => CameraSettingsRecord;
  updateCamera: (id: string, draft: CameraDraft) => CameraSettingsRecord | null;
  toggleEnabled: (id: string) => CameraSettingsRecord | null;
}

function buildStorageRecord(value: unknown): CameraSettingsRecord | null {
  if (typeof value !== "object" || value === null) return null;

  const entry = value as Record<string, unknown>;

  if (
    typeof entry.id !== "string" ||
    typeof entry.cameraId !== "string" ||
    typeof entry.name !== "string" ||
    typeof entry.location !== "string" ||
    typeof entry.zone !== "string" ||
    typeof entry.sourceType !== "string" ||
    typeof entry.sourceKey !== "string" ||
    typeof entry.sourceUrl !== "string" ||
    typeof entry.enabled !== "boolean" ||
    typeof entry.createdAt !== "string" ||
    typeof entry.updatedAt !== "string"
  ) {
    return null;
  }

  if (entry.sourceType !== "device" && entry.sourceType !== "network") {
    return null;
  }

  return {
    id: entry.id,
    cameraId: entry.cameraId,
    name: entry.name,
    location: entry.location,
    zone: entry.zone,
    sourceType: entry.sourceType,
    sourceKey: entry.sourceKey,
    sourceUrl: entry.sourceUrl,
    enabled: entry.enabled,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function readCameraSettings(): CameraSettingsRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => buildStorageRecord(entry))
      .filter((entry): entry is CameraSettingsRecord => entry !== null);
  } catch {
    return [];
  }
}

function writeCameraSettings(records: CameraSettingsRecord[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(STORE_EVENT));
}

function sanitizeToken(value: string, fallback: string) {
  const token = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || fallback;
}

function formatDeviceCameraId(deviceId: string, index: number) {
  const token = sanitizeToken(
    deviceId.slice(0, 6),
    String(index + 1).padStart(3, "0"),
  );
  return `CAM-DEV-${token}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDefaultDeviceRecord(
  device: CameraDevice,
  index: number,
): CameraSettingsRecord {
  const timestamp = nowIso();
  return {
    id: `device:${device.deviceId}`,
    cameraId: formatDeviceCameraId(device.deviceId, index),
    name: device.label || `Camera ${index + 1}`,
    location: "Browser Device",
    zone: "Local",
    sourceType: "device",
    sourceKey: device.deviceId,
    sourceUrl: `device://${device.deviceId}`,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function syncDeviceRecords(
  current: CameraSettingsRecord[],
  devices: readonly CameraDevice[],
): CameraSettingsRecord[] {
  let changed = false;
  const knownDeviceIds = new Set(
    current
      .filter((record) => record.sourceType === "device")
      .map((record) => record.sourceKey),
  );
  const next = [...current];

  devices.forEach((device, index) => {
    if (knownDeviceIds.has(device.deviceId)) return;
    changed = true;
    next.push(buildDefaultDeviceRecord(device, index));
  });

  return changed ? next : current;
}

function buildCameraRows(
  records: CameraSettingsRecord[],
  devices: readonly CameraDevice[],
): CameraSettingsRow[] {
  const deviceMap = new Map(devices.map((device) => [device.deviceId, device]));

  return [...records]
    .map((record) => {
      const device =
        record.sourceType === "device"
          ? (deviceMap.get(record.sourceKey) ?? null)
          : null;
      const isDetected = device !== null;
      const liveStatus: CameraSettingsRow["liveStatus"] = !record.enabled
        ? "disabled"
        : record.sourceType === "device"
          ? isDetected
            ? "active"
            : "offline"
          : "offline";

      return {
        ...record,
        deviceLabel: device?.label ?? null,
        isDetected,
        liveStatus,
        sourceDisplay:
          record.sourceType === "device"
            ? `device://${record.sourceKey}`
            : record.sourceUrl,
      };
    })
    .sort((left, right) => left.cameraId.localeCompare(right.cameraId));
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

function updateStoredRecords(
  update: (current: CameraSettingsRecord[]) => CameraSettingsRecord[],
) {
  const current = readCameraSettings();
  const next = update(current);
  writeCameraSettings(next);
  return next;
}

export function useCameraSettings(
  devices: readonly CameraDevice[],
): UseCameraSettingsResult {
  const [records, setRecords] = React.useState<CameraSettingsRecord[]>([]);
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    const syncFromStorage = () => {
      setRecords(readCameraSettings());
      setIsHydrated(true);
    };

    syncFromStorage();
    return subscribe(syncFromStorage);
  }, []);

  React.useEffect(() => {
    if (!isHydrated) return;

    const next = syncDeviceRecords(records, devices);
    if (next === records) return;

    writeCameraSettings(next);
  }, [devices, isHydrated, records]);

  const rows = React.useMemo(
    () => buildCameraRows(records, devices),
    [devices, records],
  );

  const createNetworkCamera = React.useCallback((draft: CameraDraft) => {
    const timestamp = nowIso();
    const record: CameraSettingsRecord = {
      id: createId("network"),
      cameraId: sanitizeToken(draft.cameraId, "CAM-NET"),
      name: draft.name.trim(),
      location: draft.location.trim(),
      zone: draft.zone.trim(),
      sourceType: "network",
      sourceKey: createId("src"),
      sourceUrl: draft.sourceUrl.trim(),
      enabled: draft.enabled,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    updateStoredRecords((current) => [...current, record]);
    return record;
  }, []);

  const updateCamera = React.useCallback((id: string, draft: CameraDraft) => {
    let updated: CameraSettingsRecord | null = null;

    updateStoredRecords((current) =>
      current.map((record) => {
        if (record.id !== id) return record;

        updated = {
          ...record,
          cameraId: sanitizeToken(draft.cameraId, record.cameraId),
          name: draft.name.trim(),
          location: draft.location.trim(),
          zone: draft.zone.trim(),
          sourceUrl: draft.sourceUrl.trim(),
          enabled: draft.enabled,
          updatedAt: nowIso(),
        };

        return updated;
      }),
    );

    return updated;
  }, []);

  const toggleEnabled = React.useCallback((id: string) => {
    let updated: CameraSettingsRecord | null = null;

    updateStoredRecords((current) =>
      current.map((record) => {
        if (record.id !== id) return record;

        updated = {
          ...record,
          enabled: !record.enabled,
          updatedAt: nowIso(),
        };

        return updated;
      }),
    );

    return updated;
  }, []);

  return {
    rows,
    isHydrated,
    createNetworkCamera,
    updateCamera,
    toggleEnabled,
  };
}

export type {
  CameraDraft,
  CameraSettingsRecord,
  CameraSettingsRow,
  CameraSourceType,
};
