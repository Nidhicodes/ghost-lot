/** Spawn the stdio MCP server the way Kiro does and call find_sheets on Fort Payne. `--read` also reads the nearest tile (1-2 model calls). */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'smoke', version: '0' })
await client.connect(new StdioClientTransport({ command: 'npx', args: ['tsx', 'scripts/mcp-server.ts'], stderr: 'inherit' }))
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '))
const r = await client.callTool({ name: 'find_sheets', arguments: { lat: 34.441126, lon: -85.72261, radius_m: 100 } })
const body = JSON.parse((r.content as { text: string }[])[0]!.text)
console.log('years:', body.years.join(', '), '| sheets:', body.sheets.length, '| tiles in plan:', body.readingPlan.length)
console.log('nearest tile:', body.readingPlan[0].tile, `${body.readingPlan[0].distanceM} m`)
if (process.argv.includes('--read')) {
  const t = await client.callTool({ name: 'read_tile', arguments: { lat: 34.441126, lon: -85.72261, radius_m: 100, tile: body.readingPlan[0].tile } })
  console.log('read_tile:', (t.content as { text: string }[])[0]!.text)
}
await client.close()
