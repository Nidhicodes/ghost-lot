import type { Point } from '@allmaps/types'
import prompts from '../prompts/prompts.json'
import type { Budget } from '../budget'
import type { Store } from '../store'
import type { Tile } from '../tiles'
import { QuotaExhaustedError, RateLimitedError, type ModelConfig } from './model'
import { parsePass1, parsePass2, type Cell, type HazardClass } from './parse'

export const PROMPT_VERSION = prompts.version
const CACHE_TTL_S = 90 * 24 * 3600
const PASS2_TRIGGER = /GARAGE|FILLING|OIL/i

/** A finding as cached: tile-relative, no geography, so it is reusable across lookups. */
export interface RawFinding {
  class: HazardClass
  mapText: string
  pass: 1 | 2
  cell: Cell
}

export type TileOutcome =
  | { status: 'read'; findings: RawFinding[]; cached: boolean; partial?: boolean }
  | { status: 'unread'; reason: string }
  | { status: 'paused'; reason: 'daily_budget' }

export interface ReadDeps {
  store: Store
  budget: Budget
  model: ModelConfig
  fetchImage(url: string): Promise<string>
  callModel(cfg: ModelConfig, prompt: string, jpegBase64: string): Promise<string>
  sleep?(ms: number): Promise<void>
}

export const cacheKey = (model: ModelConfig, tile: Tile) => `tile:${model.modelId}:p${PROMPT_VERSION}:${tile.key}`

class Paused extends Error {}

/** Reserve budget, call the model, and retry short rate limits. Throws Paused when the day is spent. */
async function budgetedCall(deps: ReadDeps, prompt: string, image: string): Promise<string> {
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await deps.budget.reserveRead())) throw new Paused()
    try {
      return await deps.callModel(deps.model, prompt, image)
    } catch (e) {
      if (e instanceof QuotaExhaustedError) {
        await deps.budget.markSpent()
        throw new Paused()
      }
      if (e instanceof RateLimitedError && attempt < 2) {
        await deps.budget.refundRead()
        await sleep(Math.min(e.retryAfterS, 60) * 1000)
        continue
      }
      throw e
    }
  }
  throw new Error('unreachable')
}

/** Call + parse, retrying once if the reply does not parse. */
async function callAndParse<T>(deps: ReadDeps, prompt: string, image: string, parse: (s: string) => T): Promise<T> {
  try {
    return parse(await budgetedCall(deps, prompt, image))
  } catch (e) {
    if (e instanceof Paused || !(e instanceof SyntaxError || (e as Error).name === 'ZodError')) throw e
    return parse(await budgetedCall(deps, prompt, image))
  }
}

export async function readTile(tile: Tile, deps: ReadDeps): Promise<TileOutcome> {
  const key = cacheKey(deps.model, tile)
  const hit = await deps.store.get<RawFinding[]>(key)
  if (hit) return { status: 'read', findings: hit, cached: true }

  let image: string
  try {
    image = await deps.fetchImage(tile.url)
  } catch (e) {
    return { status: 'unread', reason: `scan download failed: ${(e as Error).message}` }
  }

  let pass1
  try {
    pass1 = await callAndParse(deps, prompts.pass1, image, parsePass1)
  } catch (e) {
    if (e instanceof Paused) return { status: 'paused', reason: 'daily_budget' }
    return { status: 'unread', reason: `model reading failed: ${(e as Error).message}` }
  }
  const findings: RawFinding[] = pass1.hazards.map((h) => ({ class: h.class, mapText: h.map_text, pass: 1, cell: h.where }))

  const triggered = findings.some((f) => f.class === 'AUTO' || f.class === 'FUEL' || PASS2_TRIGGER.test(f.mapText))
  if (triggered) {
    try {
      const pass2 = await callAndParse(deps, prompts.pass2, image, parsePass2)
      // pass 2 exists to catch tank marks pass 1 missed; when pass 1 already found fuel, keep its reading
      if (!findings.some((f) => f.class === 'FUEL')) {
        for (const cell of pass2.positions) findings.push({ class: 'FUEL', mapText: 'gasoline tank mark (G.T.)', pass: 2, cell })
      }
    } catch (e) {
      // pass 1 is still worth showing; do not cache, so pass 2 runs on a later visit
      return { status: 'read', findings, cached: false, partial: true }
    }
  }

  await deps.store.set(key, findings, CACHE_TTL_S)
  return { status: 'read', findings, cached: false }
}

const CELL_OFFSETS: Record<Cell, Point> = {
  'top-left': [0, 0], top: [1, 0], 'top-right': [2, 0],
  left: [0, 1], center: [1, 1], right: [2, 1],
  'bottom-left': [0, 2], bottom: [1, 2], 'bottom-right': [2, 2],
}

/** Centre of the named ninth of a tile, in scan pixels. */
export function cellCentrePx(tile: Pick<Tile, 'x' | 'y' | 'w' | 'h'>, cell: Cell): Point {
  const [c, r] = CELL_OFFSETS[cell]
  return [tile.x + ((c + 0.5) * tile.w) / 3, tile.y + ((r + 0.5) * tile.h) / 3]
}
