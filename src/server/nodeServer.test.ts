import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createApiServer, originsFromEnv } from './nodeServer'

/** Drive the server's request handler directly, without opening a port. */
function request(path: string, opts: { method?: string; origin?: string } = {}) {
  const server = createApiServer({ allowedOrigins: ['https://ghost-lot.onrender.com'] })
  const req = new IncomingMessage(new Socket())
  req.url = path
  req.method = opts.method ?? 'GET'
  req.headers = { host: 'api', 'x-forwarded-for': '203.0.113.5', ...(opts.origin ? { origin: opts.origin } : {}) }
  const res = new ServerResponse(req)
  const chunks: Buffer[] = []
  res.write = ((c: unknown) => (chunks.push(Buffer.from(String(c))), true)) as never
  return new Promise<{ status: number; headers: ReturnType<ServerResponse['getHeaders']>; body: string }>((resolve) => {
    res.end = ((c?: unknown) => {
      if (c) chunks.push(Buffer.from(String(c)))
      resolve({ status: res.statusCode, headers: res.getHeaders(), body: Buffer.concat(chunks).toString() })
      return res
    }) as never
    server.emit('request', req, res)
  })
}

describe('createApiServer', () => {
  it('routes /api/health through the shared handler', async () => {
    const r = await request('/api/health')
    expect(r.status).toBe(200)
    expect(JSON.parse(r.body)).toEqual({ ok: true })
  })

  it('validates input exactly like the Vercel functions', async () => {
    const r = await request('/api/sheets?lat=51&lon=0')
    expect(r.status).toBe(400)
  })

  it('sets CORS only for the configured site origin', async () => {
    expect((await request('/api/health', { origin: 'https://ghost-lot.onrender.com' })).headers['access-control-allow-origin']).toBe('https://ghost-lot.onrender.com')
    expect((await request('/api/health', { origin: 'https://evil.example' })).headers['access-control-allow-origin']).toBeUndefined()
  })

  it('answers preflight and 404s anything that is not a known route', async () => {
    expect((await request('/api/sheets', { method: 'OPTIONS' })).status).toBe(204)
    expect((await request('/api/../../etc/passwd')).status).toBe(404)
    expect((await request('/index.html')).status).toBe(404)
    expect((await request('/api/Geocode')).status).toBe(404)
  })

  it('reads a comma-separated origin list and trims trailing slashes', () => {
    expect(originsFromEnv({ ALLOWED_ORIGINS: 'https://a.onrender.com/, https://b.example' })).toEqual(['https://a.onrender.com', 'https://b.example'])
    expect(originsFromEnv({})).toEqual([])
  })
})
