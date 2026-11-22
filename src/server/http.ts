import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { clientKey, RateLimiter } from './rateLimit'

// 30 lookups per minute per IP, per function instance.
const limiter = new RateLimiter(30, 60_000)

/** Shared wrapper: GET only, per-IP rate limit, zod errors → 400, everything else → 502/500 without internals. */
export function handler(fn: (req: VercelRequest, res: VercelResponse) => Promise<void>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      res.status(405).json({ error: 'Method not allowed' })
      return
    }
    if (!limiter.allow(clientKey(req.headers))) {
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
