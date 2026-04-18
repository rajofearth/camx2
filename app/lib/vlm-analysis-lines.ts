/** Stable key fragment for React lists (FNV-1a 32-bit over UTF-16 code units). */
export function fnv1a32Hex(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/** Drop duplicate lines (same trimmed text) while preserving first occurrence order. */
export function dedupeVlmAnalysisLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const t = line.trim();
    if (t === "") continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(line);
  }
  return out;
}
