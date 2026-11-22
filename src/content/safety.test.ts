import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import hazards from './hazards.json'
import { BANNED, findBanned } from './banned'
import { sentence, summarise } from '../ui/summary'

// Keep in step with .kiro/steering/safety-language.md.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(tsx?|json|css|html)$/.test(n) && !/\.test\.ts$/.test(n) && n !== 'banned.ts' ? [p] : []
  })
}

describe('banned-phrase lint', () => {
  it.each(['src/ui', 'src/content', 'src/App.tsx', 'index.html', 'README.md'].flatMap((d) => (/\.(html|tsx|md)$/.test(d) ? [d] : files(d))))('%s uses no banned phrase', (path) => {
    expect(findBanned(readFileSync(path, 'utf8'))).toEqual([])
  })

  it('catches the phrases the steering file bans', () => {
    expect(findBanned('This lot is contaminated.')).not.toEqual([])
    expect(findBanned('a TOXIC site')).not.toEqual([])
    expect(findBanned('verified safe')).not.toEqual([])
    expect(findBanned('there is a tank here')).not.toEqual([])
    expect(findBanned('Only testing can show whether a site is contaminated.')).toEqual([])
  })

  it('generated risk-card sentences never contain a banned phrase (property)', () => {
    const cls = fc.constantFrom(...(Object.keys(hazards.classes) as (keyof typeof hazards.classes)[]))
    fc.assert(
      fc.property(fc.array(fc.record({ c: cls, d: fc.nat({ max: 400 }), y: fc.integer({ min: 1867, max: 1930 }) }), { minLength: 1, maxLength: 12 }), (rows) => {
        const findings = rows.map((r, i) => ({ id: String(i), class: r.c, mapText: 'X', pass: 1 as const, year: r.y, item: 'i', tileKey: 't', tileUrl: 'u', px: [0, 0] as [number, number], lonLat: [0, 0] as [number, number], distanceM: r.d }))
        for (const s of summarise(findings)) expect(findBanned(sentence(s, hazards.classes[s.class].label))).toEqual([])
      }),
    )
  })

  it('lists the same phrases as the steering file', () => {
    const steering = readFileSync('.kiro/steering/safety-language.md', 'utf8')
    for (const b of BANNED) expect(steering.toLowerCase()).toContain(b.example.toLowerCase())
  })
})
