import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTokenName, roleFor, hopFor } from './tokens.js'
import type { DtiMap, BridgeMap } from './tokens.js'

// ─── normalizeTokenName ─────────────────────────────────────────────────────

describe('normalizeTokenName', () => {
  it('passes through --bsi-* unchanged', () => {
    assert.equal(normalizeTokenName('--bsi-spacing-m'), '--bsi-spacing-m')
  })

  it('passes through --it-* unchanged', () => {
    assert.equal(normalizeTokenName('--it-spacing-m'), '--it-spacing-m')
  })

  it('converts $it-* to --it-*', () => {
    assert.equal(normalizeTokenName('$it-spacing-m'), '--it-spacing-m')
  })

  it('extracts from var(--bsi-x)', () => {
    assert.equal(normalizeTokenName('var(--bsi-spacing-m)'), '--bsi-spacing-m')
  })

  it('extracts from var(--bsi-x, fallback) — with a fallback value', () => {
    assert.equal(normalizeTokenName('var(--bsi-spacing-m, 1rem)'), '--bsi-spacing-m')
  })

  it('extracts from var( --bsi-x ) — extra whitespace after the paren', () => {
    assert.equal(normalizeTokenName('var( --bsi-spacing-m )'), '--bsi-spacing-m')
  })

  it('extracts from #{tokens.$it-x} — Sass compile-time interpolation form', () => {
    assert.equal(normalizeTokenName('#{tokens.$it-spacing-m}'), '--it-spacing-m')
  })

  it('extracts from tokens.$it-x — same form without interpolation braces', () => {
    assert.equal(normalizeTokenName('tokens.$it-spacing-m'), '--it-spacing-m')
  })

  it('is case-insensitive', () => {
    assert.equal(normalizeTokenName('--BSI-Spacing-M'), '--bsi-spacing-m')
    assert.equal(normalizeTokenName('$IT-Spacing-M'), '--it-spacing-m')
  })

  it('adds -- prefix to a bare name', () => {
    assert.equal(normalizeTokenName('bsi-spacing-m'), '--bsi-spacing-m')
    assert.equal(normalizeTokenName('it-spacing-m'), '--it-spacing-m')
  })

  it('trims surrounding whitespace', () => {
    assert.equal(normalizeTokenName('  --bsi-spacing-m  '), '--bsi-spacing-m')
  })
})

// ─── roleFor / hopFor ───────────────────────────────────────────────────────

describe('roleFor — dtiRaw as primary discriminant', () => {
  it('classifies a --it-* name as dti', () => {
    const dtiRaw: DtiMap = new Map([['--it-spacing-m', '1.5rem']])
    const bridge: BridgeMap = new Map()
    assert.equal(roleFor('--it-spacing-m', dtiRaw, bridge), 'dti')
  })

  it('classifies a dtiRaw key WITHOUT the it- prefix as dti — not bsi-component', () => {
    // parseDesignTokens maps ANY $foo: to --foo, not only $it-foo. A prefix-only
    // check would misclassify this as bsi-component (overridable: true), which
    // is exactly the false claim T-MANIP exists to prevent.
    const dtiRaw: DtiMap = new Map([['--custom-shadow-token', '0 2px 4px black']])
    const bridge: BridgeMap = new Map()
    assert.equal(roleFor('--custom-shadow-token', dtiRaw, bridge), 'dti')
  })

  it('classifies a --bsi-* bridge key as bsi-global', () => {
    const dtiRaw: DtiMap = new Map()
    const bridge: BridgeMap = new Map([['--bsi-spacing-m', '--it-spacing-m']])
    assert.equal(roleFor('--bsi-spacing-m', dtiRaw, bridge), 'bsi-global')
  })

  it('classifies any other --bsi-* as bsi-component', () => {
    const dtiRaw: DtiMap = new Map()
    const bridge: BridgeMap = new Map()
    assert.equal(roleFor('--bsi-accordion-padding', dtiRaw, bridge), 'bsi-component')
  })
})

describe('hopFor — sourceName and form', () => {
  it('a dti hop exposes the $it- Sass source form and overridable: false', () => {
    const dtiRaw: DtiMap = new Map([['--it-spacing-6x', '24px']])
    const bridge: BridgeMap = new Map()
    const hop = hopFor('--it-spacing-6x', dtiRaw, bridge)
    assert.equal(hop.sourceName, '$it-spacing-6x')
    assert.equal(hop.form, 'sass-variable')
    assert.equal(hop.overridable, false)
  })

  it('a bsi hop exposes itself as the source and overridable: true', () => {
    const dtiRaw: DtiMap = new Map()
    const bridge: BridgeMap = new Map([['--bsi-spacing-m', '--it-spacing-m']])
    const hop = hopFor('--bsi-spacing-m', dtiRaw, bridge)
    assert.equal(hop.sourceName, '--bsi-spacing-m')
    assert.equal(hop.form, 'css-custom-property')
    assert.equal(hop.overridable, true)
  })
})