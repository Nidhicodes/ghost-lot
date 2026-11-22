/**
 * Minimal key-value store for the findings cache and budget counters.
 * MemoryStore is for local dev and tests; production uses a shared KV (task 7.5), because
 * serverless instances do not share memory.
 */
export interface Store {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
  /** Atomically add `by` and return the new value. */
  incr(key: string, by?: number, ttlSeconds?: number): Promise<number>
}

export class MemoryStore implements Store {
  private readonly data = new Map<string, { value: unknown; expires: number }>()

  constructor(private readonly now = () => Date.now()) {}

  private live(key: string) {
    const e = this.data.get(key)
    if (e && e.expires <= this.now()) {
      this.data.delete(key)
      return undefined
    }
    return e
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.live(key)?.value as T) ?? null
  }

  async set<T>(key: string, value: T, ttlSeconds?: number) {
    this.data.set(key, { value, expires: ttlSeconds ? this.now() + ttlSeconds * 1000 : Infinity })
  }

  async incr(key: string, by = 1, ttlSeconds?: number) {
    const e = this.live(key)
    const value = ((e?.value as number) ?? 0) + by
    this.data.set(key, { value, expires: e?.expires ?? (ttlSeconds ? this.now() + ttlSeconds * 1000 : Infinity) })
    return value
  }
}
