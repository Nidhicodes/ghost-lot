import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import decisions from '../../eval/skeptic/decisions.json'

type Decision = { drop?: Record<string, string>; mapText?: Record<string, { to: string }> }

describe.each(Object.entries(decisions as Record<string, Decision>))('skeptic decisions for %s', (id, d) => {
  const show = JSON.parse(readFileSync(`src/content/showcases/${id}.json`, 'utf8')) as { findings: { id: string; mapText: string }[] }
  const byId = new Map(show.findings.map((f) => [f.id, f]))

  it('keeps rejected findings out of the showcase', () => {
    for (const fid of Object.keys(d.drop ?? {})) expect(byId.has(fid)).toBe(false)
  })

  it('keeps corrected map text', () => {
    for (const [fid, fix] of Object.entries(d.mapText ?? {})) expect(byId.get(fid)?.mapText).toBe(fix.to)
  })
})
