import type { Point } from '@allmaps/types'

/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS_M = 6_371_008.8

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Great-circle distance between two [lon, lat] points, in metres. */
export function haversineM([lon1, lat1]: Point, [lon2, lat2]: Point): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Point reached by travelling distanceM from [lon, lat] on bearingDeg (0 = north, clockwise). */
export function destination([lon, lat]: Point, distanceM: number, bearingDeg: number): Point {
  const d = distanceM / EARTH_RADIUS_M
  const b = toRad(bearingDeg)
  const lat1 = toRad(lat)
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lon2 =
    toRad(lon) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [((toDeg(lon2) + 540) % 360) - 180, toDeg(lat2)]
}

/** Regular polygon approximating a circle of radiusM around centre, as [lon, lat] points. */
export function circlePolygon(centre: Point, radiusM: number, segments = 64): Point[] {
  return Array.from({ length: segments }, (_, i) => destination(centre, radiusM, (360 * i) / segments))
}
