import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)
const maplibreDir = require.resolve('maplibre-gl/package.json').replace(/package\.json$/, '')
const maplibreVersion = (JSON.parse(readFileSync(`${maplibreDir}package.json`, 'utf8')) as { version: string }).version
const WORKER_PATH = `/maplibre-gl-worker-${maplibreVersion}.mjs`

/**
 * Serve (dev) and emit (build) MapLibre's worker byte-for-byte at WORKER_PATH. Vite's normal
 * module transform would inject its HMR client into the worker, which then fails to start.
 */
function maplibreWorker(): Plugin {
  const source = () => readFileSync(`${maplibreDir}dist/maplibre-gl-worker.mjs`)
  return {
    name: 'ghost-lot-maplibre-worker',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== WORKER_PATH) return next()
        res.setHeader('Content-Type', 'text/javascript')
        res.end(source())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: WORKER_PATH.slice(1), source: source() })
    },
  }
}

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
          const mod = await server.ssrLoadModule(`/src/api/${name}.ts`)
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
  plugins: [react(), maplibreWorker(), devApi()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
})
