import { ProjectedGcpTransformer, lonLatProjection } from '@allmaps/project'
import type { Point } from '@allmaps/types'
import type { Sheet } from './annotation'

export interface SheetTransformer {
  /** Image pixel [x, y] to [lon, lat]. */
  toLonLat(px: Point): Point
  /** [lon, lat] to image pixel [x, y]. */
  toPixel(lonLat: Point): Point
}

/**
 * Uses Allmaps' own transformer (Web Mercator internally, image y-axis down),
 * so pin positions agree with the warped overlay the user sees.
 */
export function createSheetTransformer(sheet: Sheet): SheetTransformer {
  const t = ProjectedGcpTransformer.fromGeoreferencedMap(sheet.map, {
    projection: lonLatProjection,
  })
  return {
    toLonLat: (px) => t.transformToGeo(px),
    toPixel: (lonLat) => t.transformToResource(lonLat),
  }
}
