import type { EnrollmentSubject } from "./types";

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Avoid megabyte data URLs in exported files */
function serializeImageUrl(url: string): string {
  if (url.startsWith("data:") && url.length > 256) {
    return "[EMBEDDED_IMAGE]";
  }
  return url;
}

const CSV_HEADER = [
  "id",
  "uid",
  "name",
  "aliasLine",
  "threatLevel",
  "confidence",
  "heightCm",
  "weightKg",
  "crimeCategories",
  "imageUrl",
  "imageAlt",
  "watchlistCode",
  "aliasesDetail",
  "lastSeen",
] as const;

export function exportEnrollmentSubjectsCsv(
  subjects: EnrollmentSubject[],
): void {
  const lines: string[] = [];
  lines.push(CSV_HEADER.join(","));

  for (const s of subjects) {
    const row = [
      s.id,
      s.uid,
      s.name,
      s.aliasLine,
      s.threatLevel,
      String(s.confidence),
      String(s.heightCm),
      String(s.weightKg),
      s.crimeCategories.join("|"),
      serializeImageUrl(s.imageUrl),
      s.imageAlt,
      s.watchlistCode,
      s.aliasesDetail,
      s.lastSeen,
    ].map(escapeCsvCell);
    lines.push(row.join(","));
  }

  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const a = document.createElement("a");
  a.href = url;
  a.download = `face-enrollment-registry_${stamp}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
