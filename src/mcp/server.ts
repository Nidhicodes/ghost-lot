/** Local MCP server for debugging the lookup and reading pipeline from Kiro chat (task 7.3). */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { locateFindings } from '../server/findings'
import { DEFAULT_RADIUS_M, findSheetsDetailed, MAX_RADIUS_M, type LookupDeps } from '../server/lookup'
import { cellCentrePx, PROMPT_VERSION, readTile, type ReadDeps } from '../server/vision/read'

export interface McpDeps {
  lookup(): Promise<LookupDeps>
  /** Built lazily so `find_sheets` works without a model key. */
  reader(): ReadDeps
}

const where = {
  lat: z.number().min(17).max(72).describe('Latitude (WGS84)'),
  lon: z.number().min(-180).max(-64).describe('Longitude (WGS84)'),
  radius_m: z.number().int().min(25).max(MAX_RADIUS_M).default(DEFAULT_RADIUS_M).describe('Search radius in metres'),
}

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }] })

export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'ghost-lot', version: '0.1.0' })

  server.registerTool(
    'find_sheets',
    {
      description: 'List the Sanborn sheets and pass-1 tiles that cover a point. No model calls.',
      inputSchema: where,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ lat, lon, radius_m }) => {
      const { result } = await findSheetsDetailed([lon, lat], radius_m, await deps.lookup())
      return text({
        years: result.years,
        defaultYear: result.defaultYear,
        nearest: result.nearest,
        sheets: result.sheets.map((s, i) => ({ sheet: i, year: s.year, item: s.item, idx: s.idx, annotationUrl: s.annotationUrl, tiles: s.tiles.length })),
        readingPlan: result.readingPlan.map((p) => ({ ...p, url: result.sheets[p.sheet]!.tiles.find((t) => t.key === p.tile)!.url })),
      })
    },
  )

  server.registerTool(
    'read_tile',
    {
      description:
        'Read one tile with the vision model (1-2 calls against the daily budget) and return located findings. ' +
        'Pass a tile key from find_sheets readingPlan.',
      inputSchema: { ...where, tile: z.string().min(1).max(300).describe('Tile key from find_sheets') },
      // spends model quota, so not read-only
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ lat, lon, radius_m, tile }) => {
      const point: [number, number] = [lon, lat]
      const { result, transformers } = await findSheetsDetailed(point, radius_m, await deps.lookup())
      const sheetIdx = result.sheets.findIndex((s) => s.tiles.some((t) => t.key === tile))
      if (sheetIdx < 0) return { ...text({ error: 'Tile is not in this lookup. Call find_sheets with the same point and radius.' }), isError: true }
      const sheet = result.sheets[sheetIdx]!
      const t = sheet.tiles.find((x) => x.key === tile)!
      const reader = deps.reader()
      const outcome = await readTile(t, reader)
      if (outcome.status !== 'read') return text({ tile, url: t.url, ...outcome })
      const findings = locateFindings(outcome.findings, {
        year: sheet.year,
        item: sheet.item,
        tileKey: t.key,
        tileUrl: t.url,
        address: point,
        px: (f) => cellCentrePx(t, f.cell),
        toLonLat: (px) => transformers[sheetIdx]!.toLonLat(px),
      })
      return text({
        tile,
        url: t.url,
        model: reader.model.modelId,
        promptVersion: PROMPT_VERSION,
        cached: outcome.cached,
        partial: outcome.partial ?? false,
        findings: findings.map((f) => ({ class: f.class, mapText: f.mapText, pass: f.pass, distanceM: f.distanceM, lonLat: f.lonLat })),
      })
    },
  )

  return server
}
