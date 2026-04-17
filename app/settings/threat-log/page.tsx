"use client";

import Image from "next/image";
import * as React from "react";

import {
  type ThreatLogEntry,
  type ThreatStatus,
  updateThreatLogStatus,
  useThreatLogEntries,
} from "@/app/lib/threat-log-store";
import { PageHeader } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import {
  FilterBar,
  FilterClearButton,
  FilterDivider,
  FilterSearch,
} from "@/components/ui/filter-bar";
import { cn } from "@/lib/utils";

type DateRangeFilter = "ALL" | "24H" | "7D" | "30D";

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(",", "");
}

function matchesDateRange(timestamp: string, dateRange: DateRangeFilter) {
  if (dateRange === "ALL") return true;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;

  const now = Date.now();
  const diffMs = now - date.getTime();

  switch (dateRange) {
    case "24H":
      return diffMs <= 24 * 60 * 60 * 1000;
    case "7D":
      return diffMs <= 7 * 24 * 60 * 60 * 1000;
    case "30D":
      return diffMs <= 30 * 24 * 60 * 60 * 1000;
    default:
      return true;
  }
}

function getClassBadgeVariant(entry: ThreatLogEntry) {
  switch (entry.severity) {
    case "critical":
      return "outline-critical";
    case "warning":
      return "outline-warning";
    default:
      return "outline-nominal";
  }
}

function getStatusBadgeVariant(status: ThreatStatus) {
  switch (status) {
    case "ACTIVE":
      return "outline";
    case "ESCALATED":
      return "critical";
    case "FALSE_POSITIVE":
      return "muted";
    default:
      return "secondary";
  }
}

