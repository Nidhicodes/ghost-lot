import type { Point } from '@allmaps/types'
import { area, clipByConvex } from '../geo/polygon'

export const TILE_PX = 1250
export const TILE_OVERLAP_PX = 100
const STEP = TILE_PX - TILE_OVERLAP_PX

export interface Tile {
  /** Cache key: `<imageServiceId>:<x>:<y>:<w>:<h>` */
  key: string
  x: number
  y: number
  w: number
  h: number
  /** IIIF Image API URL for this region at native resolution. */
  url: string
}

/**
 * Cover the clipped search area of one sheet with native-resolution tiles.
 * The grid is anchored at the image origin (not at the query), so the same tile keys recur
 * across lookups and the findings cache gets hits. Neighbouring tiles overlap by 100 px so
 * labels on a tile edge appear whole in at least one tile.
 */
export function planTiles(imageServiceId: string, width: number, height: number, areaPx: Point[]): Tile[] {
  if (areaPx.length < 3) return []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of areaPx) {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  minX = Math.max(0, minX); minY = Math.max(0, minY)
  maxX = Math.min(width, maxX); maxY = Math.min(height, maxY)
  const tiles: Tile[] = []
  for (let gy = Math.floor(minY / STEP); gy * STEP < maxY && gy * STEP < height; gy++) {
    for (let gx = Math.floor(minX / STEP); gx * STEP < maxX && gx * STEP < width; gx++) {
      const x = gx * STEP
      const y = gy * STEP
      const w = Math.min(TILE_PX, width - x)
      const h = Math.min(TILE_PX, height - y)
      const rect: Point[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
      if (area(clipByConvex(areaPx, rect)) <= 0) continue
      tiles.push({
        key: `${imageServiceId}:${x}:${y}:${w}:${h}`,
        x, y, w, h,
        url: `${imageServiceId}/${x},${y},${w},${h}/full/0/default.jpg`,
      })
    }
  }
  return tiles
}
