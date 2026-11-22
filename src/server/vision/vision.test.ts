import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { Budget, quotaDay } from '../budget'
import { mergeFindings, type Finding } from '../findings'
import { MemoryStore } from '../store'
import type { Tile } from '../tiles'
import { fetchTileImage } from './image'
import { callVisionModel, isDailyQuota, ModelError, QuotaExhaustedError, RateLimitedError, type ModelConfig } from './model'
import { extractJson, parsePass1, parsePass2 } from './parse'
import { cacheKey, cellCentrePx, readTile, type ReadDeps } from './read'

const MODEL: ModelConfig = { baseUrl: 'https://example.test/v1', modelId: 'test-model', apiKey: 'k' }
const TILE: Tile = {
  key: 'https://tile.loc.gov/image-services/iiif/service:x:0:0:2500:2500:s2',
  x: 0, y: 0, w: 2500, h: 2500, scale: 2,
  url: 'https://tile.loc.gov/image-services/iiif/service:x/0,0,2500,2500/1250,/0/default.jpg',
}

describe('parse', () => {
  it('strips think blocks and code fences and takes the first JSON object', () => {
    const text = '<think>{"not":"this"}</think>\n```json\n{"hazards":[{"class":"fuel","map_text":"G.T. {x}","where":"Top Left"}]}\n``` trailing {"x":1}'
    expect(parsePass1(text).hazards).toEqual([{ class: 'FUEL', map_text: 'G.T. {x}', where: 'top-left' }])
  })

  it('maps unknown positions to the centre instead of failing', () => {
    expect(parsePass1('{"hazards":[{"class":"RAIL","map_text":"R.R.","where":"somewhere"}]}').hazards[0]!.where).toBe('center')
    expect(parsePass1('{"hazards":[{"class":"RAIL","map_text":"R.R."}]}').hazards[0]!.where).toBe('center')
  })

  it('rejects unknown hazard classes and non-JSON replies', () => {
    expect(() => parsePass1('{"hazards":[{"class":"GHOST","map_text":"boo"}]}')).toThrow()
    expect(() => extractJson('no json here')).toThrow(SyntaxError)
    expect(() => extractJson('{"open": true')).toThrow(SyntaxError)
  })

  it('pass 2 always returns one position per counted tank', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), fc.array(fc.constantFrom('top', 'left', 'nonsense', 'bottom-right'), { maxLength: 15 }), (n, positions) => {
        const p = parsePass2(JSON.stringify({ gasoline_tank_marks: n, positions }))
        expect(p.positions).toHaveLength(n)
      }),
    )
  })
})

describe('cellCentrePx', () => {
  it('puts each of the nine cells inside its third of the tile', () => {
    expect(cellCentrePx({ x: 100, y: 200, w: 300, h: 600 }, 'top-left')).toEqual([150, 300])
    expect(cellCentrePx({ x: 100, y: 200, w: 300, h: 600 }, 'center')).toEqual([250, 500])
    expect(cellCentrePx({ x: 100, y: 200, w: 300, h: 600 }, 'bottom-right')).toEqual([350, 700])
  })
})

describe('Budget', () => {
  it('uses the Pacific calendar day (Gemini resets at midnight Pacific)', () => {
    expect(quotaDay(new Date('2026-11-22T07:59:00Z'))).toBe('2026-11-21')
    expect(quotaDay(new Date('2026-11-22T08:01:00Z'))).toBe('2026-11-22')
  })

  it('never lets reservations exceed the daily cap, even with refunds mixed in (property)', () => {
    return fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 20 }), fc.array(fc.constantFrom('reserve', 'refund'), { maxLength: 60 }), async (cap, ops) => {
        const b = new Budget(new MemoryStore(), { readsPerDay: cap, liveLookupsPerIpPerDay: 2 })
        let held = 0
        for (const op of ops) {
          if (op === 'reserve') {
            if (await b.reserveRead()) held++
          } else if (held > 0) {
            await b.refundRead()
            held--
          }
          expect(held).toBeLessThanOrEqual(cap)
          expect(await b.readsUsed()).toBe(held)
        }
      }),
    )
  })

  it('markSpent stops all further reads today', async () => {
    const b = new Budget(new MemoryStore(), { readsPerDay: 50, liveLookupsPerIpPerDay: 2 })
    await b.reserveRead()
    await b.markSpent()
    expect(await b.reserveRead()).toBe(false)
  })

  it('counts a live lookup once per client per day, however often it resumes', async () => {
    const b = new Budget(new MemoryStore(), { readsPerDay: 50, liveLookupsPerIpPerDay: 2 })
    expect(await b.allowLiveLookup('ip1', 'A')).toBe(true)
    expect(await b.allowLiveLookup('ip1', 'A')).toBe(true)
    expect(await b.allowLiveLookup('ip1', 'B')).toBe(true)
    expect(await b.allowLiveLookup('ip1', 'C')).toBe(false)
    expect(await b.allowLiveLookup('ip2', 'C')).toBe(true)
  })
})

