/** stdio entry for the ghost-lot MCP server (see .kiro/settings/mcp.json). Logs go to stderr; stdout is the protocol. */
import { existsSync } from 'node:fs'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from '../src/mcp/server'
import { Budget } from '../src/server/budget'
import { lookupDeps } from '../src/server/deps'
import { MemoryStore } from '../src/server/store'
import { fetchTileImage } from '../src/server/vision/image'
import { callVisionModel, modelConfigFromEnv } from '../src/server/vision/model'
import type { ReadDeps } from '../src/server/vision/read'

if (existsSync('.env')) process.loadEnvFile('.env')

// per-process store: the cache and budget reset when Kiro restarts the server
const store = new MemoryStore()
const budget = new Budget(store, { readsPerDay: Number(process.env.MCP_READS_PER_RUN ?? 20), liveLookupsPerIpPerDay: 99 })
let reader: ReadDeps | undefined

const server = createMcpServer({
  lookup: () => lookupDeps(),
  reader: () =>
    (reader ??= { store, budget, model: modelConfigFromEnv(), fetchImage: (u) => fetchTileImage(u), callModel: (c, p, i) => callVisionModel(c, p, i) }),
})
await server.connect(new StdioServerTransport())
console.error('ghost-lot MCP server ready on stdio')
