import type { Store } from './store'

export interface UpstashConfig {
  url: string
  token: string
}

/** Vercel's Upstash integration sets KV_REST_API_*; Upstash itself documents UPSTASH_REDIS_REST_*. */
export function upstashConfigFromEnv(env: Record<string, string | undefined> = process.env): UpstashConfig | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null
}

type Command = (string | number)[]

/** Store over the Upstash Redis REST pipeline API (https://upstash.com/docs/redis/features/restapi). */
export class UpstashStore implements Store {
  constructor(private readonly cfg: UpstashConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  private async pipeline(commands: Command[]): Promise<unknown[]> {
    const res = await this.fetchImpl(`${this.cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Upstash returned ${res.status}`)
    const out = (await res.json()) as { result?: unknown; error?: string }[]
    const failed = out.find((r) => r.error)
    if (failed) throw new Error(`Upstash command failed: ${failed.error}`)
    return out.map((r) => r.result)
  }

  async get<T>(key: string): Promise<T | null> {
    const [raw] = await this.pipeline([['GET', key]])
    return typeof raw === 'string' ? (JSON.parse(raw) as T) : null
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.pipeline([ttlSeconds ? ['SET', key, JSON.stringify(value), 'EX', ttlSeconds] : ['SET', key, JSON.stringify(value)]])
  }

  async incr(key: string, by = 1, ttlSeconds?: number): Promise<number> {
    // keys that use a TTL are date- or minute-scoped, so refreshing the TTL on each write is harmless
    const cmds: Command[] = [['INCRBY', key, by]]
    if (ttlSeconds) cmds.push(['EXPIRE', key, ttlSeconds])
    const [n] = await this.pipeline(cmds)
    return Number(n)
  }
}
