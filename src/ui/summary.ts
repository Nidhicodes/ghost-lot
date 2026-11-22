import type { Finding } from '../server/findings'
import type { HazardClass } from '../server/vision/parse'

export const BANDS = [
  { id: 'adjacent', label: 'On or next to the address', maxM: 30 },
  { id: 'nearby', label: 'Nearby', maxM: 150 },
  { id: 'wider', label: 'Within the wider search area', maxM: Infinity },
] as const

export type BandId = (typeof BANDS)[number]['id']

export const bandOf = (distanceM: number): BandId => BANDS.find((b) => distanceM <= b.maxM)!.id

export interface ClassSummary {
  class: HazardClass
  count: number
  nearestM: number
  years: number[]
  byBand: Record<BandId, number>
}

/** Group findings by class for the risk card, nearest class first. */
export function summarise(findings: Finding[]): ClassSummary[] {
  const by = new Map<HazardClass, ClassSummary>()
  for (const f of findings) {
    const s = by.get(f.class) ?? { class: f.class, count: 0, nearestM: Infinity, years: [], byBand: { adjacent: 0, nearby: 0, wider: 0 } }
    s.count++
    s.nearestM = Math.min(s.nearestM, f.distanceM)
    if (!s.years.includes(f.year)) s.years.push(f.year)
    s.byBand[bandOf(f.distanceM)]++
    by.set(f.class, s)
  }
  return [...by.values()].map((s) => ({ ...s, years: s.years.sort((a, b) => a - b) })).sort((a, b) => a.nearestM - b.nearestM)
}

/** Plain past-tense sentence for one class, e.g. "In 1927, the map shows 3 fuel marks; the nearest is 43 m away." */
export function sentence(s: ClassSummary, label: string): string {
  const years = s.years.join(', ')
  const what = s.count === 1 ? `1 ${label.toLowerCase()} mark` : `${s.count} ${label.toLowerCase()} marks`
  return `In ${years}, the map shows ${what}; the nearest is about ${s.nearestM} m from the address.`
}
