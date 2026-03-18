import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { cache, TTL, CACHE_KEYS } from './cache.js'

describe('Cache', () => {
  before(() => {
    cache.invalidateAll()
  })

  after(() => {
    cache.invalidateAll()
  })

  it('returns null for missing key', () => {
    assert.equal(cache.get('missing'), null)
  })

  it('stores and retrieves a value', () => {
    cache.set('test:key', { foo: 'bar' }, TTL.githubIssues)
    assert.deepEqual(cache.get('test:key'), { foo: 'bar' })
  })

  it('returns null and removes entry after TTL expiry', async () => {
    cache.set('test:expired', 'data', 1) // 1ms TTL
    await new Promise(r => setTimeout(r, 10))
    assert.equal(cache.get('test:expired'), null)
    // entry should have been removed from the store on access
    const sizeBefore = cache.size
    cache.get('test:expired')
    assert.equal(cache.size, sizeBefore)
  })

  it('promotes entry to tail on get (LRU order)', () => {
    cache.invalidateAll()
    cache.set('lru:a', 'A', TTL.snapshot)
    cache.set('lru:b', 'B', TTL.snapshot)
    cache.set('lru:c', 'C', TTL.snapshot)

    // Access 'a' → moves to tail, 'b' becomes the oldest entry
    cache.get('lru:a')

    // Fill cache to MAX_CACHE_SIZE - 1 (3 entries already present: a, b, c)
    for (let i = 0; i < 997; i++) {
      cache.set(`lru:fill:${i}`, i, TTL.snapshot)
    }
    // One more entry pushes size over the limit → oldest entry ('b') is evicted
    cache.set('lru:trigger', 'X', TTL.snapshot)

    assert.equal(cache.get('lru:b'), null, 'b should have been evicted (oldest)')
    assert.equal(cache.get('lru:a'), 'A',  'a should still be alive (was promoted)')
  })

  it('reports correct size', () => {
    cache.invalidateAll()
    assert.equal(cache.size, 0)
    cache.set('s:1', 1, TTL.snapshot)
    cache.set('s:2', 2, TTL.snapshot)
    assert.equal(cache.size, 2)
  })

  it('invalidate() removes only matching prefix', () => {
    cache.invalidateAll()
    cache.set('bsi:markup:accordion', 'x', TTL.snapshot)
    cache.set('bsi:markup:button', 'y', TTL.snapshot)
    cache.set('devkit:index', 'z', TTL.snapshot)

    cache.invalidate('bsi:markup:')
    assert.equal(cache.get('bsi:markup:accordion'), null)
    assert.equal(cache.get('bsi:markup:button'), null)
    assert.equal(cache.get('devkit:index'), 'z')
  })

  it('invalidateAll() empties the cache', () => {
    cache.set('x:1', 1, TTL.snapshot)
    cache.invalidateAll()
    assert.equal(cache.size, 0)
  })

})

describe('CACHE_KEYS', () => {
  it('generates correct key strings', () => {
    assert.equal(CACHE_KEYS.bsiMarkup('accordion'), 'bsi:markup:accordion')
    assert.equal(CACHE_KEYS.devKitStories('button'), 'devkit:stories:button')
    assert.equal(CACHE_KEYS.githubIssues('card'), 'github:issues:card')
    assert.equal(CACHE_KEYS.bsiStatus(), 'bsi:status')
    assert.equal(CACHE_KEYS.dsMeta(), 'ds:meta')
  })
})