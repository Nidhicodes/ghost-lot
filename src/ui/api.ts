import type { Finding } from '../server/findings'
import type { LookupResult } from '../server/lookup'
import type { ReadEvent } from '../server/readSession'

/** Empty in dev (same origin); the Render API URL in production, set at build time. */
const API = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export interface Geocoded {
  lon: number
  lat: number
  matched: string
}

const WAKE_SLOW_MS = 2_500
const WAKE_GIVE_UP_MS = 120_000
/** Render spins the free API down after 15 idle minutes; re-check well before that. */
const AWAKE_FOR_MS = 10 * 60_000

let waking: Promise<void> | undefined
let awakeAt = 0
let slow = false
const slowListeners = new Set<() => void>()

/**
 * Resolve once the API answers /api/health. The free Render API takes about a minute to wake,
 * and while it does, requests fail (Render serves its own loading page without CORS headers),
 * so callers wait here instead. `onSlow` fires if waking takes longer than a moment.
 */
export function ensureAwake(onSlow?: () => void): Promise<void> {
  if (Date.now() - awakeAt < AWAKE_FOR_MS) return Promise.resolve()
  if (onSlow) {
    if (slow) onSlow()
    else slowListeners.add(onSlow)
  }
  waking ??= (async () => {
    const timer = setTimeout(() => {
      slow = true
      for (const l of slowListeners) l()
    }, WAKE_SLOW_MS)
    try {
      for (const started = Date.now(); Date.now() - started < WAKE_GIVE_UP_MS; ) {
        try {
          if ((await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(20_000) })).ok) {
            awakeAt = Date.now()
            return
          }
        } catch {
          // still waking; Render's loading page has no CORS headers, so this looks like a network error
        }
        await new Promise((r) => setTimeout(r, 3_000))
      }
      throw new Error('The map service did not wake up. Try again in a minute.')
    } finally {
      clearTimeout(timer)
      slow = false
      slowListeners.clear()
      waking = undefined
    }
  })()
  return waking
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}

export const geocode = async (q: string, onSlow?: () => void) => {
  await ensureAwake(onSlow)
  return getJson<Geocoded>(`${API}/api/geocode?${new URLSearchParams({ q })}`)
}

export const findSheets = async (lat: number, lon: number, r: number, onSlow?: () => void) => {
  await ensureAwake(onSlow)
  return getJson<LookupResult>(`${API}/api/sheets?${new URLSearchParams({ lat: String(lat), lon: String(lon), r: String(r) })}`)
}

export interface ReadHandlers {
  onEvent(ev: ReadEvent): void
  onError(message: string): void
}

/**
 * Stream /api/read. When the server stops at its time limit (`more`), reconnect: the tiles
 * already read come back from the server cache instantly.
 */
export function streamReading(lat: number, lon: number, r: number, year: number, h: ReadHandlers): () => void {
  let closed = false
  let source: EventSource | undefined
  const open = () => {
    source = new EventSource(`${API}/api/read?${new URLSearchParams({ lat: String(lat), lon: String(lon), r: String(r), year: String(year) })}`)
    for (const type of ['plan', 'tile', 'paused', 'more', 'done', 'error']) {
      source.addEventListener(type, (e) => {
        const ev = JSON.parse((e as MessageEvent).data) as ReadEvent | { type: 'error'; error: string }
        if (ev.type === 'error') {
          h.onError(ev.error)
          source?.close()
          return
        }
        h.onEvent(ev)
        if (ev.type === 'more' && !closed) {
          source?.close()
          open()
        } else if (ev.type === 'done' || ev.type === 'paused') {
          source?.close()
        }
      })
    }
    source.onerror = () => {
      if (source?.readyState === EventSource.CLOSED && !closed) h.onError('The connection dropped. Try again.')
    }
  }
  open()
  return () => {
    closed = true
    source?.close()
  }
}

export type { Finding, LookupResult, ReadEvent }
