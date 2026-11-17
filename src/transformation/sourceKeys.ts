/** Python str.strip() whitespace, matching the existing backend parser.
 * JS trim differs: it removes FEFF and does not remove 001C–001F or 0085.
 */
const backendWhitespace = new Set([
  ...Array.from({ length: 5 }, (_, index) => 0x09 + index),
  ...Array.from({ length: 5 }, (_, index) => 0x1c + index),
  0x85,
  0xa0,
  0x1680,
  ...Array.from({ length: 11 }, (_, index) => 0x2000 + index),
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x3000,
]);
export function trimBackendWhitespace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && backendWhitespace.has(value.charCodeAt(start))) start++;
  while (end > start && backendWhitespace.has(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
}
export function assertUniqueSourceFields(
  keys: string[],
  filename: string,
): void {
  const seen = new Set<string>();
  for (const name of keys) {
    const key = trimBackendWhitespace(name);
    if (seen.has(key))
      throw new Error(
        `Ambiguous source fields in ${filename}: multiple names normalize to ${JSON.stringify(key.slice(0, 80))}. Rename the conflicting fields before review.`,
      );
    seen.add(key);
  }
}
export function normalizeSourceRecord(
  record: Record<string, unknown>,
  filename: string,
): Record<string, unknown> {
  assertUniqueSourceFields(Object.keys(record), filename);
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      trimBackendWhitespace(key),
      value,
    ]),
  );
}
