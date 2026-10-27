/** Converts an ISO datetime string to a numeric timestamp (ms since epoch). */
export function toTimestamp(isoString: string | null): number | undefined {
  if (!isoString) return undefined;
  const ts = new Date(isoString).getTime();

  return isNaN(ts) ? undefined : ts;
}
