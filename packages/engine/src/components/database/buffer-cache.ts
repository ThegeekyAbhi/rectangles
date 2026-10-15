/**
 * The rows a database keeps in memory, evicting the least recently used once full.
 *
 * A `Map` iterates in insertion order, so deleting and re-adding a key moves it to the
 * most recent end and the first key is always the least recent: O(1) for every operation.
 */
export interface BufferCache {
  readonly capacity: number;
  readonly rows: Map<number, true>;
}

export function createBufferCache(capacity: number): BufferCache {
  return { capacity, rows: new Map() };
}

/**
 * Marks a row as just used. Returns whether it was already in memory; if it was not,
 * it is added, evicting the least recently used row when the cache is full.
 */
export function touchRow(cache: BufferCache, key: number): boolean {
  const { rows, capacity } = cache;
  if (rows.delete(key)) {
    rows.set(key, true);
    return true;
  }
  if (capacity === 0) {
    return false;
  }
  if (rows.size >= capacity) {
    const leastRecent = rows.keys().next();
    if (leastRecent.done !== true) {
      rows.delete(leastRecent.value);
    }
  }
  rows.set(key, true);
  return false;
}
