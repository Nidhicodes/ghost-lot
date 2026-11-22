import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Local stand-in for Vercel functions: serves /api/<name> from api/<name>.ts with a minimal
 * req.query / res.status / res.json shim. Dev only; server env vars never reach the client bundle.
 */
function devApi(): Plugin {
  return {
    name: 'ghost-lot-dev-api',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''))
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        const name = url.pathname.slice('/api/'.length)
        if (!/^[a-z]+$/.test(name)) {
          res.statusCode = 404
          return res.end()
        }
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`)
          const vreq = Object.assign(req, { query: Object.fromEntries(url.searchParams) })
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
          })
          await mod.default(vreq, vres)
        } catch (e) {
          server.config.logger.error(String(e))
          if (!res.headersSent) res.statusCode = 500
          res.end()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devApi()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
})
