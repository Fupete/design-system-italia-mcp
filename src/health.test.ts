// src/health.test.ts
// ─── Unit tests for src/health.ts ────────────────────────────────────────────
// Run with: npm run test:health

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getHealth, _resetHealthCache, type HealthDeps } from './health.js'

const okMeta = async () => ({
  versions: {},
  components: new Map(),
  foundations: [],
  fetchedAt: '2026-03-17T00:00:00Z',
})

function makeOkFetch(): typeof fetch {
  return async () => ({ ok: true, status: 200 }) as Response
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getHealth', () => {

  it('does not re-probe sources when cache is warm', async () => {
    _resetHealthCache()

    // First call — populates cache
    const deps: HealthDeps = {
      fetchFn: makeOkFetch(),
      loadMeta: okMeta,
    }
    await getHealth(1, deps)

    // Second call — must not invoke fetch or loadMeta
    let callCount = 0
    const spyDeps: HealthDeps = {
      fetchFn: async () => { callCount++; return { ok: true, status: 200 } as Response },
      loadMeta: async () => { callCount++; return okMeta() },
    }

    const result = await getHealth(99, spyDeps)

    assert.equal(callCount, 0, 'no probes must run on warm cache')
    assert.equal(result.uptime, 99, 'uptime must be updated even on cache hit')
  })

  it('marks a source as degraded when it exceeds the probe timeout', async () => {
    _resetHealthCache()

    const neverResolves = new Promise<never>(() => {/* intentionally hangs */})
    const deps: HealthDeps = {
      fetchFn: async () => { await neverResolves; return {} as Response },
      loadMeta: okMeta,
    }

    const result = await getHealth(1, deps)

    assert.equal(result.status, 'degraded')
    assert.equal(result.sources.dataFetched.ok, false)
    assert.equal(result.sources.githubApi.ok, false)
    assert.match(result.sources.dataFetched.error ?? '', /timeout/)
  })

})