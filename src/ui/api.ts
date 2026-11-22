import type { Finding } from '../server/findings'
import type { LookupResult } from '../server/lookup'
import type { ReadEvent } from '../server/readSession'

export interface Geocoded {
  lon: number
  lat: number
  matched: string
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}

export const geocode = (q: string) => getJson<Geocoded>(`/api/geocode?${new URLSearchParams({ q })}`)

export const findSheets = (lat: number, lon: number, r: number) =>
  getJson<LookupResult>(`/api/sheets?${new URLSearchParams({ lat: String(lat), lon: String(lon), r: String(r) })}`)

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
    source = new EventSource(`/api/read?${new URLSearchParams({ lat: String(lat), lon: String(lon), r: String(r), year: String(year) })}`)
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
