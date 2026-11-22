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
  // a restarted or scaled-out host would reset an in-memory budget, so production refuses it
  else if (env.VERCEL || env.REQUIRE_SHARED_STORE === '1') throw new Error('No shared store configured: set KV_REST_API_URL and KV_REST_API_TOKEN (Upstash)')
  else store = new MemoryStore()
  return store
}
