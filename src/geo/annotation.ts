import { parseAnnotation, type GeoreferencedMap } from '@allmaps/annotation'
import type { Point } from '@allmaps/types'

/** mapsnap v2.0 only emits these two; anything else is refused rather than guessed. */
export type SupportedTransform = 'polynomial1' | 'helmert'

export interface Sheet {
  /** IIIF Image API base URL (no trailing /info.json). */
  imageServiceId: string
  width: number
  height: number
  /** Visible part of the sheet in image pixels (mapsnap's SVG selector). */
  mask: Point[]
  transform: SupportedTransform
  /** The parsed Allmaps map, kept so transforms match the renderer exactly. */
  map: GeoreferencedMap
}

export class UnsupportedTransformError extends Error {
  constructor(readonly sheetId: string, readonly found: unknown) {
    super(`Unsupported transformation on ${sheetId}: ${JSON.stringify(found)}`)
    this.name = 'UnsupportedTransformError'
  }
}

export function supportedTransform(map: GeoreferencedMap): SupportedTransform {
  const t = map.transformation
  if (t?.type === 'helmert') return 'helmert'
  if (t?.type === 'polynomial' && (t.options?.order ?? 1) === 1) return 'polynomial1'
  throw new UnsupportedTransformError(map.resource.id, t)
}

export function imageServiceBase(id: string): string {
  return id.replace(/\/info\.json$/, '')
}

/** Parse a mapsnap AnnotationPage (or single Annotation) into sheets. */
export function parseSheets(annotation: unknown): Sheet[] {
  return parseAnnotation(annotation).map((map) => {
    const { width, height } = map.resource
    if (!width || !height) {
      throw new Error(`Sheet ${map.resource.id} has no image size`)
    }
    if (map.gcps.length < 2) {
      throw new Error(`Sheet ${map.resource.id} has ${map.gcps.length} control points; need at least 2`)
    }
    return {
      imageServiceId: imageServiceBase(map.resource.id),
      width,
      height,
      mask: map.resourceMask,
      transform: supportedTransform(map),
      map,
    }
  })
}
