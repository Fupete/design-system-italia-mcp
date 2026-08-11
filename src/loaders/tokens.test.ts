import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTokenName, roleFor, hopFor, parseDesignTokens, parseBridge, parseBsiMap, resolveChain } from './tokens.js'
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

// ─── parseDesignTokens ──────────────────────────────────────────────────────
// design-tokens-italia/_variables.scss — $it-*: value; [// comment]
// Fixture 0 for composedOf (v0.4.1 -> v0.4.2/v0.5.0 prerequisite): these lock
// in today's correct behavior for pure literal / pure reference / comment
// cases before isRef gets re-anchored to stop misfiring on composite values.

describe('parseDesignTokens', () => {
  it('parses a pure literal value', () => {
    const scss = '$it-spacing-6x: 24px;'
    const map = parseDesignTokens(scss)
    assert.equal(map.get('--it-spacing-6x'), '24px')
  })

  it('keeps a trailing comment folded into the value string', () => {
    // This is exactly the format that produced the "1.5rem (24px)" example
    // that shipped in a tool description by mistake (#3) — the comment is
    // real data here, not noise, but it also means a composite value can
    // never be told apart from "value + comment" by this format alone.
    const scss = '$it-spacing-6x: 24px; // 6x la dimensione della baseline'
    const map = parseDesignTokens(scss)
    assert.equal(map.get('--it-spacing-6x'), '24px (6x la dimensione della baseline)')
  })

  it('parses a pure reference to another $it- variable', () => {
    const scss = '$it-spacing-m: $it-spacing-6x;'
    const map = parseDesignTokens(scss)
    assert.equal(map.get('--it-spacing-m'), '--it-spacing-6x')
  })

  it('handles multiple variables across lines, skipping non-variable lines', () => {
    const scss = [
      '// Spacing scale',
      '$it-spacing-m: $it-spacing-6x;',
      '',
      '$it-spacing-6x: 24px; // 6x la dimensione della baseline',
      '@use "sass:map";',
    ].join('\n')
    const map = parseDesignTokens(scss)
    assert.equal(map.size, 2)
    assert.equal(map.get('--it-spacing-m'), '--it-spacing-6x')
    assert.equal(map.get('--it-spacing-6x'), '24px (6x la dimensione della baseline)')
  })

  it('KNOWN BUG (composedOf target): a composite value starting with $ is misread as a pure reference', () => {
    // isRef today is `value.startsWith('$')` — unanchored. A composite like
    // box-shadow's offset/blur/color triple, written as a chain of $it-*
    // references, starts with $ too, so it takes the isRef branch and gets
    // sliced as if the WHOLE value were one variable name. This test locks
    // in today's actual (wrong) output so the isRef anchoring fix (step 1)
    // has something concrete to change and re-verify against — update this
    // test, don't just delete it, when isRef becomes anchored.
    const scss = '$it-elevation-low: $it-shadow-offset-s 0 $it-shadow-blur-s $it-color-shadow-whisper;'
    const map = parseDesignTokens(scss)
    assert.equal(
      map.get('--it-elevation-low'),
      '--it-shadow-offset-s 0 $it-shadow-blur-s $it-color-shadow-whisper'
    )
  })
})

// ─── parseBridge ────────────────────────────────────────────────────────────
// BSI _root.scss — --#{$prefix}x: #{tokens.$it-x}; (Sass compile-time interpolation)

describe('parseBridge', () => {
  it('parses a single bridge line', () => {
    const scss = '  --#{$prefix}spacing-m: #{tokens.$it-spacing-m};'
    const map = parseBridge(scss)
    assert.equal(map.get('--bsi-spacing-m'), '--it-spacing-m')
  })

  it('handles multiple bridge lines and skips non-matching ones', () => {
    const scss = [
      ':root {',
      '  --#{$prefix}spacing-m: #{tokens.$it-spacing-m};',
      '  --#{$prefix}color-primary: #{tokens.$it-color-primary};',
      '  // not a bridge line',
      '  --#{$prefix}legacy: $some-sass-var;',
      '}',
    ].join('\n')
    const map = parseBridge(scss)
    assert.equal(map.size, 2)
    assert.equal(map.get('--bsi-spacing-m'), '--it-spacing-m')
    assert.equal(map.get('--bsi-color-primary'), '--it-color-primary')
  })

  it('returns an empty map when nothing matches the bridge format', () => {
    const scss = '$it-spacing-m: 24px; // not a bridge line at all'
    const map = parseBridge(scss)
    assert.equal(map.size, 0)
  })
})

