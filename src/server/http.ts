import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { clientKey } from './rateLimit'
import { sharedStore } from './sharedStore'

const REQUESTS_PER_MINUTE = 30

/**
 * Fixed one-minute window per IP in the shared store, so the limit holds across instances.
 * If the store itself is down, requests are allowed: these endpoints are cheap, and the model
 * budget (which is what costs money) is enforced separately and fails closed.
 */
async function allowRequest(ip: string): Promise<boolean> {
  try {
    const n = await sharedStore().incr(`rl:${ip}:${Math.floor(Date.now() / 60_000)}`, 1, 120)
    return n <= REQUESTS_PER_MINUTE
  } catch (e) {
    console.error('rate limiter unavailable', e)
    return true
  }
}

/** Shared wrapper: GET only, per-IP rate limit, zod errors → 400, everything else → 502/500 without internals. */
export function handler(fn: (req: VercelRequest, res: VercelResponse) => Promise<void>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      res.status(405).json({ error: 'Method not allowed' })
      return
    }
    if (!(await allowRequest(clientKey(req.headers)))) {
      res.setHeader('Retry-After', '60')
      res.status(429).json({ error: 'Too many requests. Try again in a minute.' })
      return
    }
    try {
      await fn(req, res)
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) })
        return
      }
      console.error(e)
      res.status(502).json({ error: 'An upstream service failed. Please try again.' })
    }
  }
}