function exportAsCsv(entries: ThreatLogEntry[]) {
  const header = [
    "timestamp",
    "cameraId",
    "classKey",
    "classification",
    "confidence",
    "severity",
    "status",
    "previewText",
  ];

  const rows = entries.map((entry) => [
    entry.timestamp,
    entry.cameraId,
    entry.classKey,
    entry.classification,
    String(entry.confidence),
    entry.severity,
    entry.status,
    entry.previewText.replace(/\s+/g, " ").trim(),
  ]);

  const csv = [header, ...rows]
    .map((row) =>
      row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "camx2-threat-log.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function ThreatLogPage() {
  const { entries, isHydrated } = useThreatLogEntries();

  const [search, setSearch] = React.useState("");
  const [cameraFilter, setCameraFilter] = React.useState("ALL");
  const [dateRange, setDateRange] = React.useState<DateRangeFilter>("ALL");
  const [severityFilter, setSeverityFilter] = React.useState("ALL");
  const [classFilter, setClassFilter] = React.useState("ALL");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const sortedEntries = React.useMemo(
    () =>
      [...entries].sort(
        (left, right) =>
          new Date(right.timestamp).getTime() -
          new Date(left.timestamp).getTime(),
      ),
    [entries],
  );

  const cameraOptions = React.useMemo(
    () =>
      Array.from(new Set(sortedEntries.map((entry) => entry.cameraId))).sort(
        (left, right) => left.localeCompare(right),
      ),
    [sortedEntries],
  );

  const classOptions = React.useMemo(
    () =>
      Array.from(new Set(sortedEntries.map((entry) => entry.classKey))).sort(
        (left, right) => left.localeCompare(right),
      ),
    [sortedEntries],
  );

  const filteredEntries = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return sortedEntries.filter((entry) => {
      const matchesQuery =
        query.length === 0 ||
        entry.cameraId.toLowerCase().includes(query) ||
        entry.classKey.toLowerCase().includes(query) ||
        entry.classification.toLowerCase().includes(query) ||
        entry.previewText.toLowerCase().includes(query);

      const matchesCamera =
        cameraFilter === "ALL" || entry.cameraId === cameraFilter;
      const matchesClass =
        classFilter === "ALL" || entry.classKey === classFilter;
      const matchesSeverity =
        severityFilter === "ALL" ||
        entry.severity.toUpperCase() === severityFilter;

      return (
        matchesQuery &&
        matchesCamera &&
        matchesClass &&
        matchesSeverity &&
        matchesDateRange(entry.timestamp, dateRange)
      );
    });
  }, [
    cameraFilter,
    classFilter,
    dateRange,
    search,
    severityFilter,
    sortedEntries,
  ]);

  React.useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => filteredEntries.some((entry) => entry.id === id)),
    );
  }, [filteredEntries]);

  const allVisibleSelected =
    filteredEntries.length > 0 &&
    filteredEntries.every((entry) => selectedIds.includes(entry.id));

  const clearFilters = () => {
    setSearch("");
    setCameraFilter("ALL");
    setDateRange("ALL");
    setSeverityFilter("ALL");
    setClassFilter("ALL");
  };

  const handleBulkStatus = (status: ThreatStatus) => {
    if (selectedIds.length === 0) return;
    updateThreatLogStatus(selectedIds, status);
  };

  const handleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(filteredEntries.map((entry) => entry.id));
  };

  return (
    <>
      <PageHeader
        className="bg-op-surface"
        title="Threat Log"
        subtitle={
          <>
            SYS.LOG.0924 /{" "}
            <span className="text-op-silver">
              {filteredEntries.length.toLocaleString()}
            </span>{" "}
            RECORDS FOUND
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => exportAsCsv(filteredEntries)}
            >
              <span className="material-symbols-outlined">download</span>
              Export CSV
            </Button>
            <Button
              disabled={selectedIds.length === 0}
              onClick={() => handleBulkStatus("ACKNOWLEDGED")}
            >
              <span className="material-symbols-outlined">done_all</span>
              Mark Acknowledged
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-op-border bg-op-surface p-4">
          <FilterBar>
            <FilterSearch
              className="w-64 shrink-0"
              inputProps={{
                value: search,
                onChange: (event) => setSearch(event.target.value),
                placeholder: "Search VLM notes, ID...",
              }}
            />

            <FilterDivider />

            <select
              className="h-8 min-w-[140px] rounded-sm border border-op-border bg-op-base px-3 font-mono text-xs text-foreground outline-none focus:border-op-silver"
              onChange={(event) => setCameraFilter(event.target.value)}
              value={cameraFilter}
            >
              <option value="ALL">CAM: ALL</option>
              {cameraOptions.map((cameraId) => (
                <option key={cameraId} value={cameraId}>
                  CAM: {cameraId}
                </option>
              ))}
            </select>

            <select
              className="h-8 min-w-[160px] rounded-sm border border-op-border bg-op-base px-3 font-mono text-xs text-foreground outline-none focus:border-op-silver"
              onChange={(event) =>
                setDateRange(event.target.value as DateRangeFilter)
              }
              value={dateRange}
            >
              <option value="ALL">ALL TIME</option>
              <option value="24H">LAST 24 HOURS</option>
              <option value="7D">LAST 7 DAYS</option>
              <option value="30D">LAST 30 DAYS</option>
            </select>

            <select
              className="h-8 min-w-[140px] rounded-sm border border-op-border bg-op-base px-3 font-mono text-xs text-foreground outline-none focus:border-op-silver"
              onChange={(event) => setSeverityFilter(event.target.value)}
              value={severityFilter}
            >
              <option value="ALL">SEV: ALL</option>
              <option value="CRITICAL">SEV: CRITICAL</option>
              <option value="WARNING">SEV: WARNING</option>
              <option value="NOMINAL">SEV: NOMINAL</option>
            </select>

            <select
              className="h-8 min-w-[160px] rounded-sm border border-op-border bg-op-base px-3 font-mono text-xs text-foreground outline-none focus:border-op-silver"
              onChange={(event) => setClassFilter(event.target.value)}
              value={classFilter}
            >
              <option value="ALL">CLASS: ALL</option>
              {classOptions.map((classKey) => (
                <option key={classKey} value={classKey}>
                  CLASS: {classKey}
                </option>
              ))}
            </select>

            <div className="ml-auto">
              <FilterClearButton onClick={clearFilters} />
            </div>
          </FilterBar>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-op-base">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-20 border-b border-op-border bg-op-surface shadow-[0_1px_0_#1C1C1C]">
              <tr>
                <th className="w-10 p-3">
                  <input
                    checked={allVisibleSelected}
                    className="h-4 w-4 accent-[#C0C0C0]"
                    onChange={handleSelectAll}
                    type="checkbox"
                  />
                </th>
                {[
                  "Timestamp",
                  "Camera",
                  "Class",
                  "Confidence",
                  "VLM Preview",
                  "Status",
                ].map((label) => (
                  <th
                    key={label}
                    className="p-3 font-mono text-[10px] font-normal uppercase tracking-wider text-op-text-sec"
                  >
                    {label}
                  </th>
                ))}
                <th className="w-10 p-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-op-border font-mono text-xs">
              {filteredEntries.map((entry) => {
                const isExpanded = expandedId === entry.id;
                const isSelected = selectedIds.includes(entry.id);

                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      className={cn(
                        "transition-colors hover:bg-op-elevated",
                        entry.severity === "critical" &&
                          "border-l-2 border-l-op-critical",
                        isExpanded && "bg-op-elevated",
                      )}
                    >
                      <td className="p-3 align-top">
                        <input
                          checked={isSelected}
                          className="mt-0.5 h-4 w-4 accent-[#C0C0C0]"
                          onChange={() =>
                            setSelectedIds((current) =>
                              current.includes(entry.id)
                                ? current.filter((id) => id !== entry.id)
                                : [...current, entry.id],
                            )
                          }
                          type="checkbox"
                        />
                      </td>
                      <td className="p-3 align-top text-foreground">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="p-3 align-top text-op-silver">
                        {entry.cameraId}
                      </td>
                      <td className="p-3 align-top">
                        <Badge variant={getClassBadgeVariant(entry)}>
                          {entry.classKey}
                        </Badge>
                      </td>
                      <td className="p-3 align-top">
                        <ConfidenceBar
                          className="max-w-28"
                          value={entry.confidence}
                        />
                      </td>
                      <td className="max-w-xs truncate p-3 align-top font-sans text-xs text-foreground">
                        {entry.previewText}
                      </td>
                      <td className="p-3 align-top">
                        <Badge variant={getStatusBadgeVariant(entry.status)}>
                          {entry.status}
                        </Badge>
                      </td>
                      <td className="p-3 align-top text-right">
                        <button
                          className="text-op-text-sec hover:text-foreground"
                          onClick={() =>
                            setExpandedId((current) =>
                              current === entry.id ? null : entry.id,
                            )
                          }
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {isExpanded ? "expand_less" : "expand_more"}
                          </span>
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr
                        className={cn(
                          "border-b border-op-border bg-op-elevated",
                          entry.severity === "critical" &&
                            "border-l-2 border-l-op-critical",
                        )}
                      >
                        <td className="p-0" colSpan={8}>
                          <div className="flex gap-4 border-t border-op-border bg-op-surface p-4 pl-12">
                            <div className="relative h-36 w-64 shrink-0 overflow-hidden border border-op-border bg-op-base">
                              {entry.frameSrc ? (
                                <Image
                                  alt={`${entry.classKey} capture`}
                                  className="h-full w-full object-cover opacity-80 transition-opacity hover:opacity-100"
                                  height={144}
                                  src={entry.frameSrc}
                                  unoptimized
                                  width={256}
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center">
                                  <span className="material-symbols-outlined text-4xl text-op-text-muted">
                                    image
                                  </span>
                                </div>
                              )}

                              {entry.frameId && (
                                <div className="absolute bottom-2 left-2 border border-op-border bg-black/70 px-1.5 py-0.5 font-mono text-[9px] text-white">
                                  FRAME: {entry.frameId}
                                </div>
                              )}
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col border border-op-border bg-op-base p-3">
                              <div className="mb-2 flex items-center justify-between border-b border-op-border pb-2">
                                <span className="font-mono text-[10px] text-op-text-sec">
                                  VLM ANALYSIS STREAM | VERIFIED WATCH
                                </span>
                                <button
                                  className="text-[10px] text-op-silver hover:underline"
                                  onClick={() =>
                                    void navigator.clipboard?.writeText(
                                      entry.vlmAnalysis.join("\n"),
                                    )
                                  }
                                  type="button"
                                >
                                  COPY RAW
                                </button>
                              </div>

                              <div className="max-h-24 overflow-y-auto pr-2 text-sm leading-relaxed text-foreground">
                                {entry.vlmAnalysis.length === 0 ? (
                                  <p>
                                    No analysis lines were captured for this
                                    threat.
                                  </p>
                                ) : (
                                  entry.vlmAnalysis.map((line, index) => (
                                    <p key={`${entry.id}-${index}`}>{line}</p>
                                  ))
                                )}
                              </div>

                              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                                {entry.tags.map((tag) => (
                                  <Badge key={tag} variant="muted">
                                    TAG: {tag}
                                  </Badge>
                                ))}
                                {entry.verification.reason && (
                                  <Badge variant="outline">
                                    VERIFY: {entry.verification.reason}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="flex w-36 flex-col gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  updateThreatLogStatus(
                                    [entry.id],
                                    "ACKNOWLEDGED",
                                  )
                                }
                              >
                                Acknowledge
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateThreatLogStatus([entry.id], "ESCALATED")
                                }
                              >
                                Escalate Alert
                              </Button>
                              <Button
                                className="mt-auto"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  updateThreatLogStatus(
                                    [entry.id],
                                    "FALSE_POSITIVE",
                                  )
                                }
                              >
                                False Positive
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {!isHydrated && (
                <tr>
                  <td
                    className="p-6 font-mono text-xs text-op-text-sec"
                    colSpan={8}
                  >
                    Loading persisted threat records...
                  </td>
                </tr>
              )}

              {isHydrated && filteredEntries.length === 0 && (
                <tr>
                  <td className="p-10" colSpan={8}>
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="material-symbols-outlined text-4xl text-op-text-muted">
                        gpp_bad
                      </span>
                      <p className="font-mono text-xs text-op-text-sec">
                        No threat log entries match the current filters yet.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex h-6 items-center justify-between border-t border-op-border bg-op-base px-4">
          <span className="font-mono text-[9px] text-op-text-sec">
            SYS: ONLINE | DB: LOCAL_PERSISTED
          </span>
          <span className="font-mono text-[9px] text-op-text-sec">
            SHOWING {filteredEntries.length} OF {entries.length}
          </span>
        </footer>
      </div>
    </>
  );
}
