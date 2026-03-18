// ─── In-memory cache with per-source TTL + LRU eviction ──────────────────────

const MAX_CACHE_SIZE = 1000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class Cache {
  private store = new Map<string, CacheEntry<unknown>>()

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    // LRU: promote entry to tail by deleting and re-inserting
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.data as T
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    // If key already exists, remove first to reset LRU position
    if (this.store.has(key)) {
      this.store.delete(key)
    }

    // Evict least recently used entry when size limit is reached
    if (this.store.size >= MAX_CACHE_SIZE) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) {
        this.store.delete(oldest)
        console.log(`[cache] LRU eviction: removed "${oldest}" (size limit ${MAX_CACHE_SIZE})`)
      }
    }

    this.store.set(key, { data, expiresAt: Date.now() + ttlMs })
  }

  invalidate(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key)
    }
  }

  invalidateAll(): void {
    this.store.clear()
  }

  /** Exposed for debug/health check — current number of entries in cache */
  get size(): number {
    return this.store.size
  }
}

export const cache = new Cache()

// ─── Per-source TTL (ms) ──────────────────────────────────────────────────────
// Two buckets:
//   snapshot — all sources from data-fetched branch (updated nightly)
//   issues   — GitHub Issues (only live source at runtime)

const DEV = process.env.NODE_ENV !== 'production'

export const TTL = {
  snapshot: DEV ? 60 * 60_000 : 24 * 60 * 60_000,  // 1h dev, 24h prod
  githubIssues: 15 * 60_000,                         // 15 min always
}

// ─── Cache key prefixes ───────────────────────────────────────────────────────

export const CACHE_KEYS = {
  bsiMarkup: (slug: string) => `bsi:markup:${slug}`,
  bsiStatus: () => `bsi:status`,
  bsiTokens: () => `bsi:tokens`,
  designers: (slug: string) => `designers:${slug}`,
  designTokens: () => `tokens:variables`,
  designTokensDti: () => `tokens:dti`,
  devKitIndex: () => `devkit:index`,
  devKitStories: (slug: string) => `devkit:stories:${slug}`,
  devKitProps: (slug: string) => `devkit:props:${slug}`,
  devKitComponent: (slug: string) => `devkit:component:${slug}`,
  githubIssues: (slug: string) => `github:issues:${slug}`,
  dsMeta: () => `ds:meta`,
}