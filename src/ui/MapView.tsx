import { useEffect, useRef } from 'react'
import { AttributionControl, getVersion, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 looks for its worker next to its own module, which breaks once Vite pre-bundles it.
// Vite's dev transform also injects its browser client into the worker, so the file is served
// untouched at a fixed path by the maplibreWorker plugin in vite.config.ts.
setWorkerUrl(`/maplibre-gl-worker-${getVersion()}.mjs`)
import { WarpedMapLayer } from '@allmaps/maplibre'
import { circlePolygon } from '../geo/distance'
import type { Finding } from '../server/findings'
import hazards from '../content/hazards.json'

const BASEMAP = 'https://tiles.openfreemap.org/styles/dark'
const ATTRIBUTION =
  'Historic sheets: <a href="https://www.loc.gov/collections/sanborn-maps/">Library of Congress, Sanborn Maps Collection</a> · Placement: <a href="https://mapsnap.org/">mapsnap</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

interface Props {
  centre: [number, number]
  radiusM: number
  annotationUrls: string[]
  opacity: number
  findings: Finding[]
  selected: string | null
  onSelect(id: string | null): void
  /** Shown to the user so a broken overlay is visible, not a silent black map. */
  onProblem(message: string): void
}

/** Build the pin popup with text nodes only: model-read text is untrusted and never parsed as HTML. */
function popupContent(f: Finding): HTMLElement {
  const root = document.createElement('div')
  root.className = 'pin-popup'
  const title = document.createElement('strong')
  title.textContent = `${hazards.classes[f.class].label} · ${f.year}`
  const dist = document.createElement('div')
  dist.className = 'muted'
  dist.textContent = `About ${f.distanceM} m from the address`
  const reading = document.createElement('div')
  reading.className = 'reading'
  const label = document.createElement('span')
  label.className = 'ai-label'
  label.textContent = hazards.aiReadingLabel
  const quote = document.createElement('q')
  quote.textContent = f.mapText.replace(/\s+/g, ' ').trim()
  reading.append(label, quote)
  const img = document.createElement('img')
  img.src = f.tileUrl
  img.alt = `The ${f.year} fire-insurance map tile this reading came from`
  img.loading = 'lazy'
  root.append(title, dist, reading, img)
  return root
}

export function MapView({ centre, radiusM, annotationUrls, opacity, findings, selected, onSelect, onProblem }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const layer = useRef<WarpedMapLayer | null>(null)
  const markers = useRef(new Map<string, Marker>())
  const ready = useRef<Promise<void> | null>(null)

  useEffect(() => {
    // Allmaps does not support pitch, so it is disabled
    const m = new MapLibreMap({ container: el.current!, style: BASEMAP, center: centre, zoom: 17, maxPitch: 0, attributionControl: false })
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new AttributionControl({ compact: false, customAttribution: ATTRIBUTION }), 'bottom-right')
    m.on('error', (e) => {
      console.error('map error', e.error)
      onProblem(`Map error: ${e.error?.message ?? 'unknown'}`)
    })
    map.current = m
    ready.current = new Promise((resolve) =>
      m.on('load', () => {
        // the search circle goes first so it shows even if the historic overlay fails
        m.addSource('radius', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[]] } } })
        m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#c9f2ff', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } })
        try {
          const wl = new WarpedMapLayer()
          m.addLayer(wl, 'radius-line')
          layer.current = wl
        } catch (e) {
          console.error('historic overlay failed', e)
          onProblem(`Historic overlay failed: ${(e as Error).message}`)
        }
        resolve()
      }),
    )
    const home = document.createElement('div')
    home.className = 'home-pin'
    home.title = 'Your address'
    new Marker({ element: home }).setLngLat(centre).addTo(m)
    const placed = markers.current
    return () => {
      // React StrictMode mounts twice in dev; drop markers that belonged to the removed map
      for (const mk of placed.values()) mk.remove()
      placed.clear()
      layer.current = null
      m.remove()
    }
    // the map is created once per place; later prop changes are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void ready.current?.then(() => {
      const ring = circlePolygon(centre, radiusM)
      map.current!.getSource<GeoJSONSource>('radius')?.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] },
      })
    })
  }, [centre, radiusM])

  useEffect(() => {
    let cancelled = false
    void ready.current?.then(async () => {
      const wl = layer.current
      if (!wl) return
      wl.clear()
      for (const url of annotationUrls) {
        if (cancelled) return
        try {
          const results = await wl.addGeoreferenceAnnotationByUrl(url, undefined, { failureMode: 'best-effort' })
          const failed = results.filter((r) => !r.ok)
          if (failed.length) {
            console.error('overlay sheets failed', url, failed)
            onProblem(`${failed.length} of ${results.length} historic sheets failed to load: ${failed[0]!.ok ? '' : failed[0]!.error.message}`)
          }
        } catch (e) {
          console.error('overlay failed', url, e)
          onProblem(`Historic overlay failed to load: ${(e as Error).message}`)
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [annotationUrls])

  useEffect(() => {
    void ready.current?.then(() => layer.current?.setOpacity(opacity))
  }, [opacity])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const seen = new Set(findings.map((f) => f.id))
    for (const [id, mk] of markers.current) if (!seen.has(id)) (mk.remove(), markers.current.delete(id))
    for (const f of findings) {
      if (markers.current.has(f.id)) continue
      const pin = document.createElement('button')
      pin.className = `ghost-pin ghost-${f.class.toLowerCase()}`
      pin.type = 'button'
      pin.setAttribute('aria-label', `${hazards.classes[f.class].label}, ${f.year}, about ${f.distanceM} m away`)
      pin.textContent = hazards.classes[f.class].short[0]!
      const popup = new Popup({ offset: 18, maxWidth: '320px' }).setDOMContent(popupContent(f))
      popup.on('open', () => onSelect(f.id))
      popup.on('close', () => onSelect(null))
      markers.current.set(f.id, new Marker({ element: pin }).setLngLat(f.lonLat).setPopup(popup).addTo(m))
    }
  }, [findings, onSelect])

  useEffect(() => {
    for (const [id, mk] of markers.current) {
      const open = mk.getPopup()?.isOpen()
      if (id === selected && !open) mk.togglePopup()
      if (id !== selected && open) mk.togglePopup()
    }
    const f = findings.find((x) => x.id === selected)
    if (f) map.current?.easeTo({ center: f.lonLat, duration: 600 })
  }, [selected, findings])

  return <div ref={el} className="map" role="region" aria-label="Map of the address with the historic fire-insurance map overlaid" />
}