describe('model client', () => {
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }))

  it('returns the text reply and sends the image as a data URL', async () => {
    const f = reply(200, { choices: [{ message: { content: '{"hazards":[]}' } }] })
    await expect(callVisionModel(MODEL, 'p', 'AAAA', f as unknown as typeof fetch)).resolves.toBe('{"hazards":[]}')
    const body = JSON.parse(((f.mock.calls[0] as unknown[])[1] as RequestInit).body as string)
    expect(body.messages[0].content[1].image_url.url).toBe('data:image/jpeg;base64,AAAA')
    expect(body.temperature).toBe(0)
  })

  it('tells a daily quota apart from a short rate limit', async () => {
    const daily = reply(429, 'Rate limit reached ... tokens per day (TPD): Limit 200000')
    await expect(callVisionModel(MODEL, 'p', 'A', daily as unknown as typeof fetch)).rejects.toBeInstanceOf(QuotaExhaustedError)
    const groqDaily = reply(429, 'x', { 'x-should-retry': 'false' })
    await expect(callVisionModel(MODEL, 'p', 'A', groqDaily as unknown as typeof fetch)).rejects.toBeInstanceOf(QuotaExhaustedError)
    const short = reply(429, 'slow down', { 'retry-after': '7' })
    await expect(callVisionModel(MODEL, 'p', 'A', short as unknown as typeof fetch)).rejects.toMatchObject({ retryAfterS: 7 })
    await expect(callVisionModel(MODEL, 'p', 'A', reply(500, 'boom') as unknown as typeof fetch)).rejects.toBeInstanceOf(ModelError)
  })

  it('isDailyQuota recognises Gemini-style per-day quota messages', () => {
    expect(isDailyQuota(new Headers(), 'Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel-FreeTier')).toBe(true)
    expect(isDailyQuota(new Headers(), 'Quota exceeded for metric: GenerateRequestsPerMinutePerProjectPerModel')).toBe(false)
  })
})

describe('fetchTileImage', () => {
  it('refuses anything that is not a Library of Congress IIIF URL', async () => {
    const f = vi.fn()
    await expect(fetchTileImage('https://evil.example/x.jpg', f as unknown as typeof fetch)).rejects.toThrow(/non-LoC/)
    await expect(fetchTileImage('https://tile.loc.gov.evil.example/image-services/iiif/x', f as unknown as typeof fetch)).rejects.toThrow(/non-LoC/)
    expect(f).not.toHaveBeenCalled()
  })

  it('retries a truncated download, then succeeds', async () => {
    let n = 0
    const f = vi.fn(async () => {
      if (n++ === 0) throw new Error('IncompleteRead')
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    })
    await expect(fetchTileImage(TILE.url, f as unknown as typeof fetch, async () => {})).resolves.toBe('AQID')
    expect(f).toHaveBeenCalledTimes(2)
  })
})

function deps(replies: (string | Error)[], opts: { cap?: number } = {}): ReadDeps & { calls: string[] } {
  const calls: string[] = []
  const store = new MemoryStore()
  return {
    calls,
    store,
    budget: new Budget(store, { readsPerDay: opts.cap ?? 100, liveLookupsPerIpPerDay: 5 }),
    model: MODEL,
    fetchImage: async () => 'IMG',
    callModel: async (_c, prompt) => {
      calls.push(prompt.includes('gasoline_tank_marks') ? 'pass2' : 'pass1')
      const r = replies.shift()
      if (r === undefined) throw new Error('no more replies')
      if (r instanceof Error) throw r
      return r
    },
    sleep: async () => {},
  }
}

