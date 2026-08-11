import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { cache } from '../cache.js'
import { loadVariants, loadVariantsResolvedSlug, consolidateAmbiguous } from './bsi.js'

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

// ─── consolidateAmbiguous ────────────────────────────────────────────────────

describe('consolidateAmbiguous', () => {
  it('leaves a single-declaration entry unchanged, no declaredTimes/ambiguousValues', () => {
    const entries = [
      { 'variable-name': '--bsi-accordion-body-padding-x', value: 'var(--bsi-spacing-m)', description: 'Padding x' },
    ]
    const tokens = consolidateAmbiguous(entries)
    assert.equal(tokens.length, 1)
    assert.equal(tokens[0].declaredTimes, undefined)
    assert.equal(tokens[0].ambiguousValues, undefined)
  })

  it('does not flag a name repeated with the IDENTICAL value as ambiguous', () => {
    const entries = [
      { 'variable-name': '--bsi-x', value: '1rem', description: 'first' },
      { 'variable-name': '--bsi-x', value: '1rem', description: '' },
    ]
    const tokens = consolidateAmbiguous(entries)
    assert.equal(tokens.length, 1)
    assert.equal(tokens[0].declaredTimes, undefined)
  })

  it('consolidates the real header-brand-size case: 1 declaration with description, 2 without', () => {
    // Mirrors _header.scss exactly — base declaration has a trailing
    // comment, the two @include media-breakpoint-up() overrides don't.
    const entries = [
      { 'variable-name': '--bsi-header-brand-size', value: '2.5rem', description: 'Controls the header brand size.' },
      { 'variable-name': '--bsi-header-brand-size', value: '3.5rem', description: '' },
      { 'variable-name': '--bsi-header-brand-size', value: '4.5rem', description: '' },
    ]
    const tokens = consolidateAmbiguous(entries)
    assert.equal(tokens.length, 1)
    assert.equal(tokens[0].declaredTimes, 3)
    assert.equal(tokens[0].ambiguousValues?.length, 3)
    assert.equal(tokens[0].ambiguousValues?.[0].value, '2.5rem')
    assert.equal(tokens[0].ambiguousValues?.[0].description, 'Controls the header brand size.')
    assert.equal(tokens[0].ambiguousValues?.[1].description, null)
    // Primary value/valueType reflect the first declaration
    assert.equal(tokens[0].value, '2.5rem')
    assert.equal(tokens[0].valueType, 'literal')
  })

  it('handles the real navbar-link-color case: 4 declarations, 3 with distinguishing descriptions', () => {
    // Mirrors _navbar.scss — base/mobile, desktop breakpoint, theme-light,
    // theme-dark all redeclare this name; 3 of the 4 already have a comment
    // that distinguishes them, only the desktop breakpoint one doesn't.
    const entries = [
      { 'variable-name': '--bsi-navbar-link-color', value: 'var(--bsi-color-link)', description: 'nav link color default - mobile, using color tokens.' },
      { 'variable-name': '--bsi-navbar-link-color', value: 'var(--bsi-color-text-inverse)', description: 'nav link color default - desktop.' },
      { 'variable-name': '--bsi-navbar-link-color', value: 'var(--bsi-color-link)', description: '' },
      { 'variable-name': '--bsi-navbar-link-color', value: 'var(--bsi-color-text-inverse)', description: 'nav link color theme dark' },
    ]
    const tokens = consolidateAmbiguous(entries)
    assert.equal(tokens.length, 1)
    assert.equal(tokens[0].declaredTimes, 4)
    // distinct VALUES is what drives declaredTimes, even though only 2
    // distinct values appear across 4 declarations — all 4 are still kept,
    // duplication in ambiguousValues is intentional here (unlike composedOf's
    // dedup, each declaration here is a genuinely separate source line).
    assert.equal(tokens[0].ambiguousValues?.length, 4)
  })

  it('handles multiple ambiguous names in the same component independently, alongside normal entries', () => {
    const entries = [
      { 'variable-name': '--bsi-header-brand-size', value: '2.5rem', description: '' },
      { 'variable-name': '--bsi-header-brand-size', value: '3.5rem', description: '' },
      { 'variable-name': '--bsi-header-nav-text-color', value: 'var(--bsi-color-link)', description: '' },
      { 'variable-name': '--bsi-header-nav-text-color', value: 'var(--bsi-color-text-inverse)', description: '' },
      { 'variable-name': '--bsi-header-spacing-inset', value: 'var(--bsi-spacing-xxs)', description: '' },
    ]
    const tokens = consolidateAmbiguous(entries)
    assert.equal(tokens.length, 3)
    const spacing = tokens.find((t) => t.name === '--bsi-header-spacing-inset')
    assert.equal(spacing?.declaredTimes, undefined)
    const brandSize = tokens.find((t) => t.name === '--bsi-header-brand-size')
    assert.equal(brandSize?.declaredTimes, 2)
    const navText = tokens.find((t) => t.name === '--bsi-header-nav-text-color')
    assert.equal(navText?.declaredTimes, 2)
  })
})