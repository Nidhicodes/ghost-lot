/**
 * Offline build of the sheet index from mapsnap v2.0.
 * Input:  data/raw/items.tsv and data/raw/mapsnap-v2.0-loc.zip (see README).
 * Output: index/<ST>.json.gz, index/places.json, index/states.json, index/report.json
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { parseSheets, UnsupportedTransformError } from '../../src/geo/annotation'
import {
  buildPlaces,
  buildStateIndex,
  MAX_YEAR,
  sheetBbox,
  type LonLatBbox,
  type SheetRef,
} from '../../src/server/sheetIndex'

const RAW = 'data/raw'
const ZIP = join(RAW, 'mapsnap-v2.0-loc.zip')
const UNZIPPED = join(RAW, 'loc')
const OUT = 'index'

interface Volume {
  item: string
  city: string
  state: string
  year: number
}

function readVolumes(): Map<string, Volume> {
  const [header, ...lines] = readFileSync(join(RAW, 'items.tsv'), 'utf8').trimEnd().split('\n')
  const cols = header!.split('\t')
  const at = (name: string) => {
    const i = cols.indexOf(name)
    if (i < 0) throw new Error(`items.tsv has no column ${name}`)
    return i
  }
  const [iItem, iCity, iState, iYear, iStatus, iMain] = ['item', 'city', 'state', 'year', 'status', 'main'].map(at) as number[]
  const volumes = new Map<string, Volume>()
  for (const line of lines) {
    const f = line.split('\t')
    const year = Number(f[iYear!])
    if (f[iStatus!] !== 'published' || !f[iMain!] || !Number.isInteger(year) || year > MAX_YEAR) continue
    volumes.set(f[iItem!]!, { item: f[iItem!]!, city: f[iCity!]!, state: f[iState!]!, year })
  }
  return volumes
}

function findMainFiles(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) findMainFiles(p, out)
    else if (e.name.endsWith('.main.iiif.json')) out.set(e.name.replace('.main.iiif.json', ''), p)
  }
  return out
}

function main() {
  if (!existsSync(ZIP)) throw new Error(`Missing ${ZIP}. Download it first (see README).`)
  if (!existsSync(UNZIPPED)) {
    mkdirSync(UNZIPPED, { recursive: true })
    execFileSync('unzip', ['-q', ZIP, '-d', UNZIPPED], { stdio: 'inherit' })
  }

  const volumes = readVolumes()
  const files = findMainFiles(UNZIPPED)
  const byState = new Map<string, SheetRef[]>()
  const forPlaces: (SheetRef & { city: string; state: string })[] = []
  const report = { volumesEligible: volumes.size, volumesMissingFile: 0, volumesRead: 0, sheets: 0, sheetErrors: 0, unsupportedTransforms: 0, errors: [] as string[] }
  const started = Date.now()

  for (const vol of volumes.values()) {
    const file = files.get(vol.item)
    if (!file) {
      report.volumesMissingFile++
      continue
    }
    let sheets
    try {
      sheets = parseSheets(JSON.parse(readFileSync(file, 'utf8')))
    } catch (e) {
      // one bad sheet fails the whole page parse; retry sheet by sheet so the rest survive
      sheets = null
      if (e instanceof UnsupportedTransformError) report.unsupportedTransforms++
    }
    const page = sheets ? null : (JSON.parse(readFileSync(file, 'utf8')) as { items: unknown[] })
    const items = sheets ? sheets.map((s, idx) => ({ s, idx })) : page!.items.map((raw, idx) => ({ raw, idx }))
    report.volumesRead++

    for (const entry of items) {
      try {
        const sheet = 's' in entry ? entry.s : parseSheets({ ...page, items: [entry.raw] })[0]!
        const bbox: LonLatBbox = sheetBbox(sheet)
        if (!bbox.every(Number.isFinite)) throw new Error('non-finite bbox')
        const ref: SheetRef = { item: vol.item, idx: entry.idx, year: vol.year, bbox }
        const list = byState.get(vol.state) ?? []
        list.push(ref)
        byState.set(vol.state, list)
        forPlaces.push({ ...ref, city: vol.city, state: vol.state })
        report.sheets++
      } catch (e) {
        report.sheetErrors++
        if (e instanceof UnsupportedTransformError) report.unsupportedTransforms++
        if (report.errors.length < 50) report.errors.push(`${vol.item}#${entry.idx}: ${(e as Error).message}`)
      }
    }
    if (report.volumesRead % 2000 === 0) {
      console.log(`${report.volumesRead}/${volumes.size} volumes, ${report.sheets} sheets, ${((Date.now() - started) / 1000).toFixed(0)} s`)
    }
  }

  mkdirSync(OUT, { recursive: true })
  const states: Record<string, { sheets: number; bbox: LonLatBbox; bytes: number }> = {}
  for (const [state, refs] of [...byState].sort()) {
    const gz = gzipSync(JSON.stringify(buildStateIndex(state, refs)), { level: 9 })
    writeFileSync(join(OUT, `${state}.json.gz`), gz)
    const bbox: LonLatBbox = [
      Math.min(...refs.map((r) => r.bbox[0])),
      Math.min(...refs.map((r) => r.bbox[1])),
      Math.max(...refs.map((r) => r.bbox[2])),
      Math.max(...refs.map((r) => r.bbox[3])),
    ]
    states[state] = { sheets: refs.length, bbox, bytes: gz.length }
  }
  writeFileSync(join(OUT, 'states.json'), JSON.stringify(states, null, 1))
  writeFileSync(join(OUT, 'places.json'), JSON.stringify(buildPlaces(forPlaces)))
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...report, seconds: (Date.now() - started) / 1000 }, null, 1))
  const { errors: _errors, ...summary } = report
  console.log(JSON.stringify({ ...summary, states: byState.size, seconds: (Date.now() - started) / 1000 }))
}

main()
