import type { Point } from '@allmaps/types'
import type { Sheet } from './annotation'
import { circlePolygon } from './distance'
import { area, bbox, clipByConvex, type Bbox } from './polygon'
import type { SheetTransformer } from './transform'

export interface RadiusOnSheet {
  /** Part of the sheet's visible mask inside the search circle, in image pixels. */
  polygon: Point[]
  bbox: Bbox
  areaPx: number
}

/**
 * Map the search circle onto a sheet and keep only what lies inside the sheet's mask.
 * Returns null when the circle misses the visible part of the sheet.
 * Both supported transforms are affine, so the circle stays convex in pixel space.
 */
export function radiusOnSheet(
  sheet: Sheet,
  transformer: SheetTransformer,
  centre: Point,
  radiusM: number,
): RadiusOnSheet | null {
  const circlePx = circlePolygon(centre, radiusM).map((p) => transformer.toPixel(p))
  const polygon = clipByConvex(sheet.mask, circlePx)
  if (polygon.length === 0) return null
  const areaPx = area(polygon)
  if (areaPx < 1) return null
  return { polygon, bbox: bbox(polygon), areaPx }
}
