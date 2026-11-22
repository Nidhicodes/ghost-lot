import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Point } from '@allmaps/types'
import fortPayne from './__fixtures__/fort-payne-1927.json'
import { syntheticPage } from './__fixtures__/synthetic'
import { parseSheets } from './annotation'
import { circlePolygon, destination, haversineM } from './distance'
import { area, clipByConvex, pointInPolygon } from './polygon'
import { radiusOnSheet } from './radius'
import { createSheetTransformer } from './transform'

const lonLat = fc.tuple(fc.double({ min: -125, max: -66, noNaN: true }), fc.double({ min: 24, max: 49, noNaN: true })) as fc.Arbitrary<Point>

// A synthetic sheet: random US location, scale 0.02–0.3 m/px, any rotation, helmert or affine.
const syntheticSheet = fc
  .record({
    origin: lonLat,
    width: fc.integer({ min: 2000, max: 9000 }),
    height: fc.integer({ min: 2000, max: 9000 }),
    mPerPx: fc.double({ min: 0.02, max: 0.3, noNaN: true }),
    rotationDeg: fc.double({ min: 0, max: 360, noNaN: true }),
    helmert: fc.boolean(),
    shear: fc.double({ min: -0.05, max: 0.05, noNaN: true }),
  })
  .map(({ origin, width, height, mPerPx, rotationDeg, helmert, shear }) => {
    const place = ([x, y]: Point): Point => {
      // image y points down; turn into east/north metres, then rotate
      const e = x * mPerPx + (helmert ? 0 : shear * y * mPerPx)
      const n = -y * mPerPx
      const r = (rotationDeg * Math.PI) / 180
      const de = e * Math.cos(r) - n * Math.sin(r)
      const dn = e * Math.sin(r) + n * Math.cos(r)
      const bearing = (Math.atan2(de, dn) * 180) / Math.PI
      return destination(origin, Math.hypot(de, dn), bearing)
    }
    const corners: Point[] = helmert
      ? [[0, 0], [width, height]]
      : [[0, 0], [width, 0], [width, height], [0, height]]
    const page = syntheticPage({
      width,
      height,
      gcps: corners.map((px) => ({ px, lonLat: place(px) })),
      transformation: helmert ? { type: 'helmert' } : { type: 'polynomial', options: { order: 1 } },
    })
    return parseSheets(page)[0]!
  })

const realSheets = parseSheets(fortPayne)

describe('transform round-trip', () => {
  it('pixel → lon/lat → pixel stays within 0.5 px on the real Fort Payne sheets', () => {
    for (const sheet of realSheets) {
      const t = createSheetTransformer(sheet)
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: sheet.width, noNaN: true }),
          fc.double({ min: 0, max: sheet.height, noNaN: true }),
          (x, y) => {
            const [bx, by] = t.toPixel(t.toLonLat([x, y]))
            expect(Math.hypot(bx - x, by - y)).toBeLessThan(0.5)
          },
        ),
      )
    }
  })

  // Measured in metres on the ground, not pixels: on very fine sheets (0.02 m/px) floating-point
  // error in Allmaps' Web Mercator solve reaches ~1 px = 2 cm, which is far below mapsnap's ~3 m error.
  it('pixel → lon/lat → pixel stays within 5 cm on the ground on random sheets', () => {
    fc.assert(
      fc.property(syntheticSheet, fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (sheet, u, v) => {
        const t = createSheetTransformer(sheet)
        const p: Point = [u * sheet.width, v * sheet.height]
        const back = t.toPixel(t.toLonLat(p))
        expect(haversineM(t.toLonLat(back), t.toLonLat(p))).toBeLessThan(0.05)
      }),
      { numRuns: 300 },
    )
  })
})

describe('haversine and destination', () => {
  it('is symmetric and never negative', () => {
    fc.assert(
      fc.property(lonLat, lonLat, (a, b) => {
        const d = haversineM(a, b)
        expect(d).toBeGreaterThanOrEqual(0)
        expect(Math.abs(d - haversineM(b, a))).toBeLessThan(1e-6)
      }),
    )
  })

  it('is zero for identical points', () => {
    fc.assert(
      fc.property(lonLat, (a) => {
        expect(haversineM(a, a)).toBe(0)
      }),
    )
  })

  it('obeys the triangle inequality', () => {
    fc.assert(
      fc.property(lonLat, lonLat, lonLat, (a, b, c) => {
        expect(haversineM(a, c)).toBeLessThanOrEqual(haversineM(a, b) + haversineM(b, c) + 1e-6)
      }),
    )
  })

  it('destination(p, d, bearing) lands d metres away', () => {
    fc.assert(
      fc.property(lonLat, fc.double({ min: 0, max: 5000, noNaN: true }), fc.double({ min: 0, max: 360, noNaN: true }), (p, d, b) => {
        expect(Math.abs(haversineM(p, destination(p, d, b)) - d)).toBeLessThan(1e-6 * Math.max(1, d))
      }),
    )
  })
})

