import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { Budget } from '../server/budget'
import { lookupDeps } from '../server/deps'
import { handler } from '../server/http'
import { findSheetsDetailed, SheetsQuery } from '../server/lookup'
import { clientKey } from '../server/rateLimit'
import { readLookup } from '../server/readSession'
import { sharedStore } from '../server/sharedStore'
import { fetchTileImage } from '../server/vision/image'
import { callVisionModel, modelConfigFromEnv } from '../server/vision/model'

const ReadQuery = SheetsQuery.extend({ year: z.coerce.number().int().min(1860).max(1930).optional() })

const intEnv = (v: string | undefined, d: number) => (v && Number.isInteger(Number(v)) ? Number(v) : d)

/**
 * Server-sent events: plan, tile (per tile), then done | more | paused.
 * The tile list is recomputed from lat/lon/r on the server; clients never supply image URLs.
 */
export default handler(async (req: VercelRequest, res: VercelResponse) => {
  const q = ReadQuery.parse(req.query)
  const { result, transformers } = await findSheetsDetailed([q.lon, q.lat], q.r, await lookupDeps())
  const year = q.year ?? result.defaultYear
  if (year === null || !result.years.includes(year)) {
    res.status(404).json({ error: 'No historic map sheets for that place and year.' })
    return
  }

  const store = sharedStore()
  const budget = new Budget(store, {
    readsPerDay: intEnv(process.env.READ_BUDGET_PER_DAY, 70),
    liveLookupsPerIpPerDay: intEnv(process.env.LIVE_LOOKUPS_PER_IP_PER_DAY, 2),
  })
  const model = modelConfigFromEnv()

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Connection', 'keep-alive')
  res.status(200)

  const lookupId = `${q.lat.toFixed(5)},${q.lon.toFixed(5)},${q.r},${year}`
  const events = readLookup(
    result,
    transformers,
    { store, budget, model, fetchImage: (u) => fetchTileImage(u), callModel: (c, p, i) => callVisionModel(c, p, i) },
    { year, clientKey: clientKey(req.headers), lookupId, budget, timeBudgetMs: intEnv(process.env.READ_TIME_BUDGET_MS, 45_000) },
  )
  try {
    for await (const ev of events) res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`)
  } catch (e) {
    // headers are already sent, so report the failure in-stream instead of as a status code
    console.error(e)
    res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: 'Reading stopped because a service failed. Try again.' })}\n\n`)
  }
  res.end()
})
