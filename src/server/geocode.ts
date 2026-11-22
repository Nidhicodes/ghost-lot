import { z } from 'zod'

export const AddressQuery = z.string().trim().min(5).max(200)

export interface GeocodeResult {
  lon: number
  lat: number
  matched: string
}

const CensusResponse = z.object({
  result: z.object({
    addressMatches: z.array(
      z.object({
        matchedAddress: z.string(),
        coordinates: z.object({ x: z.number(), y: z.number() }),
      }),
    ),
  }),
})

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'

export class GeocoderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'GeocoderError'
  }
}

/** US Census one-line geocoder. Returns null when the address has no match. */
export async function geocodeAddress(address: string, fetchImpl: typeof fetch = fetch): Promise<GeocodeResult | null> {
  const q = AddressQuery.parse(address)
  const url = `${CENSUS_URL}?${new URLSearchParams({ address: q, benchmark: 'Public_AR_Current', format: 'json' })}`
  let res: Response
  try {
    res = await fetchImpl(url, { headers: { 'User-Agent': 'GhostLot/0.1 (Kiroween 2026)' }, signal: AbortSignal.timeout(10_000) })
  } catch (e) {
    throw new GeocoderError(`Census geocoder unreachable: ${(e as Error).message}`)
  }
  if (!res.ok) throw new GeocoderError(`Census geocoder returned ${res.status}`, res.status)
  const parsed = CensusResponse.safeParse(await res.json())
  if (!parsed.success) throw new GeocoderError('Census geocoder returned an unexpected shape')
  const m = parsed.data.result.addressMatches[0]
  return m ? { lon: m.coordinates.x, lat: m.coordinates.y, matched: m.matchedAddress } : null
}
