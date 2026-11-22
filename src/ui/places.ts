import type { Finding } from '../server/findings'
import fortPayne from '../content/showcases/fort-payne-1927.json'

export interface Showcase {
  id: string
  title: string
  address: string
  matched: string
  lon: number
  lat: number
  radiusM: number
  year: number
  years: number[]
  unread: number
  sheets: { item: string; idx: number; year: number; annotationUrl: string }[]
  findings: Finding[]
}

export interface Place {
  matched: string
  lon: number
  lat: number
  radiusM: number
  showcase?: Showcase
}

export const SHOWCASES: Showcase[] = [fortPayne as unknown as Showcase]

export const showcasePlace = (s: Showcase): Place => ({ matched: s.matched, lon: s.lon, lat: s.lat, radiusM: s.radiusM, showcase: s })
