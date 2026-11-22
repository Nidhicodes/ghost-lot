export interface ModelConfig {
  baseUrl: string
  modelId: string
  apiKey: string
}

export class ModelError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'ModelError'
  }
}

/** The provider's daily quota is used up; retrying today is pointless. */
export class QuotaExhaustedError extends ModelError {
  constructor(message: string) {
    super(message, 429)
    this.name = 'QuotaExhaustedError'
  }
}

/** A short-term rate limit; worth retrying after `retryAfterS`. */
export class RateLimitedError extends ModelError {
  constructor(readonly retryAfterS: number) {
    super(`Rate limited; retry after ${retryAfterS}s`, 429)
    this.name = 'RateLimitedError'
  }
}

export function modelConfigFromEnv(env: Record<string, string | undefined> = process.env): ModelConfig {
  const apiKey = env.MODEL_API_KEY || env.GROQ_API_KEY
  if (!apiKey) throw new Error('MODEL_API_KEY is not set')
  return {
    baseUrl: (env.MODEL_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, ''),
    modelId: env.MODEL_ID ?? 'gemini-3.5-flash-lite',
    apiKey,
  }
}

/** Groq says `x-should-retry: false`; Gemini/Groq bodies name a per-day quota. */
export function isDailyQuota(headers: Headers, body: string): boolean {
  if (headers.get('x-should-retry') === 'false') return true
  return /per[ _-]?day|PerDay|tokens per day|TPD|RPD/i.test(body)
}

/** One image + one prompt to an OpenAI-compatible chat endpoint. Returns the raw text reply. */
export async function callVisionModel(cfg: ModelConfig, prompt: string, jpegBase64: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response
  try {
    res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.modelId,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (e) {
    throw new ModelError(`Model request failed: ${(e as Error).message}`)
  }
  if (res.status === 429) {
    const body = await res.text()
    if (isDailyQuota(res.headers, body)) throw new QuotaExhaustedError('Daily model quota exhausted')
    throw new RateLimitedError(Number(res.headers.get('retry-after')) || 20)
  }
  if (!res.ok) throw new ModelError(`Model returned ${res.status}`, res.status)
  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new ModelError('Model reply had no text content')
  return content
}
