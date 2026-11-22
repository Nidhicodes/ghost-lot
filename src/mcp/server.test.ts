import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import type { Point } from '@allmaps/types'
import fortPayneVolume from '../geo/__fixtures__/sanborn00045_004.main.iiif.json'
import { parseSheets } from '../geo/annotation'
import { Budget } from '../server/budget'
import type { LookupDeps } from '../server/lookup'
import { buildPlaces, buildStateIndex, sheetBbox, StateIndex, type SheetRef } from '../server/sheetIndex'
import { MemoryStore } from '../server/store'
import type { ReadDeps } from '../server/vision/read'
import { createMcpServer } from './server'

const DOWNTOWN: Point = [-85.72261, 34.441126]
const refs: SheetRef[] = parseSheets(fortPayneVolume).map((s, idx) => ({ item: 'sanborn00045_004', idx, year: 1927, bbox: sheetBbox(s) }))
const al = StateIndex.fromSerialized(JSON.parse(JSON.stringify(buildStateIndex('AL', refs))))
const b = refs.map((r) => r.bbox)
const lookup: LookupDeps = {
  states: { AL: { bbox: [Math.min(...b.map((x) => x[0])), Math.min(...b.map((x) => x[1])), Math.max(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))] } },
  places: buildPlaces(refs.map((r) => ({ ...r, city: 'Fort Payne', state: 'AL' }))),
  loadState: async () => al,
  loadAnnotation: async () => fortPayneVolume,
}

async function connect(calls: string[]) {
  const store = new MemoryStore()
  const reader: ReadDeps = {
    store,
    budget: new Budget(store, { readsPerDay: 5, liveLookupsPerIpPerDay: 9 }),
    model: { baseUrl: 'http://model.invalid', modelId: 'fake', apiKey: 'k' },
    fetchImage: async () => 'jpeg',
    callModel: async (_c, prompt) => {
      calls.push(prompt)
      return calls.length === 1
        ? '{"hazards":[{"class":"AUTO","map_text":"GARAGE CAP. 5 CARS","where":"center"}]}'
        : '{"gasoline_tank_marks":1,"positions":["top-left"]}'
    },
  }
  const [a, z] = InMemoryTransport.createLinkedPair()
  await createMcpServer({ lookup: async () => lookup, reader: () => reader }).connect(a)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(z)
  return client
}

const json = (r: Awaited<ReturnType<Client['callTool']>>) => JSON.parse((r.content as { text: string }[])[0]!.text)
const at = { lat: DOWNTOWN[1], lon: DOWNTOWN[0], radius_m: 100 }

describe('ghost-lot MCP server', () => {
  it('lists both tools', async () => {
    const tools = await (await connect([])).listTools()
    expect(tools.tools.map((t) => t.name).sort()).toEqual(['find_sheets', 'read_tile'])
  })

  it('find_sheets returns the 1927 plan without calling the model', async () => {
    const calls: string[] = []
    const r = json(await (await connect(calls)).callTool({ name: 'find_sheets', arguments: at }))
    expect(r.defaultYear).toBe(1927)
    expect(r.readingPlan.length).toBeGreaterThan(0)
    expect(r.readingPlan[0].url).toMatch(/^https:\/\/tile\.loc\.gov\//)
    expect(calls).toEqual([])
  })

  it('read_tile runs both passes and locates findings near the address', async () => {
    const calls: string[] = []
    const client = await connect(calls)
    const plan = json(await client.callTool({ name: 'find_sheets', arguments: at })).readingPlan
    const r = json(await client.callTool({ name: 'read_tile', arguments: { ...at, tile: plan[0].tile } }))
    expect(calls).toHaveLength(2)
    expect(r.findings.map((f: { class: string }) => f.class).sort()).toEqual(['AUTO', 'FUEL'])
    expect(r.findings.every((f: { distanceM: number }) => f.distanceM < 600)).toBe(true)
  })

  it('read_tile rejects a tile outside the lookup', async () => {
    const r = await (await connect([])).callTool({ name: 'read_tile', arguments: { ...at, tile: 'nope' } })
    expect(r.isError).toBe(true)
  })
})
