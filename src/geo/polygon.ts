import type { Point } from '@allmaps/types'

export type Bbox = { minX: number; minY: number; maxX: number; maxY: number }

/** Signed shoelace area; sign depends on winding. */
export function signedArea(poly: Point[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!
    const [x2, y2] = poly[(i + 1) % poly.length]!
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

export const area = (poly: Point[]) => Math.abs(signedArea(poly))

export function bbox(poly: Point[]): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of poly) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/** Ray-casting test; points exactly on an edge may go either way. */
export function pointInPolygon([px, py]: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Sutherland–Hodgman: clip any simple `subject` polygon by a CONVEX `clip` polygon.
 * Returns [] when they do not overlap. With a concave subject the result can contain
 * zero-width bridges along the clip edge; its area and bbox are still correct.
 */
export function clipByConvex(subject: Point[], clip: Point[]): Point[] {
  if (subject.length < 3 || clip.length < 3) return []
  const ccw = signedArea(clip) > 0
  let output = subject
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i]!
    const b = clip[(i + 1) % clip.length]!
    const inside = ([x, y]: Point) => {
      const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
      return ccw ? cross >= 0 : cross <= 0
    }
    const input = output
    output = []
    for (let j = 0; j < input.length; j++) {
      const cur = input[j]!
      const prev = input[(j + input.length - 1) % input.length]!
      const curIn = inside(cur)
      const prevIn = inside(prev)
      if (curIn !== prevIn) output.push(intersect(prev, cur, a, b))
      if (curIn) output.push(cur)
    }
  }
  return output.length >= 3 ? output : []
}

function intersect([x1, y1]: Point, [x2, y2]: Point, [x3, y3]: Point, [x4, y4]: Point): Point {
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (den === 0) return [x2, y2]
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
}
