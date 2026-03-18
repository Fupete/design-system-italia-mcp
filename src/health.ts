// src/health.ts
// ─── Deep health check with per-source probing ────────────────────────────────
// Caches result for HEALTH_CACHE_TTL_MS to avoid hammering upstream.
// Always returns HTTP 200 — degraded state is communicated in the body.

import { SNAPSHOT_META_URL, GITHUB_SEARCH_ISSUES_URL } from './constants.js'
import { getUserAgent } from './fetch.js'
import { loadDsMeta } from './loaders/meta.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceResult {
  ok: boolean
  latencyMs: number
  error?: string
}

interface HealthResult {
  status: 'ok' | 'degraded'
  uptime: number
  sources: {
    dataFetched: SourceResult
    githubApi: SourceResult
    snapshotMeta: SourceResult
  }
  cachedAt: string
}

// Injectable dependencies — overridable in tests without module mocking
export interface HealthDeps {
  fetchFn: typeof fetch
  loadMeta: () => Promise<unknown>
}

const defaultDeps: HealthDeps = {
  fetchFn: fetch,
  loadMeta: loadDsMeta,
}

// ─── Local health-check cache (independent from main cache.ts) ───────────────

const HEALTH_CACHE_TTL_MS = 60_000
const PROBE_TIMEOUT_MS = 5_000

let _cached: HealthResult | null = null
let _cachedAt = 0

// ─── Probe helper ─────────────────────────────────────────────────────────────

async function probe(fn: () => Promise<void>): Promise<SourceResult> {
  const t0 = Date.now()
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS)
      ),
    ])
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Source checks ────────────────────────────────────────────────────────────

/**
 * data-fetched branch — HEAD on snapshot-meta.json.
 * Lightweight: no body download, just confirms the branch is reachable.
 * Uses SNAPSHOT_META_URL (canonical probe target for the CI canary).
 */
function checkDataFetched(fetchFn: typeof fetch): Promise<SourceResult> {
  return probe(async () => {
    const res = await fetchFn(SNAPSHOT_META_URL, {
      method: 'HEAD',
      headers: { 'User-Agent': getUserAgent() },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  })
}

/**
 * GitHub REST API — GET /rate_limit.
 * Always returns 200 (even unauthenticated), costs 0 rate-limit units.
 * Confirms api.github.com is reachable before issues calls.
 */
function checkGithubApi(fetchFn: typeof fetch): Promise<SourceResult> {
  return probe(async () => {
    const url = GITHUB_SEARCH_ISSUES_URL.replace('/search/issues', '/rate_limit')
    const res = await fetchFn(url, {
      method: 'GET',
      headers: {
        'User-Agent': getUserAgent(),
        Accept: 'application/vnd.github+json',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  })
}

/**
 * snapshot-meta — warm-path in-process check.
 * Reads from cache.ts if warm (< 1ms), fetches upstream if cold.
 * Confirms meta is parseable and servable end-to-end.
 */
function checkSnapshotMeta(loadMeta: () => Promise<unknown>): Promise<SourceResult> {
  return probe(async () => {
    const meta = await loadMeta()
    if (!meta) throw new Error('null meta')
  })
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getHealth(
  uptimeSec: number,
  deps: HealthDeps = defaultDeps
): Promise<HealthResult> {
  const now = Date.now()

  if (_cached !== null && now - _cachedAt < HEALTH_CACHE_TTL_MS) {
    // Uptime advances on every call — update without re-probing sources
    return { ..._cached, uptime: uptimeSec }
  }

  const [dataFetched, githubApi, snapshotMeta] = await Promise.all([
    checkDataFetched(deps.fetchFn),
    checkGithubApi(deps.fetchFn),
    checkSnapshotMeta(deps.loadMeta),
  ])

  const degraded = !dataFetched.ok || !githubApi.ok || !snapshotMeta.ok

  const result: HealthResult = {
    status: degraded ? 'degraded' : 'ok',
    uptime: uptimeSec,
    sources: { dataFetched, githubApi, snapshotMeta },
    cachedAt: new Date().toISOString(),
  }

  _cached = result
  _cachedAt = now
  return result
}

// Exposed for tests only — resets the local health cache
export function _resetHealthCache(): void {
  _cached = null
  _cachedAt = 0
}