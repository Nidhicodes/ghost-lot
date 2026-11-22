import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

const ok = () => new Response('{"ok":true}', { status: 200 })

describe('ensureAwake', () => {
  it('waits through a cold start, reports it as slow, then stays awake', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls++
      if (calls < 3) throw new TypeError('Failed to fetch') // Render's loading page, no CORS
      return ok()
    })
    vi.stubGlobal('fetch', fetchMock)
    const { ensureAwake } = await import('./api')
    const onSlow = vi.fn()

    const p = ensureAwake(onSlow)
    await vi.advanceTimersByTimeAsync(10_000)
    await p
    expect(onSlow).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    await ensureAwake()
    expect(fetchMock).toHaveBeenCalledTimes(3) // no new health check while it is known to be awake
  })

  it('does not report slow when the API answers at once, and shares one check between callers', async () => {
    const fetchMock = vi.fn(async () => ok())
    vi.stubGlobal('fetch', fetchMock)
    const { ensureAwake } = await import('./api')
    const onSlow = vi.fn()
    await Promise.all([ensureAwake(onSlow), ensureAwake(onSlow)])
    expect(onSlow).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up after two minutes with a plain message', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const { ensureAwake } = await import('./api')
    const p = ensureAwake()
    const caught = p.catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(130_000)
    expect(await caught).toMatch(/did not wake up/)
  })
})
