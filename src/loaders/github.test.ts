import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { cache } from '../cache.js'
import { loadComponentIssues } from './github.js'

describe('github.ts — loadComponentIssues (#36)', () => {
  beforeEach(() => {
    cache.invalidateAll()
    mock.restoreAll()
  })

  it('caches a rate-limit failure — a second call for the same slug does not re-fetch', async () => {
    let callCount = 0
    mock.method(globalThis, 'fetch', async () => {
      callCount++
      return new Response('{}', {
        status: 403,
        headers: { 'X-RateLimit-Reset': '9999999999' },
      })
    })

    const first = await loadComponentIssues('test-component-rl')
    const second = await loadComponentIssues('test-component-rl')

    assert.equal(callCount, 1, 'the second call should be served from cache, not re-hit GitHub')
    assert.deepEqual(first.issues, [])
    assert.match(first.error ?? '', /rate limit/i)
    assert.deepEqual(second, first, 'cached error result should be identical on replay')
  })

  it('caches a generic fetch failure the same way as a rate limit', async () => {
    let callCount = 0
    mock.method(globalThis, 'fetch', async () => {
      callCount++
      return new Response('server error', { status: 500 })
    })

    await loadComponentIssues('test-component-500')
    await loadComponentIssues('test-component-500')

    assert.equal(callCount, 1)
  })

  it('a cached error is distinguishable from a cached real "0 issues" success', async () => {
    mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ total_count: 0, items: [] }), { status: 200 }))

    const result = await loadComponentIssues('test-component-zero')

    assert.deepEqual(result.issues, [])
    assert.equal(result.error, undefined, 'a real empty result must not carry an error field')
  })

  it('caches a successful result — a second call does not re-fetch', async () => {
    let callCount = 0
    mock.method(globalThis, 'fetch', async () => {
      callCount++
      return new Response(JSON.stringify({
        total_count: 1,
        items: [{
          title: 'Test issue',
          html_url: 'https://github.com/italia/bootstrap-italia/issues/1',
          repository_url: 'https://api.github.com/repos/italia/bootstrap-italia',
          state: 'open',
          created_at: '2026-01-01T00:00:00Z',
          labels: [],
        }],
      }), { status: 200 })
    })

    const first = await loadComponentIssues('test-component-success')
    const second = await loadComponentIssues('test-component-success')

    assert.equal(callCount, 1)
    assert.equal(first.issues.length, 1)
    assert.deepEqual(second, first)
  })
})