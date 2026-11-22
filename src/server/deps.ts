import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import type { LookupDeps } from './lookup'
import { annotationUrl, StateIndex, type PlaceRef, type SerializedStateIndex } from './sheetIndex'

/** Env override, then next to the bundled function (production), then the project root (dev, tests). */
function findIndexDir(): string {
  const candidates = [process.env.GHOST_LOT_INDEX_DIR, join(dirname(fileURLToPath(import.meta.url)), 'index'), join(process.cwd(), 'index')]
  return candidates.find((d): d is string => !!d && existsSync(join(d, 'states.json'))) ?? join(process.cwd(), 'index')
}

const INDEX_DIR = findIndexDir()
const STATE_CODE = /^[A-Z]{2}$/
const ITEM_ID = /^[A-Za-z0-9_]{1,40}$/

const stateCache = new Map<string, Promise<StateIndex>>()
const annotationCache = new Map<string, Promise<unknown>>()
const ANNOTATION_CACHE_MAX = 200

let base: Promise<Pick<LookupDeps, 'states' | 'places'>> | undefined

/** File-system index plus mapsnap annotation fetches, memoised per function instance. */
export async function lookupDeps(fetchImpl: typeof fetch = fetch): Promise<LookupDeps> {
  base ??= (async () => ({
    states: JSON.parse(await readFile(join(INDEX_DIR, 'states.json'), 'utf8')),
    places: JSON.parse(await readFile(join(INDEX_DIR, 'places.json'), 'utf8')) as PlaceRef[],
  }))()
  const { states, places } = await base
  return {
    states,
    places,
    loadState(state) {
      if (!STATE_CODE.test(state)) throw new Error(`Bad state code ${state}`)
      let p = stateCache.get(state)
      if (!p) {
        p = readFile(join(INDEX_DIR, `${state}.json.gz`)).then((buf) =>
          StateIndex.fromSerialized(JSON.parse(gunzipSync(buf).toString()) as SerializedStateIndex),
        )
        stateCache.set(state, p)
      }
      return p
    },
    loadAnnotation(item) {
      if (!ITEM_ID.test(item)) throw new Error(`Bad item id ${item}`)
      let p = annotationCache.get(item)
      if (!p) {
        p = fetchAnnotation(item, fetchImpl)
        p.catch(() => annotationCache.delete(item))
        if (annotationCache.size >= ANNOTATION_CACHE_MAX) annotationCache.delete(annotationCache.keys().next().value!)
        annotationCache.set(item, p)
      }
      return p
    },
  }
}

async function fetchAnnotation(item: string, fetchImpl: typeof fetch): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchImpl(annotationUrl(item), { signal: AbortSignal.timeout(15_000) })
      if (res.ok) return await res.json()
      lastError = new Error(`mapsnap returned ${res.status} for ${item}`)
      if (res.status < 500) break
    } catch (e) {
      lastError = e
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
  }
  throw lastError
}
