import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { Point } from '@allmaps/types'
import fortPayneVolume from '../geo/__fixtures__/sanborn00045_004.main.iiif.json'
import { parseSheets } from '../geo/annotation'
import { destination } from '../geo/distance'
import { geocodeAddress, GeocoderError } from './geocode'
import { findSheets, SheetsQuery, type LookupDeps } from './lookup'
import { clientKey, RateLimiter } from './rateLimit'
import { buildPlaces, buildStateIndex, sheetBbox, StateIndex, type SheetRef } from './sheetIndex'

// 100 Gault Ave N, Fort Payne, AL (US Census geocoder, 2026-11-22)
const DOWNTOWN: Point = [-85.72261, 34.441126]

const sheets = parseSheets(fortPayneVolume)
const refs: SheetRef[] = sheets.map((s, idx) => ({ item: 'sanborn00045_004', idx, year: 1927, bbox: sheetBbox(s) }))
const al = StateIndex.fromSerialized(JSON.parse(JSON.stringify(buildStateIndex('AL', refs))))

function fakeDeps(): LookupDeps & { annotationCalls: string[] } {
  const annotationCalls: string[] = []
  const b = refs.map((r) => r.bbox)
  return {
    annotationCalls,
    states: { AL: { bbox: [Math.min(...b.map((x) => x[0])), Math.min(...b.map((x) => x[1])), Math.max(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))] } },
    places: buildPlaces(refs.map((r) => ({ ...r, city: 'Fort Payne', state: 'AL' }))),
    loadState: async () => al,
    loadAnnotation: async (item) => {
      annotationCalls.push(item)
      return fortPayneVolume
    },
  }
}

describe('findSheets', () => {
  it('finds the 1927 Fort Payne sheets around 100 Gault Ave N, with tiles', async () => {
    const deps = fakeDeps()
    const r = await findSheets(DOWNTOWN, 150, deps)
    expect(r.years).toEqual([1927])
    expect(r.defaultYear).toBe(1927)
    expect(r.sheets.length).toBeGreaterThan(0)
    expect(r.sheets.every((s) => s.tiles.length > 0)).toBe(true)
    expect(r.nearest).toBeNull()
    // one annotation fetch per volume, however many sheets match
    expect(deps.annotationCalls).toEqual(['sanborn00045_004'])
  })

  it('reports the nearest covered place when nothing is in range', async () => {
    const r = await findSheets(destination(DOWNTOWN, 8_000, 0), 150, fakeDeps())
    expect(r.sheets).toEqual([])
    expect(r.defaultYear).toBeNull()
    expect(r.nearest?.city).toBe('Fort Payne')
    expect(r.nearest!.distanceM).toBeGreaterThan(5_000)
  })

  it('returns no nearest place beyond 25 km', async () => {
    const r = await findSheets(destination(DOWNTOWN, 60_000, 0), 150, fakeDeps())
    expect(r.nearest).toBeNull()
  })

  it('a bigger radius never returns fewer sheets', async () => {
    const small = await findSheets(DOWNTOWN, 50, fakeDeps())
    const big = await findSheets(DOWNTOWN, 400, fakeDeps())
    expect(big.sheets.length).toBeGreaterThanOrEqual(small.sheets.length)
  })
})

describe.runIf(existsSync('index/AL.json.gz'))('findSheets on the built Alabama index', () => {
  it('matches the fixture-only result for downtown Fort Payne', async () => {
    const { lookupDeps } = await import('./deps')
    const fetchStub = vi.fn(async () => new Response(readFileSync('src/geo/__fixtures__/sanborn00045_004.main.iiif.json')))
    const real = await lookupDeps(fetchStub as unknown as typeof fetch)
    const r = await findSheets(DOWNTOWN, 150, { ...real, loadAnnotation: async (item) => (item === 'sanborn00045_004' ? fortPayneVolume : real.loadAnnotation(item)) })
    expect(r.sheets.some((s) => s.item === 'sanborn00045_004')).toBe(true)
    expect(r.years.every((y) => y <= 1930)).toBe(true)
  })
})

describe('SheetsQuery', () => {
  it('defaults the radius to 150 m and coerces strings', () => {
    expect(SheetsQuery.parse({ lat: '34.44', lon: '-85.72' })).toEqual({ lat: 34.44, lon: -85.72, r: 150 })
  })

  it.each([
    { lat: '34', lon: '-85', r: '401' },
    { lat: '34', lon: '-85', r: '10' },
    { lat: '51.5', lon: '0.1' },
    { lat: 'abc', lon: '-85' },
  ])('rejects %j', (q) => {
    expect(() => SheetsQuery.parse(q)).toThrow()
  })
})

describe('geocodeAddress', () => {
  const census = (matches: unknown[]) =>
    vi.fn(async () => new Response(JSON.stringify({ result: { addressMatches: matches } }), { status: 200 }))

  it('returns the first Census match', async () => {
    const f = census([{ matchedAddress: '100 GAULT AVE N, FORT PAYNE, AL, 35967', coordinates: { x: -85.72261, y: 34.441126 } }])
    await expect(geocodeAddress('100 Gault Ave N, Fort Payne, AL', f as unknown as typeof fetch)).resolves.toEqual({
      lon: -85.72261,
      lat: 34.441126,
      matched: '100 GAULT AVE N, FORT PAYNE, AL, 35967',
    })
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('benchmark=Public_AR_Current')
  })

  it('returns null when there is no match', async () => {
    await expect(geocodeAddress('1 Nowhere Lane, Atlantis', census([]) as unknown as typeof fetch)).resolves.toBeNull()
  })

  it('throws GeocoderError on an upstream failure or odd shape', async () => {
    const down = vi.fn(async () => new Response('busy', { status: 503 }))
    await expect(geocodeAddress('100 Gault Ave N', down as unknown as typeof fetch)).rejects.toBeInstanceOf(GeocoderError)
    const odd = vi.fn(async () => new Response(JSON.stringify({ nope: true })))
    await expect(geocodeAddress('100 Gault Ave N', odd as unknown as typeof fetch)).rejects.toBeInstanceOf(GeocoderError)
  })

  it('rejects too-short or too-long input before calling out', async () => {
    const f = census([])
    await expect(geocodeAddress('abc', f as unknown as typeof fetch)).rejects.toThrow()
    await expect(geocodeAddress('x'.repeat(201), f as unknown as typeof fetch)).rejects.toThrow()
    expect(f).not.toHaveBeenCalled()
  })
})

describe('RateLimiter', () => {
  it('allows the limit per window, then blocks until the window passes', () => {
    let now = 0
    const rl = new RateLimiter(3, 1000, () => now)
    expect([rl.allow('a'), rl.allow('a'), rl.allow('a'), rl.allow('a')]).toEqual([true, true, true, false])
    expect(rl.allow('b')).toBe(true)
    now = 1000
    expect(rl.allow('a')).toBe(true)
  })

  it('takes the first x-forwarded-for entry as the client key', () => {
    expect(clientKey({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })).toBe('203.0.113.7')
    expect(clientKey({})).toBe('unknown')
  })
})
