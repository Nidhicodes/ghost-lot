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
 * Render sits behind Cloudflare, which overwrites cf-connecting-ip with the real client IP;
 * the first x-forwarded-for entry there is client-supplied. Vercel overwrites x-forwarded-for,
 * so the fallback is only trustworthy behind Vercel's proxy.
 */
export function clientKey(headers: Record<string, string | string[] | undefined>): string {
  const one = (name: string) => {
    const v = headers[name]
    return (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim() || undefined
  }
  return one('cf-connecting-ip') ?? one('x-forwarded-for') ?? 'unknown'
}
