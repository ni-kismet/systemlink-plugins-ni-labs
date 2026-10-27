/** Adds a value to a set stored under the given map key, creating the set if needed. */
export function addToMapSet(map: Map<string, Set<string>>, key: string, value: string): void {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(value);
}

/** Converts a map of string sets into a map of sorted string arrays. */
export function toSortedMap(source: Map<string, Set<string>>): Map<string, string[]> {
  const result = new Map<string, string[]>();
  source.forEach((values, key) => result.set(key, [...values].sort()));

  return result;
}
