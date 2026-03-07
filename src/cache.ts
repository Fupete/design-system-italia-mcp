// ─── In-memory cache with per-source TTL ─────────────────────────────────────

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
    return entry.data as T
  }

  set<T>(key: string, data: T, ttlMs: number): void {
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
}

export const cache = new Cache()

// ─── Per-source TTL (ms) ──────────────────────────────────────────────────────

const DEV = process.env.NODE_ENV !== 'production'

export const TTL = {
  bsiMarkup: DEV ? 60 * 60_000 : 24 * 60 * 60_000,  // 1h dev, 24h prod
  bsiStatus: DEV ? 60 * 60_000 : 4 * 60 * 60_000,  // 1h dev,  4h prod
  bsiTokens: DEV ? 60 * 60_000 : 24 * 60 * 60_000,  // 1h dev, 24h prod
  designers: DEV ? 60 * 60_000 : 24 * 60 * 60_000,  // 1h dev, 24h prod
  designTokens: DEV ? 60 * 60_000 : 24 * 60 * 60_000,  // 1h dev, 24h prod
  designTokensDti: DEV ? 60 * 60_000 : 24 * 60 * 60_000,  // 1h dev, 24h prod
  devKitIndex: DEV ? 15 * 60_000 : 15 * 60_000,        // 15 min sempre
  devKitStories: DEV ? 60 * 60_000 : 4 * 60 * 60_000,  // 1h dev,  4h prod
  githubIssues: DEV ? 15 * 60_000 : 15 * 60_000,        // 15 min sempre
  dsMeta: DEV ? 60 * 60_000 : 24 * 60 * 60_000,   // 1h dev, 24h prod
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
  githubIssues: (slug: string) => `github:issues:${slug}`,
  dsMeta: () => `ds:meta`,
}