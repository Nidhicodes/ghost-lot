import { MemoryStore, type Store } from './store'

let store: Store | undefined

/**
 * One store per function instance for now. Serverless instances do not share memory, so
 * the budget and cache are only approximate until a KV adapter is wired in (task 7.5).
 */
export function sharedStore(): Store {
  store ??= new MemoryStore()
  return store
}
