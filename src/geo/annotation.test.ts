import { describe, expect, it } from 'vitest'
import fortPayne from './__fixtures__/fort-payne-1927.json'
import { syntheticPage } from './__fixtures__/synthetic'
import { haversineM } from './distance'
import { parseSheets, UnsupportedTransformError } from './annotation'
import { createSheetTransformer } from './transform'

describe('parseSheets (mapsnap Fort Payne 1927)', () => {
  const sheets = parseSheets(fortPayne)

  it('reads both transform types mapsnap uses', () => {
    expect(sheets.map((s) => s.transform)).toEqual(['polynomial1', 'helmert'])
  })

  it('strips /info.json to get the IIIF image base', () => {
    for (const s of sheets) {
      expect(s.imageServiceId).toMatch(/^https:\/\/tile\.loc\.gov\/image-services\/iiif\/service:/)
      expect(s.imageServiceId.endsWith('/info.json')).toBe(false)
    }
  })

  it('keeps image size and mask', () => {
    const [first] = sheets
    expect(first!.width).toBe(6452)
    expect(first!.height).toBe(7652)
    expect(first!.mask.length).toBeGreaterThanOrEqual(3)
  })

  it('maps every control point to within 1 m of its stated location', () => {
    for (const s of sheets) {
      const t = createSheetTransformer(s)
      for (const gcp of s.map.gcps) {
        expect(haversineM(t.toLonLat(gcp.resource), gcp.geo)).toBeLessThan(1)
      }
    }
  })
})

describe('unsupported transforms', () => {
  const gcps = [
    { px: [0, 0] as [number, number], lonLat: [-85.7, 34.44] as [number, number] },
    { px: [1000, 0] as [number, number], lonLat: [-85.699, 34.44] as [number, number] },
    { px: [1000, 1000] as [number, number], lonLat: [-85.699, 34.439] as [number, number] },
    { px: [0, 1000] as [number, number], lonLat: [-85.7, 34.439] as [number, number] },
  ]

  it.each([
    { type: 'projective' },
    { type: 'thinPlateSpline' },
    { type: 'polynomial', options: { order: 2 } },
  ])('refuses %j instead of guessing', (transformation) => {
    const page = syntheticPage({ width: 1000, height: 1000, gcps, transformation })
    expect(() => parseSheets(page)).toThrow(UnsupportedTransformError)
  })
})
