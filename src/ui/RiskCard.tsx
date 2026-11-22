import hazards from '../content/hazards.json'
import type { Finding } from '../server/findings'
import type { HazardClass } from '../server/vision/parse'
import { BANDS, sentence, summarise } from './summary'

interface Props {
  address: string
  year: number
  findings: Finding[]
  incomplete: boolean
  paused: boolean
  reading: boolean
  onSelect(id: string): void
}

type Source = keyof typeof hazards.sources

export function RiskCard({ address, year, findings, incomplete, paused, reading, onSelect }: Props) {
  const classes = summarise(findings)
  return (
    <aside className="risk-card" aria-label="What the old map shows">
      <header>
        <p className="eyebrow">What used to haunt this block</p>
        <h2>{address}</h2>
        <p className="muted">Fire-insurance map of {year}, read within the dashed circle</p>
      </header>

      {paused && <p className="notice">{hazards.pausedNotice}</p>}
      {incomplete && <p className="notice">{hazards.incompleteNotice}</p>}
      {reading && <p className="muted">Reading the map, nearest tiles first…</p>}

      {classes.length === 0 && !reading && (
        <p>
          The parts of the {year} map we could read show none of the four hazard types near this address. Uses from other years would not appear here.
        </p>
      )}

      {classes.map((s) => {
        const c = hazards.classes[s.class as HazardClass]
        const items = findings.filter((f) => f.class === s.class).sort((a, b) => a.distanceM - b.distanceM)
        return (
          <section key={s.class} className={`class-block ghost-${s.class.toLowerCase()}`}>
            <h3>
              <span className="swatch" aria-hidden="true">{c.short[0]}</span> {c.label}
            </h3>
            <p>{sentence(s, c.label)}</p>
            <ul className="bands">
              {BANDS.filter((b) => s.byBand[b.id] > 0).map((b) => (
                <li key={b.id}>
                  {b.label}: {s.byBand[b.id]}
                </li>
              ))}
            </ul>
            <ul className="readings">
              {items.map((f) => (
                <li key={f.id}>
                  <button type="button" className="link" onClick={() => onSelect(f.id)}>
                    “{f.mapText.replace(/\s+/g, ' ').trim()}” · {f.distanceM} m
                  </button>
                </li>
              ))}
            </ul>
            <details>
              <summary>Possible contaminants and what to ask</summary>
              <p className="muted">Commonly associated with {c.epaCategory.toLowerCase()}, according to the EPA:</p>
              <ul>
                {c.possibleContaminants.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className="muted">Questions to ask:</p>
              <ul>
                {c.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <p className="sources">
                Sources:{' '}
                {c.sources.map((k, i) => (
                  <span key={k}>
                    {i > 0 && ' · '}
                    <a href={hazards.sources[k as Source].url} target="_blank" rel="noreferrer">
                      {hazards.sources[k as Source].title}
                    </a>
                  </span>
                ))}
              </p>
            </details>
          </section>
        )
      })}

      <footer>
        <p className="disclaimer">{hazards.disclaimer}</p>
        <p className="muted small">Map readings are made by an AI model and can be wrong. Open each pin to check the original map.</p>
        <button type="button" className="secondary no-print" onClick={() => window.print()}>
          Save as PDF
        </button>
      </footer>
    </aside>
  )
}
