import { MemoryStore, type Store } from './store'
import { UpstashStore, upstashConfigFromEnv } from './upstashStore'

let store: Store | undefined

/**
 * Upstash when configured. Locally it falls back to memory. On Vercel it refuses to run without
 * a shared store: per-instance memory would let each instance spend the full model budget.
 */
export function sharedStore(env: Record<string, string | undefined> = process.env): Store {
  if (store) return store
  const cfg = upstashConfigFromEnv(env)
  if (cfg) store = new UpstashStore(cfg)
  else if (env.VERCEL) throw new Error('No shared store configured: set KV_REST_API_URL and KV_REST_API_TOKEN (Upstash)')
  else store = new MemoryStore()
  return store
}
