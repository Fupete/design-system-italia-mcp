import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTokenName, roleFor, hopFor, parseDesignTokens, parseBridge, parseBsiMap, resolveChain, resolveComposite, findEmbeddedRefs } from './tokens.js'
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

  it('a composite value starting with $ is no longer misread as a pure reference (isRef anchored, step 1 of composedOf)', () => {
    // Before the fix: unanchored isRef sliced the whole string as if it
    // were one variable name, corrupting it (see git history / #13-#14).
    // After: the composite survives intact as a literal string. It is NOT
    // yet resolved (no embedded $it-* substitution happens here) — that's
    // composedOf itself, still to do. This only stops the corruption.
    const scss = '$it-elevation-low: $it-shadow-offset-s 0 $it-shadow-blur-s $it-color-shadow-whisper;'
    const map = parseDesignTokens(scss)
    assert.equal(
      map.get('--it-elevation-low'),
      '$it-shadow-offset-s 0 $it-shadow-blur-s $it-color-shadow-whisper'
    )
  })

  it('still treats a pure reference (nothing but $var) as a reference, not a literal', () => {
    const scss = '$it-spacing-m: $it-spacing-6x;'
    const map = parseDesignTokens(scss)
    assert.equal(map.get('--it-spacing-m'), '--it-spacing-6x')
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

  it('a composite value with an embedded var() is now preserved raw, not dropped (composedOf step 2)', () => {
    const raw = {
      accordion: [
        { 'variable-name': '--bsi-accordion-shadow', value: '0 var(--bsi-shadow-x) 4px' },
      ],
    }
    const map = parseBsiMap(raw)
    assert.equal(map.get('--bsi-accordion-shadow'), '0 var(--bsi-shadow-x) 4px')
  })

  it('a multi-reference value is also preserved raw — both refs survive for resolveComposite to find', () => {
    const raw = {
      accordion: [
        { 'variable-name': '--bsi-accordion-multi', value: 'var(--bsi-color-a) var(--bsi-color-b)' },
      ],
    }
    const map = parseBsiMap(raw)
    assert.equal(map.get('--bsi-accordion-multi'), 'var(--bsi-color-a) var(--bsi-color-b)')
  })

  it('still stores a single pure reference as a bare name, unchanged from before', () => {
    const raw = {
      accordion: [
        { 'variable-name': '--bsi-accordion-body-padding-x', value: 'var(--bsi-spacing-m)' },
      ],
    }
    const map = parseBsiMap(raw)
    assert.equal(map.get('--bsi-accordion-body-padding-x'), '--bsi-spacing-m')
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

  it('a composite bsiMap value resolves every embedded reference and substitutes into the string', () => {
    const compositeBsiMap = new Map([
      ['--bsi-accordion-shadow', '0 var(--bsi-shadow-x) 4px'],
    ])
    const compositeBridge = new Map([['--bsi-shadow-x', '--it-shadow-x']])
    const compositeDti: DtiMap = new Map([['--it-shadow-x', '2px']])
    const { value, chain, composedOf, note } = resolveChain(
      '--bsi-accordion-shadow', compositeBsiMap, compositeBridge, compositeDti
    )
    assert.equal(value, '0 2px 4px')
    assert.deepEqual(chain, []) // composite path doesn't use the linear chain
    assert.equal(composedOf?.length, 1)
    assert.equal(composedOf?.[0].name, '--bsi-shadow-x')
    assert.equal(composedOf?.[0].value, '2px')
    assert.equal(note, undefined) // fully resolved, no note
  })

  it('a partially-resolved composite substitutes what it can and reports what it could not, via note', () => {
    const compositeBsiMap = new Map([
      ['--bsi-accordion-shadow', '0 var(--bsi-shadow-x) var(--bsi-shadow-missing) 4px'],
    ])
    const compositeBridge = new Map([['--bsi-shadow-x', '--it-shadow-x']])
    const compositeDti: DtiMap = new Map([['--it-shadow-x', '2px']])
    // --bsi-shadow-missing has no bridge/bsiMap entry — dead end
    const { value, composedOf, note } = resolveChain(
      '--bsi-accordion-shadow', compositeBsiMap, compositeBridge, compositeDti
    )
    assert.equal(value, '0 2px var(--bsi-shadow-missing) 4px')
    assert.equal(composedOf?.length, 2)
    assert.equal(composedOf?.find((c) => c.name === '--bsi-shadow-missing')?.value, null)
    assert.match(note ?? '', /1 of 2 distinct embedded references resolved/)
    assert.match(note ?? '', /--bsi-shadow-missing/)
  })
})

// ─── findEmbeddedRefs ───────────────────────────────────────────────────────

describe('findEmbeddedRefs', () => {
  it('finds a single $it- reference embedded mid-string', () => {
    const refs = findEmbeddedRefs('0 $it-shadow-blur-s 4px')
    assert.equal(refs.length, 1)
    assert.equal(refs[0].ref, '$it-shadow-blur-s')
    assert.equal(refs[0].name, '--it-shadow-blur-s')
  })

  it('finds all three real elevation references, in order', () => {
    const refs = findEmbeddedRefs('0 $it-shadow-blur-s $it-shadow-offset-s 0 $it-color-shadow-whisper')
    assert.deepEqual(refs.map((r) => r.name), [
      '--it-shadow-blur-s',
      '--it-shadow-offset-s',
      '--it-color-shadow-whisper',
    ])
  })

  it('finds var(--bsi-*) references too, including one with a fallback', () => {
    const refs = findEmbeddedRefs('0 var(--bsi-shadow-x) var(--bsi-shadow-y, 4px)')
    assert.deepEqual(refs.map((r) => r.name), ['--bsi-shadow-x', '--bsi-shadow-y'])
  })

  it('returns an empty array for a true literal with no embedded references', () => {
    assert.deepEqual(findEmbeddedRefs('24px (6x la dimensione della baseline)'), [])
  })
})

// ─── resolveComposite ───────────────────────────────────────────────────────

describe('resolveComposite', () => {
  it('resolves the real 3-reference elevation-low value end to end', () => {
    const bsiMap = new Map()
    const bridge = new Map()
    const dtiRaw: DtiMap = new Map([
      ['--it-shadow-blur-s', '2px'],
      ['--it-shadow-offset-s', '1px'],
      ['--it-color-shadow-whisper', 'rgba(0,0,0,.08)'],
    ])
    const { value, composedOf, note } = resolveComposite(
      '0 $it-shadow-blur-s $it-shadow-offset-s 0 $it-color-shadow-whisper',
      bsiMap, bridge, dtiRaw
    )
    assert.equal(value, '0 2px 1px 0 rgba(0,0,0,.08)')
    assert.equal(composedOf.length, 3)
    assert.equal(note, undefined)
  })

  it('resolves a real 2-reference spacing composite (autocomplete item spacing)', () => {
    const dtiRaw: DtiMap = new Map([
      ['--it-spacing-xs', '12px'],
      ['--it-spacing-s', '16px'],
    ])
    const bridge = new Map([
      ['--bsi-spacing-xs', '--it-spacing-xs'],
      ['--bsi-spacing-s', '--it-spacing-s'],
    ])
    const { value, composedOf } = resolveComposite(
      'var(--bsi-spacing-xs) var(--bsi-spacing-s)', new Map(), bridge, dtiRaw
    )
    assert.equal(value, '12px 16px')
    assert.equal(composedOf.length, 2)
  })

  it('resolves refs embedded inside calc() — real case, notification padding-right', () => {
    // findEmbeddedRefs/resolveComposite don't parse calc() syntax at all —
    // they just scan the whole string for var(...) occurrences wherever
    // they sit, so calc() falls out correctly without any special-casing.
    const dtiRaw: DtiMap = new Map([
      ['--it-spacing-m', '24px'],
      ['--it-spacing-xl', '40px'],
    ])
    const bridge = new Map([
      ['--bsi-spacing-m', '--it-spacing-m'],
      ['--bsi-spacing-xl', '--it-spacing-xl'],
    ])
    const { value, composedOf } = resolveComposite(
      'calc(var(--bsi-spacing-m) + var(--bsi-spacing-xl))', new Map(), bridge, dtiRaw
    )
    assert.equal(value, 'calc(24px + 40px)')
    assert.equal(composedOf.length, 2)
  })

  it('deduplicates a repeated reference — real case, timeline content-padding (4 refs, 3 identical)', () => {
    const bsiMap = new Map()
    const bridge = new Map([
      ['--bsi-spacing-s', '--it-spacing-s'],
      ['--bsi-spacing-xl', '--it-spacing-xl'],
    ])
    const dtiRaw: DtiMap = new Map([
      ['--it-spacing-s', '16px'],
      ['--it-spacing-xl', '40px'],
    ])
    const { value, composedOf } = resolveComposite(
      'var(--bsi-spacing-s) var(--bsi-spacing-s) var(--bsi-spacing-s) var(--bsi-spacing-xl)',
      bsiMap, bridge, dtiRaw
    )
    assert.equal(value, '16px 16px 16px 40px')
    // 2 distinct refs, not 4 — --bsi-spacing-s resolved once, not three times
    assert.equal(composedOf.length, 2)
    assert.equal(composedOf.filter((c) => c.name === '--bsi-spacing-s').length, 1)
  })
})

// ─── parseDesignTokens — real composite values ─────────────────────────────
// Verified live via tokens_list_globals on 2026-08-11 (post isRef anchoring
// fix, step 1 of composedOf) — design-tokens-italia/_variables.scss really
// does contain composite elevation/shadow tokens, not just a hypothetical.
// Important shape difference from the synthetic fixture above: these do NOT
// start with $ — they start with a literal ("0 "), with $it-* references
// embedded mid-string. composedOf detection can't rely on value.startsWith('$')
// even after anchoring it correctly for the pure-reference case — it needs to
// scan the whole string for embedded references, wherever they occur.

describe('parseDesignTokens — real composite values (elevation/shadow)', () => {
  it('--it-elevation-low survives intact as a literal string, not corrupted', () => {
    const scss = '$it-elevation-low: 0 $it-shadow-blur-s $it-shadow-offset-s 0 $it-color-shadow-whisper;'
    const map = parseDesignTokens(scss)
    assert.equal(
      map.get('--it-elevation-low'),
      '0 $it-shadow-blur-s $it-shadow-offset-s 0 $it-color-shadow-whisper'
    )
  })

  it('--it-elevation-medium survives intact', () => {
    const scss = '$it-elevation-medium: 0 $it-shadow-offset-m $it-shadow-blur-m 0 $it-color-shadow-soft;'
    const map = parseDesignTokens(scss)
    assert.equal(
      map.get('--it-elevation-medium'),
      '0 $it-shadow-offset-m $it-shadow-blur-m 0 $it-color-shadow-soft'
    )
  })

  it('--it-elevation-high survives intact', () => {
    const scss = '$it-elevation-high: 0 $it-shadow-offset-l $it-shadow-blur-l 0 $it-color-shadow-dark;'
    const map = parseDesignTokens(scss)
    assert.equal(
      map.get('--it-elevation-high'),
      '0 $it-shadow-offset-l $it-shadow-blur-l 0 $it-color-shadow-dark'
    )
  })

  it('all three coexist with normal single-value lines, none dropped', () => {
    const scss = [
      '$it-spacing-6x: 24px; // 6x la dimensione della baseline',
      '$it-elevation-low: 0 $it-shadow-blur-s $it-shadow-offset-s 0 $it-color-shadow-whisper;',
      '$it-elevation-medium: 0 $it-shadow-offset-m $it-shadow-blur-m 0 $it-color-shadow-soft;',
      '$it-elevation-high: 0 $it-shadow-offset-l $it-shadow-blur-l 0 $it-color-shadow-dark;',
    ].join('\n')
    const map = parseDesignTokens(scss)
    assert.equal(map.size, 4)
    assert.equal(map.get('--it-elevation-low'), '0 $it-shadow-blur-s $it-shadow-offset-s 0 $it-color-shadow-whisper')
  })

  // NOT yet resolved — composedOf itself (substituting each embedded $it-*
  // with its own resolved value) is still to do. This block only confirms
  // step 1 (isRef anchoring) doesn't corrupt these on the way in.
})