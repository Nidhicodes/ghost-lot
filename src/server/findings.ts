import type { Point } from '@allmaps/types'
import { haversineM } from '../geo/distance'
import type { HazardClass } from './vision/parse'
import type { RawFinding } from './vision/read'

export interface Finding {
  id: string
  class: HazardClass
  mapText: string
  pass: 1 | 2
  year: number
  item: string
  tileKey: string
  /** Tile image to show in the pin popup (IIIF URL). */
  tileUrl: string
  px: Point
  lonLat: Point
  distanceM: number
}

/** Two readings within this distance with the same class and text are the same thing seen twice. */
export const DUPLICATE_RADIUS_M = 30

const normalise = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '')

export function isDuplicate(a: Finding, b: Finding): boolean {
  if (a.class !== b.class) return false
  const sameText = normalise(a.mapText) === normalise(b.mapText)
  // tank marks from pass 2 carry generic text; treat any two as one when they are close
  const bothTanks = a.pass === 2 && b.pass === 2
  return (sameText || bothTanks) && haversineM(a.lonLat, b.lonLat) <= DUPLICATE_RADIUS_M
}

/** Add new findings, dropping ones already present. Idempotent: merging the same list twice changes nothing. */
export function mergeFindings(existing: Finding[], incoming: Finding[]): Finding[] {
  const out = [...existing]
  for (const f of incoming) if (!out.some((e) => e.id === f.id || isDuplicate(e, f))) out.push(f)
  return out
}

export function locateFindings(
  raw: RawFinding[],
  ctx: { year: number; item: string; tileKey: string; tileUrl: string; address: Point; px: (f: RawFinding) => Point; toLonLat: (px: Point) => Point },
): Finding[] {
  return raw.map((f, i) => {
    const px = ctx.px(f)
    const lonLat = ctx.toLonLat(px)
    return {
      id: `${ctx.tileKey}#${i}`,
      class: f.class,
      mapText: f.mapText,
      pass: f.pass,
      year: ctx.year,
      item: ctx.item,
      tileKey: ctx.tileKey,
      tileUrl: ctx.tileUrl,
      px,
      lonLat,
      distanceM: Math.round(haversineM(ctx.address, lonLat)),
    }
  })
}
