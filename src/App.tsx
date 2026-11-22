import { lazy, Suspense, useState, type FormEvent } from 'react'
import hazards from './content/hazards.json'
import { geocode } from './ui/api'
import { SHOWCASES, showcasePlace, type Place } from './ui/places'

// the map stack (MapLibre + Allmaps) is ~2 MB; load it only when a place is opened
const Results = lazy(() => import('./ui/Results').then((m) => ({ default: m.Results })))

export default function App() {
  const [place, setPlace] = useState<Place | null>(null)
  if (place)
    return (
      <Suspense fallback={<p className="loading">Opening the old map…</p>}>
        <Results place={place} onBack={() => setPlace(null)} />
      </Suspense>
    )
  return <Landing onPlace={setPlace} />
}

function Landing({ onPlace }: { onPlace(p: Place): void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const g = await geocode(q)
      onPlace({ matched: g.matched, lon: g.lon, lat: g.lat, radiusM: 150 })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="landing">
      <div className="fog" aria-hidden="true" />
      <p className="eyebrow">Ghost Lot</p>
      <h1>What used to haunt your address?</h1>
      <p className="lede">
        We lay the Library of Congress fire-insurance maps from 1867–1930 over today’s streets, then read them for old gasoline tanks, filling stations, garages, workshops and rail lines near you.
      </p>

      <section className="showcases" aria-label="Showcase addresses">
        <h2>Start with a fully read example</h2>
        <div className="chips">
          {SHOWCASES.map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => onPlace(showcasePlace(s))}>
              <span>{s.title}</span>
              <span className="muted">
                {s.year} · {s.findings.length} readings
              </span>
            </button>
          ))}
        </div>
      </section>

      <form className="search" onSubmit={submit}>
        <label htmlFor="q">Or look up a US street address</label>
        <div className="row">
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="100 Gault Ave N, Fort Payne, AL" autoComplete="street-address" minLength={5} maxLength={200} required />
          <button type="submit" disabled={busy}>
            {busy ? 'Finding…' : 'Look up'}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="muted small">Live AI readings are limited each day on the free tier. The old map itself always loads.</p>
      </form>

      <p className="disclaimer">{hazards.disclaimer}</p>
    </main>
  )
}
