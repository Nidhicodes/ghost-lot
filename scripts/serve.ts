import { createApiServer, originsFromEnv } from '../src/server/nodeServer'

// Loopback unless the host explicitly asks for more (Render sets HOST=0.0.0.0 in render.yaml).
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 8787)
const allowedOrigins = originsFromEnv()

createApiServer({ allowedOrigins }).listen(port, host, () => {
  console.log(`Ghost Lot API on http://${host}:${port} (CORS: ${allowedOrigins.join(', ') || 'none'})`)
})
