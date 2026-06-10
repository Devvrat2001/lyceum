/**
 * Compact count for card meta lines: 950 → "950", 3 200 → "3.2k".
 * Shared by the marketplace course cards and teacher cards.
 */
export function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}
