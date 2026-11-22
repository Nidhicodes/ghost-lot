/** Download the mapsnap v2.0 inputs for build-index into data/raw/ (skips files already present). */
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const BASE = 'https://data.mapsnap.org/runs/v2.0'
const FILES = ['items.tsv', 'mapsnap-v2.0-loc.zip']

mkdirSync('data/raw', { recursive: true })
for (const f of FILES) {
  const dest = `data/raw/${f}`
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`have ${dest}`)
    continue
  }
  const res = await fetch(`${BASE}/${f}`, { headers: { 'User-Agent': 'GhostLot/0.1 (build)' } })
  if (!res.ok || !res.body) throw new Error(`${f}: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(`${dest}.part`))
  renameSync(`${dest}.part`, dest)
  console.log(`fetched ${dest} (${(statSync(dest).size / 1e6).toFixed(1)} MB)`)
}
