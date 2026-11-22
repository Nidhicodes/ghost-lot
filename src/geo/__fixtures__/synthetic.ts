import type { Point } from '@allmaps/types'
import fortPayne from './fort-payne-1927.json'

type Transform = { type: 'helmert' } | { type: 'polynomial'; options: { order: number } } | { type: string }

/** Build a one-sheet AnnotationPage with the given control points, reusing the real fixture's shape. */
export function syntheticPage(opts: {
  width: number
  height: number
  gcps: { px: Point; lonLat: Point }[]
  transformation: Transform
}) {
  const template = fortPayne.items[0]!
  const { width, height } = opts
  const imageId = `https://example.org/iiif/synthetic-${width}x${height}`
  return {
    ...fortPayne,
    items: [
      {
        ...template,
        id: `${imageId}/georef`,
        target: {
          ...template.target,
          id: `${imageId}/selector`,
          source: { ...template.target.source, id: `${imageId}/info.json`, width, height },
          selector: {
            type: 'SvgSelector',
            value: `<svg><polygon points="0,0 ${width},0 ${width},${height} 0,${height}" /></svg>`,
          },
        },
        body: {
          ...template.body,
          transformation: opts.transformation,
          features: opts.gcps.map(({ px, lonLat }) => ({
            type: 'Feature',
            properties: { resourceCoords: px, type: 'gcp' },
            geometry: { type: 'Point', coordinates: lonLat },
          })),
        },
      },
    ],
  }
}
