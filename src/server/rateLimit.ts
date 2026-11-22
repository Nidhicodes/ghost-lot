/**
 * Fixed-window counter per client key. In-memory, so on Vercel it limits per function
 * instance only; the KV-backed version replaces it before launch (task 5.2).
 */
export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>()

  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now = () => Date.now()) {}

  /** Returns true if the request is allowed, and counts it. */
  allow(key: string): boolean {
    const t = this.now()
    const entry = this.hits.get(key)
    if (!entry || t - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: t, count: 1 })
      if (this.hits.size > 10_000) this.evict(t)
      return true
    }
    if (entry.count >= this.limit) return false
    entry.count++
    return true
  }

  private evict(t: number) {
    for (const [k, v] of this.hits) if (t - v.windowStart >= this.windowMs) this.hits.delete(k)
  }
}

/**
 * Vercel puts the real client IP first in x-forwarded-for. Outside Vercel the header is
 * client-controlled, so this is only trustworthy behind Vercel's proxy.
 */
export function clientKey(headers: Record<string, string | string[] | undefined>): string {
  const xff = headers['x-forwarded-for']
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim()
  return first || 'unknown'
}
