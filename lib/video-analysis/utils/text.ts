export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function dedupeStrings(
  values: readonly string[],
  maxItems: number,
): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized) continue;
    out.add(normalized);
    if (out.size >= maxItems) break;
  }
  return Array.from(out);
}

export function tokenSimilarity(left: string, right: string): number {
  const tokenize = (input: string) =>
    new Set(
      input
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2),
    );

  const a = tokenize(left);
  const b = tokenize(right);
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  const union = a.size + b.size - overlap;
  return union === 0 ? 0 : overlap / union;
}
