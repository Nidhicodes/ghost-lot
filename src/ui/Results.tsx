import { useCallback, useEffect, useMemo, useState } from 'react'
import { mergeFindings, type Finding } from '../server/findings'
import { findSheets, streamReading, type LookupResult } from './api'
import { MapView } from './MapView'
import { RiskCard } from './RiskCard'
import type { Place } from './places'

type Status = { kind: 'loading' } | { kind: 'reading'; done: number; total: number } | { kind: 'done' } | { kind: 'paused'; why: 'daily_budget' | 'client_limit' } | { kind: 'error'; message: string }

export function Results({ place, onBack }: { place: Place; onBack(): void }) {
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [year, setYear] = useState<number | null>(place.showcase?.year ?? null)
  const [findings, setFindings] = useState<Finding[]>(place.showcase?.findings ?? [])
  const [unread, setUnread] = useState(place.showcase?.unread ?? 0)
  const [status, setStatus] = useState<Status>(place.showcase ? { kind: 'done' } : { kind: 'loading' })
  const [opacity, setOpacity] = useState(0.85)
  const [selected, setSelected] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const centre = useMemo<[number, number]>(() => [place.lon, place.lat], [place])
  const onProblem = useCallback((m: string) => setProblem((p) => p ?? m), [])

  // live lookups: find the sheets (no AI involved, so this works even when reading is paused)
  useEffect(() => {
    if (place.showcase) return
    findSheets(place.lat, place.lon, place.radiusM)
      .then((r) => {
        setLookup(r)
        setYear(r.defaultYear)
        if (r.defaultYear === null) setStatus({ kind: 'done' })
      })
      .catch((e: Error) => setStatus({ kind: 'error', message: e.message }))
  }, [place])

  // live lookups: stream the AI reading for the chosen year
  useEffect(() => {
    if (place.showcase || year === null || !lookup) return
    setFindings([])
    setUnread(0)
    setStatus({ kind: 'reading', done: 0, total: 0 })
    return streamReading(place.lat, place.lon, place.radiusM, year, {
      onEvent(ev) {
        if (ev.type === 'plan') setStatus({ kind: 'reading', done: 0, total: ev.total })
        else if (ev.type === 'tile') {
          setStatus({ kind: 'reading', done: ev.done, total: ev.total })
          if (ev.status === 'unread') setUnread((n) => n + 1)
          setFindings((fs) => mergeFindings(fs, ev.findings))
        } else if (ev.type === 'paused') setStatus({ kind: 'paused', why: ev.reason })
        else if (ev.type === 'done') setStatus({ kind: 'done' })
      },
      onError: (message) => setStatus({ kind: 'error', message }),
    })
  }, [place, year, lookup])

  const annotationUrls = useMemo(() => {
    const sheets = place.showcase ? place.showcase.sheets : (lookup?.sheets ?? [])
    return [...new Set(sheets.filter((s) => s.year === year).map((s) => s.annotationUrl))]
  }, [place, lookup, year])

  const years = place.showcase?.years ?? lookup?.years ?? []
  const onSelect = useCallback((id: string | null) => setSelected(id), [])
  const noMaps = !place.showcase && lookup !== null && lookup.sheets.length === 0

  return (
    <div className="results">
      <div className="toolbar no-print">
        <button type="button" className="secondary" onClick={onBack}>
          ← New address
        </button>
        <span className="matched" title="The address the geocoder matched">
          {place.matched}
        </span>
        {years.length > 1 && (
          <label>
            Map year{' '}
            <select value={year ?? ''} onChange={(e) => setYear(Number(e.target.value))} disabled={!!place.showcase}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="opacity">
          Old map{' '}
          <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} aria-label="Old map opacity" />
        </label>
        <StatusLine status={status} />
      </div>

      {noMaps ? (
        <div className="empty">
          <h2>No historic fire-insurance maps cover this spot</h2>
          {lookup?.nearest ? (
            <p>
              The nearest covered place is {lookup.nearest.city}, {lookup.nearest.state} (maps from {lookup.nearest.years.join(', ')}), about {Math.round(lookup.nearest.distanceM / 1000)} km away.
            </p>
          ) : (
            <p>There is no covered place within 25 km. The Library of Congress collection mostly covers towns and cities mapped before 1931.</p>
          )}
        </div>
      ) : (
        <div className="split">
          <div className="map-wrap">
            {problem && (
              <p className="map-problem" role="alert">
                {problem}
              </p>
            )}
            <MapView centre={centre} radiusM={place.radiusM} annotationUrls={annotationUrls} opacity={opacity} findings={findings} selected={selected} onSelect={onSelect} onProblem={onProblem} />
          </div>
          {year !== null && (
            <RiskCard
              address={place.matched}
              year={year}
              findings={findings}
              incomplete={unread > 0 || status.kind === 'paused'}
              paused={status.kind === 'paused' && status.why === 'daily_budget'}
              reading={status.kind === 'reading' || status.kind === 'loading'}
              onSelect={setSelected}
            />
          )}
        </div>
      )}
    </div>
  )
}

function StatusLine({ status }: { status: Status }) {
  const text =
    status.kind === 'loading'
      ? 'Finding old maps…'
      : status.kind === 'reading'
        ? status.total
          ? `Reading tile ${status.done} of ${status.total}`
          : 'Reading…'
        : status.kind === 'paused'
          ? status.why === 'client_limit'
            ? 'You have used today’s live readings. Try a showcase address.'
            : 'AI reading paused for today'
          : status.kind === 'error'
            ? status.message
            : ''
  return (
    <span className="status" role="status" aria-live="polite">
      {text}
    </span>
  )
}
