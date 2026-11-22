import { describe, expect, it } from 'vitest'
import type { Point } from '@allmaps/types'
import fortPayneVolume from '../geo/__fixtures__/sanborn00045_004.main.iiif.json'
import { parseSheets } from '../geo/annotation'
import { Budget } from './budget'
import { findSheetsDetailed, type LookupDeps } from './lookup'
import { readLookup, type ReadEvent } from './readSession'
import { buildPlaces, buildStateIndex, sheetBbox, StateIndex, type SheetRef } from './sheetIndex'
import { MemoryStore } from './store'
import type { ReadDeps } from './vision/read'

const DOWNTOWN: Point = [-85.72261, 34.441126]
const sheets = parseSheets(fortPayneVolume)
const refs: SheetRef[] = sheets.map((s, idx) => ({ item: 'sanborn00045_004', idx, year: 1927, bbox: sheetBbox(s) }))
const al = StateIndex.fromSerialized(JSON.parse(JSON.stringify(buildStateIndex('AL', refs))))
const lookupDeps: LookupDeps = {
  states: { AL: { bbox: [-86, 34, -85, 35] } },
  places: buildPlaces(refs.map((r) => ({ ...r, city: 'Fort Payne', state: 'AL' }))),
  loadState: async () => al,
  loadAnnotation: async () => fortPayneVolume,
}

function readDeps(store: MemoryStore, budget: Budget, reply = '{"hazards":[{"class":"RAIL","map_text":"A.G.S. R.R.","where":"center"}]}'): ReadDeps & { calls: number } {
  const d = {
    calls: 0,
    store,
    budget,
    model: { baseUrl: 'https://example.test', modelId: 'm', apiKey: 'k' },
    fetchImage: async () => 'IMG',
    callModel: async () => {
      d.calls++
      return reply
    },
    sleep: async () => {},
  }
  return d
}

async function collect(gen: AsyncGenerator<ReadEvent>) {
  const out: ReadEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

describe('readLookup', async () => {
  const { result, transformers } = await findSheetsDetailed(DOWNTOWN, 100, lookupDeps)

  it('reads every planned tile nearest-first and places located, de-duplicated pins', async () => {
    const store = new MemoryStore()
    const budget = new Budget(store, { readsPerDay: 100, liveLookupsPerIpPerDay: 2 })
    const d = readDeps(store, budget)
    const events = await collect(readLookup(result, transformers, d, { year: 1927, clientKey: 'ip', lookupId: 'L', budget, timeBudgetMs: 60_000 }))
    const plan = events[0]
    expect(plan).toMatchObject({ type: 'plan', year: 1927 })
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type !== 'done' || plan?.type !== 'plan') return
    expect(done.read).toBe(plan.total)
    expect(d.calls).toBe(plan.total)
    // the same "A.G.S. R.R." seen in overlapping tiles near each other collapses to fewer pins
    expect(done.findings.length).toBeLessThanOrEqual(plan.total)
    for (const f of done.findings) {
      expect(f.lonLat[0]).toBeCloseTo(DOWNTOWN[0], 1)
      expect(f.lonLat[1]).toBeCloseTo(DOWNTOWN[1], 1)
      expect(f.distanceM).toBeLessThan(400)
    }
  })

  it('a second run is served entirely from cache and does not count against the client', async () => {
    const store = new MemoryStore()
    const budget = new Budget(store, { readsPerDay: 100, liveLookupsPerIpPerDay: 1 })
    const d = readDeps(store, budget)
    await collect(readLookup(result, transformers, d, { year: 1927, clientKey: 'ip', lookupId: 'L1', budget, timeBudgetMs: 60_000 }))
    const callsAfterFirst = d.calls
    const again = await collect(readLookup(result, transformers, d, { year: 1927, clientKey: 'ip', lookupId: 'L2', budget, timeBudgetMs: 60_000 }))
    expect(d.calls).toBe(callsAfterFirst)
    expect(again.at(-1)?.type).toBe('done')
  })

  it('pauses with client_limit once a client has used its live lookups', async () => {
    const store = new MemoryStore()
    const budget = new Budget(store, { readsPerDay: 100, liveLookupsPerIpPerDay: 0 })
    const events = await collect(readLookup(result, transformers, readDeps(store, budget), { year: 1927, clientKey: 'ip', lookupId: 'L', budget, timeBudgetMs: 60_000 }))
    expect(events.at(-1)).toMatchObject({ type: 'paused', reason: 'client_limit', done: 0 })
  })

  it('pauses with daily_budget part-way and keeps the pins already read', async () => {
    const store = new MemoryStore()
    const budget = new Budget(store, { readsPerDay: 2, liveLookupsPerIpPerDay: 5 })
    const events = await collect(readLookup(result, transformers, readDeps(store, budget), { year: 1927, clientKey: 'ip', lookupId: 'L', budget, timeBudgetMs: 60_000 }))
    expect(events.filter((e) => e.type === 'tile')).toHaveLength(2)
    expect(events.at(-1)).toMatchObject({ type: 'paused', reason: 'daily_budget', done: 2 })
  })

  it('stops with `more` when the time budget runs out, then resumes from cache', async () => {
    const store = new MemoryStore()
    const budget = new Budget(store, { readsPerDay: 100, liveLookupsPerIpPerDay: 5 })
    let t = 0
    const d = readDeps(store, budget)
    const first = await collect(readLookup(result, transformers, d, { year: 1927, clientKey: 'ip', lookupId: 'L', budget, timeBudgetMs: 10, now: () => (t += 20) }))
    expect(first.at(-1)?.type).toBe('more')
    const rest = await collect(readLookup(result, transformers, d, { year: 1927, clientKey: 'ip', lookupId: 'L', budget, timeBudgetMs: 60_000 }))
    expect(rest.at(-1)?.type).toBe('done')
  })
})
