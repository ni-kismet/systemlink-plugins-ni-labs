/** Collects a sorted union of all property keys from a collection of objects with a `properties` field. */
export function collectPropertyKeys<T extends { properties: Record<string, unknown> | null }>(
  items: T[],
): string[] {
  const keys = new Set<string>();
  for (const item of items) {
    if (item.properties) {
      Object.keys(item.properties).forEach((key) => keys.add(key));
    }
  }

  return [...keys].sort();
}
