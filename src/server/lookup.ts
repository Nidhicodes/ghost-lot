import type { Point } from '@allmaps/types'
import { z } from 'zod'
import { parseSheets, type Sheet } from '../geo/annotation'
import { radiusOnSheet } from '../geo/radius'
import { createSheetTransformer } from '../geo/transform'
import { annotationUrl, nearestPlace, radiusInDegrees, StateIndex, type LonLatBbox, type PlaceRef } from './sheetIndex'
import { planTiles, type Tile } from './tiles'

export const DEFAULT_RADIUS_M = 150
export const MAX_RADIUS_M = 400
export const NEAREST_PLACE_MAX_M = 25_000

export const SheetsQuery = z.object({
  lat: z.coerce.number().min(17).max(72),
  lon: z.coerce.number().min(-180).max(-64),
  r: z.coerce.number().int().min(25).max(MAX_RADIUS_M).default(DEFAULT_RADIUS_M),
})

export interface LookupDeps {
  states: Record<string, { bbox: LonLatBbox }>
  places: PlaceRef[]
  loadState(state: string): Promise<StateIndex>
  loadAnnotation(item: string): Promise<unknown>
}

export interface SheetHit {
  year: number
  item: string
  idx: number
  imageServiceId: string
  annotationUrl: string
  /** Pixel area of the search circle that falls on this sheet's visible part. */
  areaPx: number
  tiles: Tile[]
}

export interface LookupResult {
  point: Point
  radiusM: number
  years: number[]
  defaultYear: number | null
  sheets: SheetHit[]
  nearest: { city: string; state: string; years: number[]; distanceM: number } | null
}

const overlaps = (a: LonLatBbox, b: LonLatBbox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

export async function findSheets(point: Point, radiusM: number, deps: LookupDeps): Promise<LookupResult> {
  const { dLat, dLon } = radiusInDegrees(point[1], radiusM)
  const query: LonLatBbox = [point[0] - dLon, point[1] - dLat, point[0] + dLon, point[1] + dLat]
  const candidateStates = Object.entries(deps.states).filter(([, s]) => overlaps(s.bbox, query)).map(([st]) => st)

  const refs = (await Promise.all(candidateStates.map(async (st) => (await deps.loadState(st)).search(point, radiusM)))).flat()

  // one annotation fetch per volume
  const byItem = new Map<string, typeof refs>()
  for (const r of refs) byItem.set(r.item, [...(byItem.get(r.item) ?? []), r])

  const sheets: SheetHit[] = []
  for (const [item, itemRefs] of byItem) {
    const parsed: Sheet[] = parseSheets(await deps.loadAnnotation(item))
    for (const ref of itemRefs) {
      const sheet = parsed[ref.idx]
      if (!sheet) continue
      const hit = radiusOnSheet(sheet, createSheetTransformer(sheet), point, radiusM)
      if (!hit) continue
      sheets.push({
        year: ref.year,
        item,
        idx: ref.idx,
        imageServiceId: sheet.imageServiceId,
        annotationUrl: annotationUrl(item),
        areaPx: hit.areaPx,
        tiles: planTiles(sheet.imageServiceId, sheet.width, sheet.height, hit.polygon),
      })
    }
  }
  sheets.sort((a, b) => b.year - a.year || a.item.localeCompare(b.item) || a.idx - b.idx)
  const years = [...new Set(sheets.map((s) => s.year))].sort((a, b) => a - b)
  const near = sheets.length === 0 ? nearestPlace(deps.places, point, NEAREST_PLACE_MAX_M) : null
  return {
    point,
    radiusM,
    years,
    defaultYear: years.at(-1) ?? null,
    sheets,
    nearest: near && { city: near.city, state: near.state, years: near.years, distanceM: Math.round(near.distanceM) },
  }
}
