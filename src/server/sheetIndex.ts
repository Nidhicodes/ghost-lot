import Flatbush from 'flatbush'
import type { Point } from '@allmaps/types'
import type { Sheet } from '../geo/annotation'
import { haversineM } from '../geo/distance'
import { bbox as polygonBbox } from '../geo/polygon'
import { createSheetTransformer } from '../geo/transform'

export const INDEX_VERSION = 1
export const MAX_YEAR = 1930

/** [minLon, minLat, maxLon, maxLat] */
export type LonLatBbox = [number, number, number, number]

export interface SheetRef {
  /** mapsnap item id, e.g. "sanborn00045_004"; the annotation file is `<item>.main.iiif.json`. */
  item: string
  /** Position of the sheet in that file's `items` array. */
  idx: number
  year: number
  bbox: LonLatBbox
}

export interface PlaceRef {
  city: string
  state: string
  years: number[]
  lon: number
  lat: number
}

/** Compact on-disk form: one row per sheet plus a packed Flatbush R-tree over the bboxes. */
export interface SerializedStateIndex {
  version: number
  state: string
  rows: [item: string, idx: number, year: number, ...bbox: LonLatBbox][]
  tree: string
}

export const annotationUrl = (item: string) => `https://data.mapsnap.org/runs/v2.0/iiif/loc/${item}.main.iiif.json`

/** Ground footprint of the visible part of a sheet. */
export function sheetBbox(sheet: Sheet): LonLatBbox {
  const t = createSheetTransformer(sheet)
  const b = polygonBbox(sheet.mask.map((px) => t.toLonLat(px)))
  return [b.minX, b.minY, b.maxX, b.maxY]
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

export function buildStateIndex(state: string, refs: SheetRef[]): SerializedStateIndex {
  if (refs.length === 0) throw new Error(`No sheets for ${state}`)
  const tree = new Flatbush(refs.length)
  const rows: SerializedStateIndex['rows'] = []
  for (const r of refs) {
    // round outward so a rounded bbox still contains the true one
    const b: LonLatBbox = [
      Math.floor(r.bbox[0] * 1e6) / 1e6,
      Math.floor(r.bbox[1] * 1e6) / 1e6,
      Math.ceil(r.bbox[2] * 1e6) / 1e6,
      Math.ceil(r.bbox[3] * 1e6) / 1e6,
    ]
    tree.add(...b)
    rows.push([r.item, r.idx, r.year, ...b])
  }
  tree.finish()
  return { version: INDEX_VERSION, state, rows, tree: Buffer.from(tree.data).toString('base64') }
}

/** Degrees of lat/lon that cover radiusM around a latitude (slightly generous). */
export function radiusInDegrees(lat: number, radiusM: number): { dLat: number; dLon: number } {
  const dLat = (radiusM / 111_320) * 1.01
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6)
  return { dLat, dLon: dLat / cosLat }
}

export class StateIndex {
  private constructor(
    readonly state: string,
    private readonly rows: SerializedStateIndex['rows'],
    private readonly tree: Flatbush,
  ) {}

  static fromSerialized(s: SerializedStateIndex): StateIndex {
    if (s.version !== INDEX_VERSION) throw new Error(`Index ${s.state} has version ${s.version}, expected ${INDEX_VERSION}`)
    const buf = Buffer.from(s.tree, 'base64')
    const tree = Flatbush.from(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    return new StateIndex(s.state, s.rows, tree)
  }

  get size() {
    return this.rows.length
  }

  /** Sheets whose bbox comes within radiusM of [lon, lat]. A cheap prefilter; exact clipping happens later. */
  search([lon, lat]: Point, radiusM: number): SheetRef[] {
    const { dLat, dLon } = radiusInDegrees(lat, radiusM)
    return this.tree
      .search(lon - dLon, lat - dLat, lon + dLon, lat + dLat)
      .map((i) => {
        const [item, idx, year, a, b, c, d] = this.rows[i]!
        return { item, idx, year, bbox: [a, b, c, d] }
      })
  }
}

/** Build one entry per city/state from its sheets (centre of all their bboxes). */
export function buildPlaces(refs: (SheetRef & { city: string; state: string })[]): PlaceRef[] {
  const byPlace = new Map<string, { city: string; state: string; years: Set<number>; b: LonLatBbox }>()
  for (const r of refs) {
    const key = `${r.state}|${r.city}`
    const p = byPlace.get(key)
    if (!p) {
      byPlace.set(key, { city: r.city, state: r.state, years: new Set([r.year]), b: [...r.bbox] })
    } else {
      p.years.add(r.year)
      p.b = [Math.min(p.b[0], r.bbox[0]), Math.min(p.b[1], r.bbox[1]), Math.max(p.b[2], r.bbox[2]), Math.max(p.b[3], r.bbox[3])]
    }
  }
  return [...byPlace.values()]
    .map(({ city, state, years, b }) => ({
      city,
      state,
      years: [...years].sort((x, y) => x - y),
      lon: round6((b[0] + b[2]) / 2),
      lat: round6((b[1] + b[3]) / 2),
    }))
    .sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city))
}

export function nearestPlace(places: PlaceRef[], point: Point, maxM: number): (PlaceRef & { distanceM: number }) | null {
  let best: (PlaceRef & { distanceM: number }) | null = null
  for (const p of places) {
    const d = haversineM(point, [p.lon, p.lat])
    if (d <= maxM && (!best || d < best.distanceM)) best = { ...p, distanceM: d }
  }
  return best
}