describe('readTile', () => {
  it('runs pass 2 only when pass 1 sees a garage or fuel, and adds tanks pass 1 missed', async () => {
    const d = deps(['{"hazards":[{"class":"AUTO","map_text":"GARAGE CAP 40 CARS","where":"top"}]}', '{"gasoline_tank_marks":1,"positions":["top-right"]}'])
    const out = await readTile(TILE, d)
    expect(d.calls).toEqual(['pass1', 'pass2'])
    expect(out).toMatchObject({ status: 'read', cached: false })
    expect(out.status === 'read' && out.findings.map((f) => [f.class, f.pass, f.cell])).toEqual([['AUTO', 1, 'top'], ['FUEL', 2, 'top-right']])
  })

  it('skips pass 2 on a tile with no garage or fuel', async () => {
    const d = deps(['{"hazards":[{"class":"RAIL","map_text":"A.G.S. R.R.","where":"bottom"}]}'])
    await readTile(TILE, d)
    expect(d.calls).toEqual(['pass1'])
  })

  it('serves a repeat read from the cache without calling the model or spending budget', async () => {
    const d = deps(['{"hazards":[]}'])
    await readTile(TILE, d)
    const used = await d.budget.readsUsed()
    const again = await readTile(TILE, d)
    expect(again).toMatchObject({ status: 'read', cached: true })
    expect(d.calls).toHaveLength(1)
    expect(await d.budget.readsUsed()).toBe(used)
    expect(await d.store.get(cacheKey(MODEL, TILE))).toEqual([])
  })

  it('retries an unparseable reply once, then marks the tile unread (never hazard-free)', async () => {
    const ok = deps(['not json', '{"hazards":[]}'])
    expect(await readTile(TILE, ok)).toMatchObject({ status: 'read' })
    const bad = deps(['not json', 'still not json'])
    expect(await readTile(TILE, bad)).toMatchObject({ status: 'unread' })
    expect(await bad.store.get(cacheKey(MODEL, TILE))).toBeNull()
  })

  it('pauses when the daily budget is spent, and when the provider says the quota is gone', async () => {
    expect(await readTile(TILE, deps(['{"hazards":[]}'], { cap: 0 }))).toEqual({ status: 'paused', reason: 'daily_budget' })
    const d = deps([new QuotaExhaustedError('gone')])
    expect(await readTile(TILE, d)).toEqual({ status: 'paused', reason: 'daily_budget' })
    expect(await d.budget.reserveRead()).toBe(false)
  })

  it('waits out a short rate limit and refunds the failed reservation', async () => {
    const d = deps([new RateLimitedError(3), '{"hazards":[]}'])
    expect(await readTile(TILE, d)).toMatchObject({ status: 'read' })
    expect(await d.budget.readsUsed()).toBe(1)
  })

  it('marks the tile unread when the scan cannot be downloaded', async () => {
    const d = deps([])
    d.fetchImage = async () => {
      throw new Error('IncompleteRead')
    }
    expect(await readTile(TILE, d)).toMatchObject({ status: 'unread' })
    expect(await d.budget.readsUsed()).toBe(0)
  })
})

describe('mergeFindings', () => {
  const finding = fc.record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    class: fc.constantFrom('FUEL', 'AUTO', 'INDUSTRIAL', 'RAIL' as const),
    mapText: fc.constantFrom('GARAGE', 'G.T.', 'R.R.', 'BL.SM.'),
    pass: fc.constantFrom(1 as const, 2 as const),
    year: fc.constant(1927),
    item: fc.constant('x'),
    tileKey: fc.constant('t'),
    tileUrl: fc.constant('u'),
    px: fc.constant<[number, number]>([0, 0]),
    lonLat: fc.tuple(fc.double({ min: -85.73, max: -85.72, noNaN: true }), fc.double({ min: 34.44, max: 34.45, noNaN: true })),
    distanceM: fc.nat(),
  }) as fc.Arbitrary<Finding>

  it('is idempotent and never loses a non-duplicate', () => {
    fc.assert(
      fc.property(fc.array(finding, { maxLength: 15 }), fc.array(finding, { maxLength: 15 }), (a, b) => {
        const once = mergeFindings(a, b)
        expect(mergeFindings(once, b)).toEqual(once)
        expect(once.slice(0, a.length)).toEqual(a)
        expect(once.length).toBeLessThanOrEqual(a.length + b.length)
      }),
    )
  })
})