// Simple polygons: star-shaped (sorted angles, random radii). Convex: points on a circle, sorted.
const starPolygon = fc
  .array(fc.tuple(fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }), fc.double({ min: 10, max: 100, noNaN: true })), { minLength: 3, maxLength: 20 })
  .map((pts) => pts.sort((a, b) => a[0] - b[0]).map(([t, r]): Point => [r * Math.cos(t), r * Math.sin(t)]))
  .filter((p) => area(p) > 1)

const convexPolygon = fc
  .record({
    angles: fc.uniqueArray(fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }), { minLength: 3, maxLength: 16 }),
    r: fc.double({ min: 5, max: 120, noNaN: true }),
    cx: fc.double({ min: -50, max: 50, noNaN: true }),
    cy: fc.double({ min: -50, max: 50, noNaN: true }),
  })
  .map(({ angles, r, cx, cy }) => angles.sort((a, b) => a - b).map((t): Point => [cx + r * Math.cos(t), cy + r * Math.sin(t)]))
  .filter((p) => area(p) > 1)

describe('clipByConvex', () => {
  it('clipping a convex polygon by itself keeps its area', () => {
    fc.assert(
      fc.property(convexPolygon, (p) => {
        expect(Math.abs(area(clipByConvex(p, p)) - area(p))).toBeLessThan(1e-6 * area(p) + 1e-6)
      }),
    )
  })

  it('never grows: result area ≤ both inputs', () => {
    fc.assert(
      fc.property(starPolygon, convexPolygon, (s, c) => {
        const a = area(clipByConvex(s, c))
        expect(a).toBeLessThanOrEqual(area(s) + 1e-6)
        expect(a).toBeLessThanOrEqual(area(c) + 1e-6)
      }),
    )
  })

  it('every result vertex lies inside the clip polygon (or on its edge)', () => {
    fc.assert(
      fc.property(starPolygon, convexPolygon, (s, c) => {
        // vertices may sit exactly on an edge, so test a copy nudged towards the centroid
        const centroid = c.reduce<Point>(([x, y], [a, b]) => [x + a / c.length, y + b / c.length], [0, 0])
        for (const v of clipByConvex(s, c)) {
          const nudged: Point = [v[0] + (centroid[0] - v[0]) * 1e-6, v[1] + (centroid[1] - v[1]) * 1e-6]
          expect(pointInPolygon(nudged, c)).toBe(true)
        }
      }),
    )
  })
})

describe('radiusOnSheet', () => {
  it('every clipped vertex maps back to within the search radius (+1 m)', () => {
    fc.assert(
      fc.property(syntheticSheet, fc.double({ min: 0.1, max: 0.9, noNaN: true }), fc.double({ min: 0.1, max: 0.9, noNaN: true }), fc.double({ min: 20, max: 400, noNaN: true }), (sheet, u, v, r) => {
        const t = createSheetTransformer(sheet)
        const centre = t.toLonLat([u * sheet.width, v * sheet.height])
        const hit = radiusOnSheet(sheet, t, centre, r)
        expect(hit).not.toBeNull()
        for (const px of hit!.polygon) expect(haversineM(t.toLonLat(px), centre)).toBeLessThan(r + 1)
      }),
      { numRuns: 200 },
    )
  })

  it('returns null for a point 20 km away', () => {
    const sheet = realSheets[0]!
    const t = createSheetTransformer(sheet)
    const centre = t.toLonLat([sheet.width / 2, sheet.height / 2])
    expect(radiusOnSheet(sheet, t, destination(centre, 20_000, 90), 150)).toBeNull()
  })

  it('a circle that fits inside the mask keeps roughly the circle area', () => {
    const sheet = realSheets[0]!
    const t = createSheetTransformer(sheet)
    const mid: Point = [sheet.width / 2, sheet.height / 2]
    const centre = t.toLonLat(mid)
    const hit = radiusOnSheet(sheet, t, centre, 20)!
    const circlePx = area(circlePolygon(centre, 20).map((p) => t.toPixel(p)))
    expect(Math.abs(hit.areaPx - circlePx) / circlePx).toBeLessThan(0.01)
  })
})
