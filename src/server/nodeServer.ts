/**
 * Long-running Node server for hosts like Render: serves the same handlers as the Vercel
 * functions at /api/<name>. Static files are hosted separately (Render static site).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import geocode from '../api/geocode'
import health from '../api/health'
import read from '../api/read'
import sheets from '../api/sheets'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown

const ROUTES: Record<string, Handler> = { geocode, sheets, read, health }

export interface ServerOptions {
  /** Exact origins allowed to call the API from a browser (the static site's URL). */
  allowedOrigins: string[]
}

/** Adds the Vercel helper methods our handlers use (req.query, res.status, res.json). */
function withHelpers(req: IncomingMessage, res: ServerResponse, url: URL) {
  const vreq = Object.assign(req, { query: Object.fromEntries(url.searchParams) }) as unknown as VercelRequest
  const vres = Object.assign(res, {
    status(code: number) {
      res.statusCode = code
      return vres
    },
    json(body: unknown) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
      return vres
    },
  }) as unknown as VercelResponse
  return { vreq, vres }
}

export function createApiServer(opts: ServerOptions) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const origin = req.headers.origin
    if (origin && opts.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET')
      res.statusCode = 204
      return res.end()
    }
    const name = /^\/api\/([a-z]+)$/.exec(url.pathname)?.[1]
    const route = name ? ROUTES[name] : undefined
    if (!route) {
      res.statusCode = 404
      return res.end()
    }
    const { vreq, vres } = withHelpers(req, res, url)
    try {
      await route(vreq, vres)
    } catch (e) {
      console.error(e)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    }
  })
}

export function originsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
}
