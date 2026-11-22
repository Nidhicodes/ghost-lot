import { describe, expect, it, vi } from 'vitest'
import { Budget } from './budget'
import { sharedStore } from './sharedStore'
import { UpstashStore, upstashConfigFromEnv } from './upstashStore'

/** A tiny in-memory Redis behind a fake /pipeline endpoint, enough for GET/SET/INCRBY/EXPIRE. */
function fakeUpstash() {
  const data = new Map<string, string>()
  const calls: unknown[][][] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe('https://kv.example/pipeline')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t0k')
    const cmds = JSON.parse(init.body as string) as (string | number)[][]
    calls.push(cmds)
    const out = cmds.map(([cmd, key, ...args]) => {
      const k = String(key)
      switch (cmd) {
        case 'GET':
          return { result: data.get(k) ?? null }
        case 'SET':
          data.set(k, String(args[0]))
          return { result: 'OK' }
        case 'INCRBY': {
          const n = Number(data.get(k) ?? 0) + Number(args[0])
          data.set(k, String(n))
          return { result: n }
        }
        case 'EXPIRE':
          return { result: 1 }
        default:
          return { error: `ERR unknown command ${cmd}` }
      }
    })
    return new Response(JSON.stringify(out))
  })
  return { store: new UpstashStore({ url: 'https://kv.example', token: 't0k' }, fetchImpl as unknown as typeof fetch), calls }
}

describe('UpstashStore', () => {
  it('round-trips JSON values and counts', async () => {
    const { store, calls } = fakeUpstash()
    await store.set('a', [{ class: 'FUEL' }], 60)
    expect(await store.get('a')).toEqual([{ class: 'FUEL' }])
    expect(await store.get('missing')).toBeNull()
    expect(await store.incr('n', 1, 120)).toBe(1)
    expect(await store.incr('n', 2, 120)).toBe(3)
    expect(await store.get<number>('n')).toBe(3)
    expect(calls[0]).toEqual([['SET', 'a', '[{"class":"FUEL"}]', 'EX', 60]])
    expect(calls[3]).toEqual([['INCRBY', 'n', 1], ['EXPIRE', 'n', 120]])
  })

  it('works under the Budget (same behaviour as MemoryStore)', async () => {
    const { store } = fakeUpstash()
    const b = new Budget(store, { readsPerDay: 2, liveLookupsPerIpPerDay: 1 })
    expect([await b.reserveRead(), await b.reserveRead(), await b.reserveRead()]).toEqual([true, true, false])
    expect(await b.readsUsed()).toBe(2)
    expect(await b.allowLiveLookup('ip', 'A')).toBe(true)
    expect(await b.allowLiveLookup('ip', 'A')).toBe(true)
    expect(await b.allowLiveLookup('ip', 'B')).toBe(false)
  })

  it('throws on an HTTP or command error instead of pretending it worked', async () => {
    const down = new UpstashStore({ url: 'https://kv.example', token: 't' }, (async () => new Response('no', { status: 503 })) as unknown as typeof fetch)
    await expect(down.get('x')).rejects.toThrow(/503/)
    const bad = new UpstashStore({ url: 'https://kv.example', token: 't' }, (async () => new Response(JSON.stringify([{ error: 'WRONGTYPE' }]))) as unknown as typeof fetch)
    await expect(bad.incr('x')).rejects.toThrow(/WRONGTYPE/)
  })
})

describe('store selection', () => {
  it('reads either Vercel KV or Upstash variable names', () => {
    expect(upstashConfigFromEnv({ KV_REST_API_URL: 'https://a/', KV_REST_API_TOKEN: 't' })).toEqual({ url: 'https://a', token: 't' })
    expect(upstashConfigFromEnv({ UPSTASH_REDIS_REST_URL: 'https://b', UPSTASH_REDIS_REST_TOKEN: 'u' })).toEqual({ url: 'https://b', token: 'u' })
    expect(upstashConfigFromEnv({})).toBeNull()
  })

  it('refuses to run on Vercel, or when required (Render), without a shared store', () => {
    expect(() => sharedStore({ VERCEL: '1' })).toThrow(/No shared store/)
    expect(() => sharedStore({ REQUIRE_SHARED_STORE: '1' })).toThrow(/No shared store/)
  })
})
