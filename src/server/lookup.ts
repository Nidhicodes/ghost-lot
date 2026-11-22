import type { Point } from '@allmaps/types'
import { z } from 'zod'
import { parseSheets, type Sheet } from '../geo/annotation'
import { radiusOnSheet } from '../geo/radius'
import { haversineM } from '../geo/distance'
import { createSheetTransformer, type SheetTransformer } from '../geo/transform'
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
  /** That part as a polygon in scan pixels; pass 2 refines flagged tiles inside it. */
  polygonPx: Point[]
  width: number
  height: number
  /** Half-resolution pass-1 tiles. */
  tiles: Tile[]
}

export interface PlannedRead {
  sheet: number
  tile: string
  /** Ground distance from the address to the tile centre. */
  distanceM: number
}

export interface LookupResult {
  point: Point
  radiusM: number
  years: number[]
  defaultYear: number | null
  sheets: SheetHit[]
  /** Pass-1 reading order: default year only, nearest tile first. Other years are read on request. */
  readingPlan: PlannedRead[]
  nearest: { city: string; state: string; years: number[]; distanceM: number } | null
}

/** Pass-1 tiles of one year, nearest to the address first. */
export function planReading(sheets: SheetHit[], point: Point, year: number | null, centreOf: (sheetIdx: number, px: Point) => Point): PlannedRead[] {
  if (year === null) return []
  const reads: PlannedRead[] = []
  sheets.forEach((s, i) => {
    if (s.year !== year) return
    for (const t of s.tiles) reads.push({ sheet: i, tile: t.key, distanceM: Math.round(haversineM(point, centreOf(i, [t.x + t.w / 2, t.y + t.h / 2]))) })
  })
  return reads.sort((a, b) => a.distanceM - b.distanceM || a.tile.localeCompare(b.tile))
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

  const found: { hit: SheetHit; transformer: SheetTransformer }[] = []
  for (const [item, itemRefs] of byItem) {
    const parsed: Sheet[] = parseSheets(await deps.loadAnnotation(item))
    for (const ref of itemRefs) {
      const sheet = parsed[ref.idx]
      if (!sheet) continue
      const transformer = createSheetTransformer(sheet)
      const hit = radiusOnSheet(sheet, transformer, point, radiusM)
      if (!hit) continue
      found.push({
        transformer,
        hit: {
          year: ref.year,
          item,
          idx: ref.idx,
          imageServiceId: sheet.imageServiceId,
          annotationUrl: annotationUrl(item),
          areaPx: hit.areaPx,
          polygonPx: hit.polygon,
          width: sheet.width,
          height: sheet.height,
          tiles: planTiles(sheet.imageServiceId, sheet.width, sheet.height, hit.polygon),
        },
      })
    }
  }
  found.sort((a, b) => b.hit.year - a.hit.year || a.hit.item.localeCompare(b.hit.item) || a.hit.idx - b.hit.idx)
  const sheets = found.map((f) => f.hit)
  const years = [...new Set(sheets.map((s) => s.year))].sort((a, b) => a - b)
  const defaultYear = years.at(-1) ?? null
  const near = sheets.length === 0 ? nearestPlace(deps.places, point, NEAREST_PLACE_MAX_M) : null
  return {
    point,
    radiusM,
    years,
    defaultYear,
    sheets,
    readingPlan: planReading(sheets, point, defaultYear, (i, px) => found[i]!.transformer.toLonLat(px)),
    nearest: near && { city: near.city, state: near.state, years: near.years, distanceM: Math.round(near.distanceM) },
  }
}
