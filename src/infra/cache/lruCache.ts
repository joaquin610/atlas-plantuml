/** In-memory cache that drops the least recently used entry when full. */
export class LruCache<V> {
  private readonly entries = new Map<string, V>();

  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      // Re-insert to mark as most recently used
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}
