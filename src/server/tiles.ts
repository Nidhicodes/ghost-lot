import type { Point } from '@allmaps/types'
import { area, clipByConvex } from '../geo/polygon'

/** Size of the image sent to the model, in output pixels. */
export const TILE_PX = 1250
export const TILE_OVERLAP_PX = 100

/**
 * Pass 1 reads tiles at half resolution: each covers 2500 scan px, sent as 1250 px.
 * Pass 2 (tanks) re-reads flagged areas at native resolution (scale 1).
 */
export const COARSE_SCALE = 2
export const FINE_SCALE = 1

export interface Tile {
  /** Cache key: `<imageServiceId>:<x>:<y>:<w>:<h>:s<scale>` */
  key: string
  /** Region in native scan pixels. */
  x: number
  y: number
  w: number
  h: number
  /** Scan px per output px. */
  scale: number
  /** IIIF Image API URL for this region, downscaled by `scale`. */
  url: string
}

/**
 * Cover the clipped search area of one sheet with tiles.
 * The grid is anchored at the image origin (not at the query), so the same tile keys recur
 * across lookups and the findings cache gets hits. Neighbouring tiles overlap by 100 output px
 * so labels on a tile edge appear whole in at least one tile.
 */
export function planTiles(imageServiceId: string, width: number, height: number, areaPx: Point[], scale = COARSE_SCALE): Tile[] {
  if (areaPx.length < 3) return []
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`Bad tile scale ${scale}`)
  const size = TILE_PX * scale
  const step = (TILE_PX - TILE_OVERLAP_PX) * scale
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of areaPx) {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  minX = Math.max(0, minX); minY = Math.max(0, minY)
  maxX = Math.min(width, maxX); maxY = Math.min(height, maxY)
  const overlap = TILE_OVERLAP_PX * scale
  const gx0 = Math.floor(minX / step)
  const gy0 = Math.floor(minY / step)
  const tiles: Tile[] = []
  for (let gy = gy0; gy * step < maxY && gy * step < height; gy++) {
    // a row starting inside the previous row's overlap is wholly covered by it: skip the sliver
    if (gy > gy0 && gy * step >= height - overlap) break
    for (let gx = gx0; gx * step < maxX && gx * step < width; gx++) {
      if (gx > gx0 && gx * step >= width - overlap) break
      const x = gx * step
      const y = gy * step
      const w = Math.min(size, width - x)
      const h = Math.min(size, height - y)
      const rect: Point[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
      if (area(clipByConvex(areaPx, rect)) <= 0) continue
      const outW = Math.max(1, Math.round(w / scale))
      tiles.push({
        key: `${imageServiceId}:${x}:${y}:${w}:${h}:s${scale}`,
        x, y, w, h, scale,
        url: `${imageServiceId}/${x},${y},${w},${h}/${scale === 1 ? 'full' : `${outW},`}/0/default.jpg`,
      })
    }
  }
  return tiles
}

/** Native-resolution tiles covering one coarse tile's part of the search area (for pass 2). */
export function refineTile(imageServiceId: string, width: number, height: number, coarse: Tile, areaPx: Point[]): Tile[] {
  const rect: Point[] = [[coarse.x, coarse.y], [coarse.x + coarse.w, coarse.y], [coarse.x + coarse.w, coarse.y + coarse.h], [coarse.x, coarse.y + coarse.h]]
  return planTiles(imageServiceId, width, height, clipByConvex(areaPx, rect), FINE_SCALE)
}