// ─── parseBsiMap ────────────────────────────────────────────────────────────
// bsi/custom-properties.json — only token-reference entries (value starts
// with var(...)); literals are handled separately via classifyValue() in bsi.ts.

describe('parseBsiMap', () => {
  it('parses a single-reference token-reference entry', () => {
    const raw = {
      accordion: [
        { 'variable-name': '--bsi-accordion-body-padding-x', value: 'var(--bsi-spacing-m)' },
      ],
    }
    const map = parseBsiMap(raw)
    assert.equal(map.get('--bsi-accordion-body-padding-x'), '--bsi-spacing-m')
  })

  it('skips literal (non-var) values entirely', () => {
    const raw = {
      accordion: [
        { 'variable-name': '--bsi-accordion-border-width', value: '1px' },
      ],
    }
    const map = parseBsiMap(raw)
    assert.equal(map.size, 0)
  })

  it('merges entries across multiple components into one flat map', () => {
    const raw = {
      accordion: [{ 'variable-name': '--bsi-accordion-body-padding-x', value: 'var(--bsi-spacing-m)' }],
      card: [{ 'variable-name': '--bsi-card-padding', value: 'var(--bsi-spacing-l)' }],
    }
    const map = parseBsiMap(raw)
    assert.equal(map.size, 2)
    assert.equal(map.get('--bsi-card-padding'), '--bsi-spacing-l')
  })

  it('KNOWN BUG (composedOf target): a composite value with an embedded var() is dropped entirely, not partially resolved', () => {
    // A box-shadow-style composite like "0 var(--bsi-shadow-x) 4px" doesn't
    // start with 'var(', so it fails parseBsiMap's own startsWith check and
    // never enters the map at all — not even a wrong entry, just silence.
    // This is the BSI-side twin of the DTI-side bug above: classifyValue()
    // in bsi.ts has the exact same startsWith('var(') gate and would call
    // this value 'literal', so tools never even attempt to resolve it.
    const raw = {
      accordion: [
        { 'variable-name': '--bsi-accordion-shadow', value: '0 var(--bsi-shadow-x) 4px' },
      ],
    }
    const map = parseBsiMap(raw)
    assert.equal(map.size, 0)
  })

  it('KNOWN BUG (composedOf target): only the first var() in a multi-reference value is captured', () => {
    // Even in the cases parseBsiMap DOES accept (value starts with 'var('),
    // the anchored capture group only grabs the first reference — a value
    // like "var(--a) var(--b)" silently loses --b, no error, no partial hint.
    const raw = {
      accordion: [
        { 'variable-name': '--bsi-accordion-multi', value: 'var(--bsi-color-a) var(--bsi-color-b)' },
      ],
    }
    const map = parseBsiMap(raw)
    assert.equal(map.get('--bsi-accordion-multi'), '--bsi-color-a')
    // --bsi-color-b is nowhere — this assertion documents the loss, not a fix
  })
})

// ─── resolveChain ───────────────────────────────────────────────────────────
// The core recursive resolver — --bsi-* -> --bsi-* -> --it-* -> --it-* -> literal.
// These fixtures mirror the real, verified accordion chain from this session:
// --bsi-accordion-body-padding-x -> --bsi-spacing-m -> $it-spacing-m ->
// $it-spacing-6x -> 24px.

