import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { cache } from '../cache.js'
import { loadVariants, loadVariantsResolvedSlug } from './bsi.js'

// 'test-component'/'legacy-component'/'missing-component' are not in
// SLUG_ALIASES — slugsToTry() returns a single-element array for them, so
// each loader call makes at most one fetch attempt. Keeps fetch-count
// assertions unambiguous.

describe('bsi.ts — loadVariants / loadVariantsResolvedSlug (#35)', () => {
  beforeEach(() => {
    cache.invalidateAll()
    mock.restoreAll()
  })

  it('shares a single fetch between loadVariantsResolvedSlug and loadVariants for the same slug', async () => {
    let callCount = 0
    mock.method(globalThis, 'fetch', async () => {
      callCount++
      return new Response(JSON.stringify({
        resolvedSlug: 'test-component',
        data: [{ name: 'Default', content: '<div>ok</div>' }],
      }), { status: 200 })
    })

    const resolvedSlug = await loadVariantsResolvedSlug('test-component')
    const variants = await loadVariants('test-component')

    assert.equal(callCount, 1, 'expected one shared fetch, not two')
    assert.equal(resolvedSlug, 'test-component')
    assert.deepEqual(variants, [{ name: 'Default', html: '<div>ok</div>' }])
  })

  it('order does not matter — loadVariants first, then loadVariantsResolvedSlug, still one fetch', async () => {
    let callCount = 0
    mock.method(globalThis, 'fetch', async () => {
      callCount++
      return new Response(JSON.stringify({
        resolvedSlug: 'test-component',
        data: [{ name: 'Default', content: '<div>ok</div>' }],
      }), { status: 200 })
    })

    await loadVariants('test-component')
    await loadVariantsResolvedSlug('test-component')

    assert.equal(callCount, 1)
  })

  it('caches the result — a second call for the same slug makes no new fetch', async () => {
    let callCount = 0
    mock.method(globalThis, 'fetch', async () => {
      callCount++
      return new Response(JSON.stringify({
        resolvedSlug: 'test-component',
        data: [{ name: 'Default', content: '<div>ok</div>' }],
      }), { status: 200 })
    })

    await loadVariants('test-component')
    await loadVariants('test-component')

    assert.equal(callCount, 1)
  })

  it('handles the legacy unwrapped array format — resolvedSlug falls back to the tried slug', async () => {
    mock.method(globalThis, 'fetch', async () => {
      return new Response(JSON.stringify([
        { name: 'Default', content: '<div>legacy</div>' },
      ]), { status: 200 })
    })

    const resolvedSlug = await loadVariantsResolvedSlug('legacy-component')
    const variants = await loadVariants('legacy-component')

    assert.equal(resolvedSlug, 'legacy-component')
    assert.deepEqual(variants, [{ name: 'Default', html: '<div>legacy</div>' }])
  })

  it('returns empty variants and the original slug when every fetch attempt fails', async () => {
    mock.method(globalThis, 'fetch', async () => new Response('not found', { status: 404 }))

    const variants = await loadVariants('missing-component')
    const resolvedSlug = await loadVariantsResolvedSlug('missing-component')

    assert.deepEqual(variants, [])
    assert.equal(resolvedSlug, 'missing-component')
  })
})