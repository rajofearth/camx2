"use client";

import * as React from "react";

import { useCameraDevices } from "@/app/hooks/useCameraDevices";
import {
  type CameraDraft,
  type CameraSettingsRow,
  useCameraSettings,
} from "@/app/lib/camera-settings-store";
import { PageHeader } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FilterBar,
  FilterClearButton,
  FilterSearch,
} from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { StatusIndicator } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

const emptyDraft: CameraDraft = {
  cameraId: "",
  name: "",
  location: "",
  zone: "",
  sourceUrl: "",
  enabled: true,
};

function getStatusLabel(status: CameraSettingsRow["liveStatus"]) {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "disabled":
      return "DISABLED";
    default:
      return "OFFLINE";
  }
}

function getStatusVariant(status: CameraSettingsRow["liveStatus"]) {
  switch (status) {
    case "active":
      return "nominal";
    case "disabled":
      return "inactive";
    default:
      return "critical";
  }
}

function buildDraft(row: CameraSettingsRow): CameraDraft {
  return {
    cameraId: row.cameraId,
    name: row.name,
    location: row.location,
    zone: row.zone,
    sourceUrl: row.sourceType === "device" ? row.sourceDisplay : row.sourceUrl,
    enabled: row.enabled,
  };
}

function CameraEditorDialog({
  title,
  description,
  sourceType,
  initialDraft,
  submittingLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  sourceType: "device" | "network";
  initialDraft: CameraDraft;
  submittingLabel: string;
  onClose: () => void;
  onSubmit: (draft: CameraDraft) => void;
}) {
  const [draft, setDraft] = React.useState<CameraDraft>(initialDraft);

  const updateField = (key: keyof CameraDraft, value: string | boolean) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const isValid =
    draft.cameraId.trim().length > 0 &&
    draft.name.trim().length > 0 &&
    draft.location.trim().length > 0 &&
    draft.zone.trim().length > 0 &&
    draft.sourceUrl.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl border border-op-border bg-op-surface shadow-2xl">
        <div className="border-b border-op-border px-5 py-4">
          <h2 className="text-lg font-medium text-foreground">{title}</h2>
          <p className="mt-1 font-mono text-xs text-op-text-sec">
            {description}
          </p>
        </div>

        <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              className="font-mono text-[10px] uppercase tracking-widest text-op-text-sec"
              htmlFor="camera-id-field"
            >
              Camera ID
            </label>
            <Input
              id="camera-id-field"
              onChange={(event) => updateField("cameraId", event.target.value)}
              placeholder="CAM-N-001"
              value={draft.cameraId}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="font-mono text-[10px] uppercase tracking-widest text-op-text-sec"
              htmlFor="camera-name-field"
            >
              Display Name
            </label>
            <Input
              id="camera-name-field"
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="North Gate Entry"
              value={draft.name}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="font-mono text-[10px] uppercase tracking-widest text-op-text-sec"
              htmlFor="camera-location-field"
            >
              Location
            </label>
            <Input
              id="camera-location-field"
              onChange={(event) => updateField("location", event.target.value)}
              placeholder="Gate 1 Exterior"
              value={draft.location}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="font-mono text-[10px] uppercase tracking-widest text-op-text-sec"
              htmlFor="camera-zone-field"
            >
              Zone
            </label>
            <Input
              id="camera-zone-field"
              onChange={(event) => updateField("zone", event.target.value)}
              placeholder="Perimeter"
              value={draft.zone}
            />
          </div>

          <div className="md:col-span-2 flex flex-col gap-1.5">
            <label
              className="font-mono text-[10px] uppercase tracking-widest text-op-text-sec"
              htmlFor="camera-source-field"
            >
              Source
            </label>
            <Input
              disabled={sourceType === "device"}
              id="camera-source-field"
              onChange={(event) => updateField("sourceUrl", event.target.value)}
              placeholder={
                sourceType === "device"
                  ? "Discovered browser camera"
                  : "rtsp://10.0.1.101:554/stream1"
              }
              value={draft.sourceUrl}
            />
            {sourceType === "device" && (
              <span className="font-mono text-[10px] text-op-text-sec">
                Browser-discovered devices keep their source binding and only
                expose metadata edits here.
              </span>
            )}
          </div>

          <label
            className="md:col-span-2 flex items-center justify-between border border-op-border bg-op-base px-3 py-2"
            htmlFor="camera-enabled-field"
          >
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-op-text-sec">
                Enabled
              </div>
              <div className="text-sm text-foreground">
                Keep this camera available for monitor and watch flows.
              </div>
            </div>
            <input
              checked={draft.enabled}
              className="h-4 w-4 accent-[#C0C0C0]"
              id="camera-enabled-field"
              onChange={(event) => updateField("enabled", event.target.checked)}
              type="checkbox"
            />
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-op-border px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!isValid} onClick={() => onSubmit(draft)}>
            {submittingLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CameraManagementPage() {
  const {
    devices,
    error,
    isLoading: isLoadingDevices,
    refreshDevices,
  } = useCameraDevices();
  const {
    rows,
    isHydrated,
    createNetworkCamera,
    toggleEnabled,
    updateCamera,
    deleteCamera,
  } = useCameraSettings(devices);

  const [search, setSearch] = React.useState("");
  const [zoneFilter, setZoneFilter] = React.useState("ALL");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [page, setPage] = React.useState(1);
  const [dialogMode, setDialogMode] = React.useState<"create" | "edit" | null>(
    null,
  );
  const [editingRow, setEditingRow] = React.useState<CameraSettingsRow | null>(
    null,
  );

  const zones = React.useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.zone))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [rows],
  );

  const filteredRows = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesQuery =
        query.length === 0 ||
        row.cameraId.toLowerCase().includes(query) ||
        row.name.toLowerCase().includes(query) ||
        row.location.toLowerCase().includes(query);

      const matchesZone = zoneFilter === "ALL" || row.zone === zoneFilter;
      const matchesStatus =
        statusFilter === "ALL" || row.liveStatus.toUpperCase() === statusFilter;

      return matchesQuery && matchesZone && matchesStatus;
    });
  }, [rows, search, statusFilter, zoneFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const activeCount = rows.filter((row) => row.liveStatus === "active").length;
  const offlineCount = rows.filter(
    (row) => row.liveStatus === "offline",
  ).length;
  const disabledCount = rows.filter(
    (row) => row.liveStatus === "disabled",
  ).length;

  const subtitle = (
    <>
      TOTAL SENSORS: <span className="text-op-silver">{rows.length}</span> |
      ACTIVE: <span className="text-op-silver">{activeCount}</span> | OFFLINE:{" "}
      <span className="text-op-critical">{offlineCount}</span>
      {disabledCount > 0 && (
        <>
          {" "}
          | DISABLED: <span className="text-op-text-sec">{disabledCount}</span>
        </>
      )}
    </>
  );

  const openCreateDialog = () => {
    setEditingRow(null);
    setDialogMode("create");
  };

  const openEditDialog = (row: CameraSettingsRow) => {
    setEditingRow(row);
    setDialogMode("edit");
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditingRow(null);
  };

  const clearFilters = () => {
    setSearch("");
    setZoneFilter("ALL");
    setStatusFilter("ALL");
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Camera Management"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="outline" onClick={() => void refreshDevices()}>
              <span className="material-symbols-outlined">refresh</span>
              Sync Status
            </Button>
            <Button onClick={openCreateDialog}>
              <span className="material-symbols-outlined">add</span>
              Add New Camera
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col p-6">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-op-border bg-op-surface">
          <div className="border-b border-op-border bg-op-surface px-4 py-2">
            <FilterBar className="border-none bg-transparent p-0">
              <FilterSearch
                className="w-64 shrink-0"
                inputProps={{
                  value: search,
                  onChange: (event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  },
                  placeholder: "Search by ID, name, or location...",
                }}
              />

              <select
                className="h-8 rounded-sm border border-op-border bg-op-base px-3 font-mono text-xs text-foreground outline-none focus:border-op-silver"
                onChange={(event) => {
                  setZoneFilter(event.target.value);
                  setPage(1);
                }}
                value={zoneFilter}
              >
                <option value="ALL">Zone: All</option>
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    Zone: {zone}
                  </option>
                ))}
              </select>

              <select
                className="h-8 rounded-sm border border-op-border bg-op-base px-3 font-mono text-xs text-foreground outline-none focus:border-op-silver"
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
                value={statusFilter}
              >
                <option value="ALL">Status: All</option>
                <option value="ACTIVE">Status: Active</option>
                <option value="OFFLINE">Status: Offline</option>
                <option value="DISABLED">Status: Disabled</option>
              </select>

              <div className="ml-auto">
                <FilterClearButton onClick={clearFilters} />
              </div>
            </FilterBar>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-op-surface shadow-[0_1px_0_#1C1C1C]">
                <tr>
                  {[
                    "Camera ID",
                    "Name",
                    "Location",
                    "Zone",
                    "Source URL",
                    "Status",
                    "Actions",
                  ].map((label, index) => (
                    <th
                      key={label}
                      className={cn(
                        "px-4 py-2 font-mono text-[10px] font-normal uppercase tracking-wider text-op-text-sec",
                        index === 4 && "hidden lg:table-cell",
                        index === 6 && "text-right",
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-op-border">
                {visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "group transition-colors hover:bg-op-elevated",
                      row.liveStatus === "offline" &&
                        "border-l-2 border-l-op-critical",
                      row.liveStatus === "active" &&
                        row.isDetected &&
                        "border-l-2 border-l-op-silver bg-op-elevated/60",
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {row.cameraId}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-foreground">{row.name}</div>
                      <div className="font-mono text-[10px] text-op-text-sec">
                        {row.deviceLabel ??
                          (row.sourceType === "network"
                            ? "Configured network source"
                            : "Detached browser device")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#A0A0A0]">
                      {row.location}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="muted">{row.zone}</Badge>
                    </td>
                    <td className="hidden max-w-65 truncate px-4 py-3 font-mono text-[10px] text-op-text-sec lg:table-cell">
                      {row.sourceDisplay}
                    </td>
                    <td className="px-4 py-3">
                      <StatusIndicator
                        variant={getStatusVariant(row.liveStatus)}
                      >
                        {getStatusLabel(row.liveStatus)}
                      </StatusIndicator>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="text-op-text-sec transition-colors hover:text-op-silver"
                        onClick={() => openEditDialog(row)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-sm">
                          edit
                        </span>
                      </button>
                      <button
                        className="ml-2 text-op-text-sec transition-colors hover:text-op-silver"
                        onClick={() => toggleEnabled(row.id)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-sm">
                          {row.enabled ? "power_settings_new" : "settings"}
                        </span>
                      </button>
                      <button
                        className="ml-2 text-op-text-sec transition-colors hover:text-op-critical"
                        onClick={() => deleteCamera(row.id)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-sm">
                          delete
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}

                {!isHydrated && (
                  <tr>
                    <td
                      className="px-4 py-8 font-mono text-xs text-op-text-sec"
                      colSpan={7}
                    >
                      Loading camera registry...
                    </td>
                  </tr>
                )}

                {isHydrated && visibleRows.length === 0 && (
                  <tr>
                    <td className="px-4 py-8" colSpan={7}>
                      <div className="flex flex-col items-center gap-2 text-center">
                        <span className="material-symbols-outlined text-3xl text-op-text-muted">
                          videocam_off
                        </span>
                        <p className="font-mono text-xs text-op-text-sec">
                          No cameras match the current filters.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-op-border bg-op-surface px-4 py-2 font-mono text-xs text-op-text-sec">
            <div>
              Showing{" "}
              {filteredRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}-
              {Math.min(safePage * PAGE_SIZE, filteredRows.length)} of{" "}
              {filteredRows.length} cameras
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                &lt; Prev
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={safePage >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                Next &gt;
              </Button>
            </div>
          </div>
        </div>

        {(error || isLoadingDevices) && (
          <div className="mt-3 flex items-center justify-between border border-op-border bg-op-surface px-4 py-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-op-text-sec">
              {isLoadingDevices
                ? "Refreshing browser camera devices..."
                : error}
            </span>
          </div>
        )}
      </div>

      {dialogMode === "create" && (
        <CameraEditorDialog
          description="Create a frontend-managed camera record for sources that do not have a backend integration yet."
          initialDraft={emptyDraft}
          onClose={closeDialog}
          onSubmit={(draft) => {
            createNetworkCamera(draft);
            closeDialog();
          }}
          sourceType="network"
          submittingLabel="Create Camera"
          title="Add New Camera"
        />
      )}

      {dialogMode === "edit" && editingRow && (
        <CameraEditorDialog
          description="Update display metadata while keeping the camera's current source binding intact."
          initialDraft={buildDraft(editingRow)}
          onClose={closeDialog}
          onSubmit={(draft) => {
            updateCamera(editingRow.id, draft);
            closeDialog();
          }}
          sourceType={editingRow.sourceType}
          submittingLabel="Save Changes"
          title={`Edit ${editingRow.cameraId}`}
        />
      )}
    </>
  );
}
