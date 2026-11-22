import type { SheetTransformer } from '../geo/transform'
import type { Budget } from './budget'
import { locateFindings, mergeFindings, type Finding } from './findings'
import { planReading, type LookupResult } from './lookup'
import { cacheKey, cellCentrePx, readTile, type ReadDeps } from './vision/read'

export type ReadEvent =
  | { type: 'plan'; year: number; total: number }
  | { type: 'tile'; done: number; total: number; tile: string; status: 'read' | 'unread'; cached: boolean; findings: Finding[]; reason?: string }
  | { type: 'paused'; reason: 'daily_budget' | 'client_limit'; done: number; total: number }
  | { type: 'more'; done: number; total: number }
  | { type: 'done'; total: number; read: number; unread: number; findings: Finding[] }

export interface SessionOptions {
  year: number
  clientKey: string
  lookupId: string
  budget: Budget
  /** Stop and emit `more` after this many ms, so one request fits the function's time limit. */
  timeBudgetMs: number
  now?: () => number
}

/** Read a lookup's tiles for one year, nearest first, yielding progress as it goes. Re-running resumes from the cache. */
export async function* readLookup(
  lookup: LookupResult,
  transformers: SheetTransformer[],
  deps: ReadDeps,
  opts: SessionOptions,
): AsyncGenerator<ReadEvent> {
  const now = opts.now ?? Date.now
  const started = now()
  const plan = planReading(lookup.sheets, lookup.point, opts.year, (i, px) => transformers[i]!.toLonLat(px))
  const total = plan.length
  yield { type: 'plan', year: opts.year, total }

  let findings: Finding[] = []
  let done = 0
  let unread = 0
  let counted = false

  for (const step of plan) {
    if (done > 0 && now() - started > opts.timeBudgetMs) {
      yield { type: 'more', done, total }
      return
    }
    const sheet = lookup.sheets[step.sheet]!
    const tile = sheet.tiles.find((t) => t.key === step.tile)!

    // count this lookup against the client's daily cap only once it is about to spend model calls
    if (!counted && (await deps.store.get(cacheKey(deps.model, tile))) === null) {
      if (!(await opts.budget.allowLiveLookup(opts.clientKey, opts.lookupId))) {
        yield { type: 'paused', reason: 'client_limit', done, total }
        return
      }
      counted = true
    }

    const outcome = await readTile(tile, deps)
    if (outcome.status === 'paused') {
      yield { type: 'paused', reason: 'daily_budget', done, total }
      return
    }
    done++
    if (outcome.status === 'unread') {
      unread++
      yield { type: 'tile', done, total, tile: tile.key, status: 'unread', cached: false, findings: [], reason: outcome.reason }
      continue
    }
    const located = locateFindings(outcome.findings, {
      year: sheet.year,
      item: sheet.item,
      tileKey: tile.key,
      tileUrl: tile.url,
      address: lookup.point,
      px: (f) => cellCentrePx(tile, f.cell),
      toLonLat: (px) => transformers[step.sheet]!.toLonLat(px),
    })
    const before = findings.length
    findings = mergeFindings(findings, located)
    yield { type: 'tile', done, total, tile: tile.key, status: 'read', cached: outcome.cached, findings: findings.slice(before) }
  }
  yield { type: 'done', total, read: done - unread, unread, findings }
}
