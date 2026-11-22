import type { Store } from './store'

/** Gemini's free quota resets at midnight Pacific; use that calendar day everywhere. */
export function quotaDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const TWO_DAYS = 2 * 24 * 3600

export interface BudgetConfig {
  readsPerDay: number
  liveLookupsPerIpPerDay: number
}

export class Budget {
  constructor(private readonly store: Store, private readonly cfg: BudgetConfig, private readonly now = () => new Date()) {}

  private readsKey = () => `reads:${quotaDay(this.now())}`

  /** Reserve one model call. Returns false (and reserves nothing) once the day's budget is spent. */
  async reserveRead(): Promise<boolean> {
    const n = await this.store.incr(this.readsKey(), 1, TWO_DAYS)
    if (n > this.cfg.readsPerDay) {
      await this.store.incr(this.readsKey(), -1, TWO_DAYS)
      return false
    }
    return true
  }

  /** Give back a reservation when the call never reached the model (e.g. the scan download failed). */
  async refundRead(): Promise<void> {
    await this.store.incr(this.readsKey(), -1, TWO_DAYS)
  }

  /** The provider said the daily quota is gone: stop for the rest of the day. */
  async markSpent(): Promise<void> {
    const used = (await this.store.get<number>(this.readsKey())) ?? 0
    await this.store.incr(this.readsKey(), Math.max(0, this.cfg.readsPerDay - used), TWO_DAYS)
  }

  async readsUsed(): Promise<number> {
    return (await this.store.get<number>(this.readsKey())) ?? 0
  }

  /**
   * Count a live lookup for this client once per day per lookup id, so reconnecting to
   * continue the same lookup is free. Returns false when the client is over its daily cap.
   */
  async allowLiveLookup(clientKey: string, lookupId: string): Promise<boolean> {
    const day = quotaDay(this.now())
    const seen = `seen:${clientKey}:${day}:${lookupId}`
    if (await this.store.get<boolean>(seen)) return true
    const n = await this.store.incr(`live:${clientKey}:${day}`, 1, TWO_DAYS)
    if (n > this.cfg.liveLookupsPerIpPerDay) {
      await this.store.incr(`live:${clientKey}:${day}`, -1, TWO_DAYS)
      return false
    }
    await this.store.set(seen, true, TWO_DAYS)
    return true
  }
}
