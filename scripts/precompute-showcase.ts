/**
 * Read one showcase place end to end and save it to src/content/showcases/<id>.json.
 * Usage: tsx scripts/precompute-showcase.ts <id> "<title>" "<address or label>" [lon lat] [radiusM]
 * With no lon/lat the address is geocoded; with lon/lat the label is shown as-is.
 */
import { writeFileSync } from 'node:fs'
import { Budget } from '../src/server/budget'
import { lookupDeps } from '../src/server/deps'
import { geocodeAddress } from '../src/server/geocode'
import { findSheetsDetailed } from '../src/server/lookup'
import { readLookup, type ReadEvent } from '../src/server/readSession'
import { MemoryStore } from '../src/server/store'
import { fetchTileImage } from '../src/server/vision/image'
import { callVisionModel, modelConfigFromEnv } from '../src/server/vision/model'
import { PROMPT_VERSION } from '../src/server/vision/read'

const [id, title, address, lonArg, latArg, rArg] = process.argv.slice(2)
if (!id || !title || !address || !/^[a-z0-9-]+$/.test(id)) throw new Error('usage: <id> "<title>" "<address>" [lon lat] [radiusM]')

let lon: number, lat: number, matched: string
if (lonArg && latArg) {
  ;[lon, lat, matched] = [Number(lonArg), Number(latArg), address]
} else {
  const g = await geocodeAddress(address)
  if (!g) throw new Error(`No geocode match for ${address}`)
  ;[lon, lat, matched] = [g.lon, g.lat, g.matched]
}
const radiusM = rArg ? Number(rArg) : 100

const started = Date.now()
const { result, transformers } = await findSheetsDetailed([lon, lat], radiusM, await lookupDeps())
if (result.defaultYear === null) throw new Error('No sheets here')
const year = result.defaultYear
const model = modelConfigFromEnv()
const store = new MemoryStore()
const budget = new Budget(store, { readsPerDay: 60, liveLookupsPerIpPerDay: 99 })

let done: Extract<ReadEvent, { type: 'done' }> | undefined
for await (const ev of readLookup(
  result,
  transformers,
  { store, budget, model, fetchImage: (u) => fetchTileImage(u), callModel: (c, p, i) => callVisionModel(c, p, i) },
  { year, clientKey: 'precompute', lookupId: id, budget, timeBudgetMs: 30 * 60_000 },
)) {
  const s = ((Date.now() - started) / 1000).toFixed(0)
  if (ev.type === 'tile') console.log(`${s}s tile ${ev.done}/${ev.total} ${ev.status}${ev.reason ? ` (${ev.reason})` : ''}: ${ev.findings.map((f) => `${f.class} "${f.mapText.replace(/\s+/g, ' ')}" ${f.distanceM}m`).join('; ')}`)
  else if (ev.type === 'done') done = ev
  else console.log(`${s}s ${ev.type}`, JSON.stringify(ev))
}
if (!done) throw new Error('Reading did not finish; nothing saved')

const out = {
  id,
  title,
  address,
  matched,
  lon,
  lat,
  radiusM,
  year,
  years: result.years,
  readOn: new Date().toISOString().slice(0, 10),
  model: model.modelId,
  promptVersion: PROMPT_VERSION,
  total: done.total,
  read: done.read,
  unread: done.unread,
  sheets: result.sheets.filter((s) => s.year === year).map((s) => ({ item: s.item, idx: s.idx, year: s.year, annotationUrl: s.annotationUrl })),
  findings: done.findings,
}
writeFileSync(`src/content/showcases/${id}.json`, JSON.stringify(out, null, 1))
console.log(`saved src/content/showcases/${id}.json: ${out.findings.length} findings, ${done.read}/${done.total} tiles read, ${await budget.readsUsed()} model calls, ${((Date.now() - started) / 1000).toFixed(0)} s`)
