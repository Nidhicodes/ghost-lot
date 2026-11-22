const LOC_PREFIX = 'https://tile.loc.gov/image-services/iiif/'

/** Download one IIIF region as base64 JPEG. Only Library of Congress URLs are allowed. */
export async function fetchTileImage(url: string, fetchImpl: typeof fetch = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<string> {
  if (!url.startsWith(LOC_PREFIX)) throw new Error('Refusing to fetch a non-LoC image URL')
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': 'GhostLot/0.1 (Kiroween 2026)' }, signal: AbortSignal.timeout(120_000) })
      if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
        return Buffer.from(await res.arrayBuffer()).toString('base64')
      }
      lastError = new Error(`LoC returned ${res.status} ${res.headers.get('content-type') ?? ''}`)
      if (res.status >= 400 && res.status < 500) break
    } catch (e) {
      // LoC often truncates large responses mid-download; that surfaces here
      lastError = e
    }
    await sleep(2000 * 2 ** attempt)
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