describe('resolveChain', () => {
  const bsiMap = new Map([
    ['--bsi-accordion-body-padding-x', '--bsi-spacing-m'],
  ])
  const bridge = new Map([
    ['--bsi-spacing-m', '--it-spacing-m'],
  ])
  const dtiRaw: DtiMap = new Map([
    ['--it-spacing-m', '--it-spacing-6x'],
    ['--it-spacing-6x', '24px'],
  ])

  it('follows the full 4-hop chain to a concrete literal', () => {
    const { value, chain } = resolveChain('--bsi-accordion-body-padding-x', bsiMap, bridge, dtiRaw)
    assert.equal(value, '24px')
    assert.deepEqual(chain.map((h) => h.name), [
      '--bsi-spacing-m',
      '--it-spacing-m',
      '--it-spacing-6x',
    ])
  })

  it('resolves a single-hop chain (--bsi- straight to bridge target with a literal)', () => {
    const shortBridge = new Map([['--bsi-radius-m', '--it-radius-m']])
    const shortDti: DtiMap = new Map([['--it-radius-m', '8px']])
    const { value, chain } = resolveChain('--bsi-radius-m', new Map(), shortBridge, shortDti)
    assert.equal(value, '8px')
    assert.equal(chain.length, 1)
    assert.equal(chain[0].name, '--it-radius-m')
  })

  it('returns null with an empty chain when a --bsi- name has no bsiMap or bridge entry', () => {
    const { value, chain } = resolveChain('--bsi-nonexistent', new Map(), new Map(), new Map())
    assert.equal(value, null)
    assert.deepEqual(chain, [])
  })

  it('returns null when a --it- name has no dtiRaw entry', () => {
    const { value, chain } = resolveChain('--it-nonexistent', new Map(), new Map(), new Map())
    assert.equal(value, null)
    assert.deepEqual(chain, [])
  })

  it('returns null for a name that is neither --bsi- nor --it-', () => {
    const { value, chain } = resolveChain('--custom-something', new Map(), new Map(), new Map())
    assert.equal(value, null)
    assert.deepEqual(chain, [])
  })

it('breaks a cycle instead of recursing forever', () => {
    // --it-a -> --it-b -> --it-a — the visited set must stop this, not the
    // call stack. A real occurrence would mean bad upstream data, not a
    // Filo bug, but Filo must degrade to null, not crash the process.
    //
    // value is the signal that resolution failed — chain is NOT empty: each
    // stack frame prepends its own hop before returning, so the chain still
    // accumulates every hop walked before the cycle was detected (--it-b,
    // then --it-a), even though the walk never reached a concrete value.
    // Don't rely on chain.length === 0 to detect an unresolvable chain,
    // check value === null instead.
    const cyclicDti: DtiMap = new Map([
      ['--it-a', '--it-b'],
      ['--it-b', '--it-a'],
    ])
    const { value, chain } = resolveChain('--it-a', new Map(), new Map(), cyclicDti)
    assert.equal(value, null)
    assert.deepEqual(chain.map((h) => h.name), ['--it-b', '--it-a'])
  })

  it('KNOWN BUG (composedOf target): a composite bsiMap value only follows its single stored reference', () => {
    // Once parseBsiMap starts preserving composite values (the fix above),
    // resolveChain itself will ALSO need to change — today it treats
    // bsiMap.get(name) as always a single --bsi-*/--it-* name to recurse
    // into, with no concept of "this hop actually has 3 embedded
    // references, resolve all of them". This test exists to be replaced,
    // not extended, once the composedOf data model lands (probably an
    // array of sub-chains per hop instead of one linear array).
    const compositeBsiMap = new Map([
      ['--bsi-accordion-shadow', '--bsi-shadow-x'], // today: only one ref survives parseBsiMap at all
    ])
    const compositeBridge = new Map([['--bsi-shadow-x', '--it-shadow-x']])
    const compositeDti: DtiMap = new Map([['--it-shadow-x', '2px']])
    const { value } = resolveChain('--bsi-accordion-shadow', compositeBsiMap, compositeBridge, compositeDti)
    assert.equal(value, '2px')
    // The real composite ("0 var(--bsi-shadow-x) 4px") is lost long before
    // this point today — see the parseBsiMap KNOWN BUG test above.
  })
})