import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Point } from '@allmaps/types'
import { pointInPolygon } from '../geo/polygon'
import { COARSE_SCALE, FINE_SCALE, planTiles, refineTile, TILE_OVERLAP_PX, TILE_PX } from './tiles'

const BASE = 'https://tile.loc.gov/image-services/iiif/service:test'

// A convex search area somewhere on (or partly off) an image.
const scenario = fc
  .record({
    width: fc.integer({ min: 500, max: 9000 }),
    height: fc.integer({ min: 500, max: 9000 }),
    cx: fc.double({ min: -0.2, max: 1.2, noNaN: true }),
    cy: fc.double({ min: -0.2, max: 1.2, noNaN: true }),
    r: fc.double({ min: 50, max: 4000, noNaN: true }),
  })
  .map(({ width, height, cx, cy, r }) => {
    const poly: Point[] = Array.from({ length: 32 }, (_, i) => {
      const t = (2 * Math.PI * i) / 32
      return [cx * width + r * Math.cos(t), cy * height + r * Math.sin(t)]
    })
    return { width, height, poly }
  })

describe('planTiles', () => {
  it('every point of the search area that lies on the image is inside some tile', () => {
    fc.assert(
      fc.property(scenario, fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), ({ width, height, poly }, u, v) => {
        const tiles = planTiles(BASE, width, height, poly)
        const p: Point = [u * width, v * height]
        fc.pre(pointInPolygon(p, poly))
        expect(tiles.some((t) => p[0] >= t.x && p[0] <= t.x + t.w && p[1] >= t.y && p[1] <= t.y + t.h)).toBe(true)
      }),
      { numRuns: 500 },
    )
  })

  it('tiles stay inside the image, send at most 1250 output px, and have unique keys', () => {
    fc.assert(
      fc.property(scenario, fc.constantFrom(COARSE_SCALE, FINE_SCALE), ({ width, height, poly }, scale) => {
        const tiles = planTiles(BASE, width, height, poly, scale)
        for (const t of tiles) {
          expect(t.scale).toBe(scale)
          expect(t.x).toBeGreaterThanOrEqual(0)
          expect(t.y).toBeGreaterThanOrEqual(0)
          expect(t.w).toBeGreaterThan(0)
          expect(t.h).toBeGreaterThan(0)
          expect(t.x + t.w).toBeLessThanOrEqual(width)
          expect(t.y + t.h).toBeLessThanOrEqual(height)
          expect(Math.round(t.w / scale)).toBeLessThanOrEqual(TILE_PX)
          expect(Math.round(t.h / scale)).toBeLessThanOrEqual(TILE_PX)
          const size = scale === 1 ? 'full' : `${Math.max(1, Math.round(t.w / scale))},`
          expect(t.url).toBe(`${BASE}/${t.x},${t.y},${t.w},${t.h}/${size}/0/default.jpg`)
        }
        expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length)
      }),
    )
  })

  it('horizontal neighbours overlap by at least 100 output px unless clipped at the image edge', () => {
    fc.assert(
      fc.property(scenario, fc.constantFrom(COARSE_SCALE, FINE_SCALE), ({ width, height, poly }, scale) => {
        const tiles = planTiles(BASE, width, height, poly, scale)
        for (const a of tiles) {
          const right = tiles.find((b) => b.y === a.y && b.x > a.x && b.x < a.x + a.w)
          if (right) expect(a.x + a.w - right.x).toBeGreaterThanOrEqual(TILE_OVERLAP_PX * scale)
        }
      }),
    )
  })

  it('half resolution needs no more tiles than native resolution', () => {
    fc.assert(
      fc.property(scenario, ({ width, height, poly }) => {
        expect(planTiles(BASE, width, height, poly, COARSE_SCALE).length).toBeLessThanOrEqual(planTiles(BASE, width, height, poly, FINE_SCALE).length)
      }),
    )
  })

  it('refineTile covers every point of a coarse tile’s share of the search area at native resolution', () => {
    fc.assert(
      fc.property(scenario, fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), ({ width, height, poly }, u, v) => {
        const coarse = planTiles(BASE, width, height, poly, COARSE_SCALE)
        fc.pre(coarse.length > 0)
        const c = coarse[0]!
        const p: Point = [c.x + u * c.w, c.y + v * c.h]
        fc.pre(pointInPolygon(p, poly))
        const fine = refineTile(BASE, width, height, c, poly)
        expect(fine.every((t) => t.scale === FINE_SCALE)).toBe(true)
        expect(fine.some((t) => p[0] >= t.x && p[0] <= t.x + t.w && p[1] >= t.y && p[1] <= t.y + t.h)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it('uses a grid anchored at the image origin, so keys repeat across nearby queries', () => {
    const square = (x: number, y: number): Point[] => [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]]
    const a = planTiles(BASE, 6000, 6000, square(1300, 1300))
    const b = planTiles(BASE, 6000, 6000, square(1310, 1320))
    expect(a.map((t) => t.key)).toEqual(b.map((t) => t.key))
  })

  it('returns no tiles when the area is entirely off the image', () => {
    const off: Point[] = [[-500, -500], [-100, -500], [-100, -100], [-500, -100]]
    expect(planTiles(BASE, 4000, 4000, off)).toEqual([])
  })
})
