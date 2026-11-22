import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Point } from '@allmaps/types'
import fortPayne from '../geo/__fixtures__/fort-payne-1927.json'
import { parseSheets } from '../geo/annotation'
import { destination, haversineM } from '../geo/distance'
import { createSheetTransformer } from '../geo/transform'
import {
  buildPlaces,
  buildStateIndex,
  nearestPlace,
  sheetBbox,
  StateIndex,
  type PlaceRef,
  type SerializedStateIndex,
  type SheetRef,
} from './sheetIndex'

const sheets = parseSheets(fortPayne)
const refs: SheetRef[] = sheets.map((s, idx) => ({ item: 'sanborn00045_004', idx, year: 1927, bbox: sheetBbox(s) }))
const index = StateIndex.fromSerialized(JSON.parse(JSON.stringify(buildStateIndex('AL', refs))))

describe('StateIndex (fixture)', () => {
  it('finds a sheet from a point in its middle, after a JSON round trip', () => {
    const t = createSheetTransformer(sheets[0]!)
    const mid = t.toLonLat([sheets[0]!.width / 2, sheets[0]!.height / 2])
    expect(index.search(mid, 50).map((r) => r.idx)).toContain(0)
  })

  it('finds nothing in the Gulf of Mexico', () => {
    expect(index.search([-88, 27], 150)).toEqual([])
  })

  it('never misses a sheet whose bbox is within the radius (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: refs.length - 1 }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 360, noNaN: true }), fc.double({ min: 10, max: 400, noNaN: true }), (i, u, bearing, r) => {
        const b = refs[i]!.bbox
        // a point on the bbox edge, then moved r * u metres away: the bbox is within r of it
        const edge: Point = [b[0] + (b[2] - b[0]) * u, b[3]]
        const p = destination(edge, r * u * 0.99, bearing)
        expect(index.search(p, r).map((x) => x.idx)).toContain(refs[i]!.idx)
      }),
    )
  })
})

describe('places', () => {
  const places: PlaceRef[] = buildPlaces(refs.map((r) => ({ ...r, city: 'Fort Payne', state: 'AL' })))

  it('collapses sheets into one place per city', () => {
    expect(places).toHaveLength(1)
    expect(places[0]).toMatchObject({ city: 'Fort Payne', state: 'AL', years: [1927] })
  })

  it('reports the nearest place within the limit, and null beyond it', () => {
    const p = places[0]!
    const near = destination([p.lon, p.lat], 10_000, 45)
    expect(nearestPlace(places, near, 25_000)?.city).toBe('Fort Payne')
    expect(Math.abs(nearestPlace(places, near, 25_000)!.distanceM - 10_000)).toBeLessThan(1)
    expect(nearestPlace(places, destination([p.lon, p.lat], 30_000, 45), 25_000)).toBeNull()
  })
})

// Runs only after `npm run build-index` has produced index/AL.json.gz.
describe.runIf(existsSync('index/AL.json.gz'))('built index (Alabama)', () => {
  const al = StateIndex.fromSerialized(JSON.parse(gunzipSync(readFileSync('index/AL.json.gz')).toString()) as SerializedStateIndex)
  // 100 Gault Ave N, Fort Payne, AL, from the US Census geocoder (2026-11-22). Downtown, inside the 1927 coverage.
  // Note: "2425 Gault Ave N" today is ~1.3 km north of the 1927 map's "2425 Gault Av"; house numbers changed.
  const gaultAve: Point = [-85.72261, 34.441126]

  it('finds Fort Payne 1927 sheets around 100 Gault Ave N', () => {
    const hits = al.search(gaultAve, 150)
    expect(hits.some((h) => h.item === 'sanborn00045_004' && h.year === 1927)).toBe(true)
  })

  it('finds nothing 30 km out in rural woodland north-east of Fort Payne', () => {
    expect(al.search(destination(gaultAve, 30_000, 45), 150)).toEqual([])
  })

  it('has no sheet later than 1930', () => {
    expect(al.search(gaultAve, 5_000).every((h) => h.year <= 1930)).toBe(true)
  })

  it('every hit is genuinely within reach of the query bbox', () => {
    for (const h of al.search(gaultAve, 150)) {
      const [a, b, c, d] = h.bbox
      const nearest: Point = [Math.min(Math.max(gaultAve[0], a), c), Math.min(Math.max(gaultAve[1], b), d)]
      expect(haversineM(gaultAve, nearest)).toBeLessThan(170)
    }
  })
})
