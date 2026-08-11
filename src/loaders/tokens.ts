import { fetchText, fetchJson } from '../fetch.js'
import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { loadAllTokens, classifyValue } from './bsi.js'
import type { CssToken, ResolvedHop, TokenRole, ComposedRef } from '../types.js'
import { SNAPSHOT_DTI_VARIABLES_SCSS_URL, SNAPSHOT_BSI_ROOT_SCSS_URL, SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL } from '../constants.js'

// Map 1: --bsi-* component tokens (custom-properties.json) — token-reference entries only
// Map 2: --bsi-* → --it-* bridge (BSI _root.scss v3 — Sass compile-time via #{tokens.$it-*})
// Map 3: --it-* → value or --it-* reference (design-tokens-italia > _variables.scss)
//
// Resolution chain: --bsi-accordion-padding → --bsi-spacing-m → --it-spacing-m → --it-spacing-6x → 24px

// ─── Parsers ──────────────────────────────────────────────────────────────────
// Exported so canary.config.ts validates the live chain with the exact same
// parsing logic the server uses, instead of a duplicated regex that can drift
// out of sync (this drift is what caused the v0.3.12 root.scss bug).

export type DtiMap = Map<string, string>     // --it-* → value, --it-* reference, or a raw composite string
export type BridgeMap = Map<string, string>  // --bsi-* → --it-* (root.scss)
type BsiMap = Map<string, string>     // --bsi-* → bare next-hop name, or a raw composite string (custom-properties.json)

// Format: $it-spacing-m: 1.5rem; // 24px
export function parseDesignTokens(scss: string): DtiMap {
  const map: DtiMap = new Map()
  for (const line of scss.split('\n')) {
    const match = line.match(/^\$([a-z0-9-]+):\s*([^;]+);(?:\s*\/\/\s*(.+))?/)
    if (!match) continue
    const [, varName, rawValue, comment] = match
    const cssName = `--${varName}`
    const value = rawValue.trim()
    // Anchored: the ENTIRE value must be a single $var reference, not just
    // start with $. A composite value (e.g. a shadow shorthand built from
    // several $it-* references) also starts with $ but isn't a pure
    // reference — the old unanchored check sliced the whole string as if it
    // were one variable name, corrupting it. composedOf (resolving what's
    // embedded in the composite) is handled downstream in resolveChain,
    // not here — this fix only stops the misclassification on the way in.
    const isRef = /^\$[a-z0-9-]+$/.test(value)
    map.set(cssName, isRef
      ? `--${value.slice(1)}`
      : comment?.trim() ? `${value} (${comment.trim()})` : value
    )
  }
  return map
}

// Format: --#{$prefix}spacing-m: #{tokens.$it-spacing-m};
export function parseBridge(scss: string): BridgeMap {
  const map: BridgeMap = new Map()
  for (const line of scss.split('\n')) {
    const match = line.match(/--#\{\$prefix\}([a-z0-9-]+):\s*#\{tokens\.\$it-([a-z0-9-]+)\}/)
    if (!match) continue
    const [, bsiSuffix, itSuffix] = match
    map.set(`--bsi-${bsiSuffix}`, `--it-${itSuffix}`)
  }
  return map
}

// Extract --bsi-* → next-hop from custom-properties.json. Two shapes stored:
// - Pure single reference (var(--x), optionally with a fallback): stores the
//   bare next-hop name, e.g. "--bsi-spacing-m" — resolveChain follows it
//   directly, same as before.
// - Composite (contains var(...) somewhere but isn't itself a single pure
//   reference, e.g. "var(--bsi-spacing-xs) var(--bsi-spacing-s)" or
//   "calc(var(--bsi-spacing-m) + var(--bsi-spacing-xl))"): stores the RAW
//   value string as-is. resolveChain distinguishes the two by shape (a bare
//   name matches /^--(bsi|it)-[a-z0-9-]+$/, a raw composite string doesn't)
//   and resolves the composite by scanning it for every embedded reference
//   (composedOf), instead of discarding it (the old bug — 8 real entries in
//   custom-properties.json as of 2026-08-11, verified via diagnostic script).
type RawTokensJson = Record<string, Array<{ 'variable-name': string; value: string }>>

export function parseBsiMap(raw: RawTokensJson): BsiMap {
  const map: BsiMap = new Map()
  for (const entries of Object.values(raw)) {
    for (const e of entries) {
      const singleRef = e.value.match(/^var\((--[a-z0-9-]+)(?:,\s*[^)]+)?\)$/)
      if (singleRef) {
        map.set(e['variable-name'], singleRef[1])
        continue
      }
      if (/var\(--[a-z0-9-]+\)/.test(e.value)) {
        map.set(e['variable-name'], e.value)
      }
    }
  }
  return map
}

// ─── Manipulability role ────────────────────────────────────────────────────
// A node's role is intrinsic to what it is, not to how it was reached:
// a --bsi-* name that's a key in the global bridge is "bsi-global"
// (root.scss level, e.g. --bsi-spacing-m); any other --bsi-* is
// "bsi-component" (per-component custom-properties.json entry); anything
// --it-* is "dti" (central Design Token, not overridable per-project).

export function roleFor(name: string, dtiRaw: DtiMap, bridge: BridgeMap): TokenRole {
  if (dtiRaw.has(name)) return 'dti'
  if (bridge.has(name)) return 'bsi-global'
  return 'bsi-component'
}

export function hopFor(name: string, dtiRaw: DtiMap, bridge: BridgeMap): ResolvedHop {
  const role = roleFor(name, dtiRaw, bridge)
  return {
    name,
    sourceName: role === 'dti' ? `$${name.replace(/^--/, '')}` : name,
    form: role === 'dti' ? 'sass-variable' : 'css-custom-property',
    role,
    overridable: role !== 'dti',
  }
}

// ─── Composite value detection & resolution ────────────────────────────────
// A composite is a value with one or more references embedded ANYWHERE in
// the string (not just at the start) — e.g. a spacing shorthand
// ("var(--bsi-spacing-xs) var(--bsi-spacing-s)") or a calc() expression
// ("calc(var(--bsi-spacing-m) + var(--bsi-spacing-xl))"). Detection can't
// rely on startsWith(), the reference doesn't have to be first, and there
// can be more than one. Verified against real custom-properties.json data
// (2026-08-11): 8 entries across 6 components, 2-4 embedded refs each,
// including one inside calc() — the scan-the-whole-string approach handles
// calc() correctly with no special-casing, it just doesn't care about the
// CSS function wrapped around the reference.

const EMBEDDED_REF_PATTERN = /\$it-[a-z0-9-]+|var\(--[a-z0-9-]+(?:,\s*[^)]+)?\)/g

export function findEmbeddedRefs(value: string): Array<{ ref: string; name: string }> {
  const refs: Array<{ ref: string; name: string }> = []
  for (const m of value.matchAll(EMBEDDED_REF_PATTERN)) {
    const ref = m[0]
    const name = ref.startsWith('$')
      ? `--${ref.slice(1)}`
      : ref.match(/^var\((--[a-z0-9-]+)/)![1]
    refs.push({ ref, name })
  }
  return refs
}

function isBareTokenName(value: string): boolean {
  return /^--(bsi|it)-[a-z0-9-]+$/.test(value)
}

// Resolves every reference embedded in a raw composite value, substitutes
// each one that resolves into the string, and reports which (if any) didn't.
// KNOWN LIMITATION: if an embedded reference's OWN resolution passes through
// another composite value somewhere in its chain, that nested composite's
// own composedOf/note is not propagated here — only its final value. Not
// observed in real data today (all 8 known composites resolve their
// embedded refs to plain dimensions/colors, no nested composites), but
// worth knowing if declaredTimes/ambiguousValues work later surfaces a
// deeper case.
export function resolveComposite(
  rawValue: string,
  bsiMap: BsiMap,
  bridge: BridgeMap,
  dtiRaw: DtiMap,
  visited = new Set<string>()
): { value: string; composedOf: ComposedRef[]; note?: string } {
  const refs = findEmbeddedRefs(rawValue)

  // Dedupe by raw ref text — a value can repeat the same reference more
  // than once (real case: --bsi-timeline-content-padding repeats
  // var(--bsi-spacing-s) three times). Resolve each DISTINCT ref once;
  // replaceAll below already substitutes every occurrence in one pass, so
  // resolving the same ref repeatedly would only bloat composedOf with
  // identical entries without changing the result.
  const uniqueRefs = [...new Map(refs.map((r) => [r.ref, r])).values()]

  const composedOf: ComposedRef[] = []
  let resolvedString = rawValue
  const unresolved: string[] = []

  for (const { ref, name } of uniqueRefs) {
    const result = resolveChain(name, bsiMap, bridge, dtiRaw, new Set(visited))
    composedOf.push({ ref, name, value: result.value, resolvedVia: [hopFor(name, dtiRaw, bridge), ...result.chain] })
    if (result.value !== null) {
      resolvedString = resolvedString.replaceAll(ref, result.value)
    } else {
      unresolved.push(ref)
    }
  }

  const note = unresolved.length > 0
    ? `${uniqueRefs.length - unresolved.length} of ${uniqueRefs.length} distinct embedded references resolved — ` +
    `could not resolve: ${unresolved.join(', ')} (see composedOf for detail)`
    : undefined

  return { value: resolvedString, composedOf, note }
}

// ─── Unified resolver ─────────────────────────────────────────────────────────
//
// Follows the full chain: --bsi-* → --bsi-* → --it-* → --it-* → concrete value
// Returns { value, chain } where chain is every intermediate hop (excluding
// the starting name), each labeled with its manipulability role. composedOf/
// note are present only when the chain terminates in a composite value.

interface ResolveResult {
  value: string | null
  chain: ResolvedHop[]
  composedOf?: ComposedRef[]
  note?: string
}

export function resolveChain(
  name: string,
  bsiMap: BsiMap,
  bridge: BridgeMap,
  dtiRaw: DtiMap,
  visited = new Set<string>()
): ResolveResult {
  if (visited.has(name)) return { value: null, chain: [] }
  visited.add(name)

  // --bsi-* → follow bsiMap (component tokens) or bridge (root.scss)
  if (name.startsWith('--bsi-')) {
    const next = bsiMap.get(name) ?? bridge.get(name)
    if (!next) return { value: null, chain: [] }

    if (isBareTokenName(next)) {
      const result = resolveChain(next, bsiMap, bridge, dtiRaw, visited)
      return { value: result.value, chain: [hopFor(next, dtiRaw, bridge), ...result.chain] }
    }

    // next is a raw composite string (see parseBsiMap) — not a name to
    // recurse into, a value to resolve in place.
    const { value, composedOf, note } = resolveComposite(next, bsiMap, bridge, dtiRaw, visited)
    return { value, chain: [], composedOf, note }
  }

  // --it-* → follow dtiRaw
  if (name.startsWith('--it-')) {
    const val = dtiRaw.get(name)
    if (!val) return { value: null, chain: [] }

    if (isBareTokenName(val)) {
      const result = resolveChain(val, bsiMap, bridge, dtiRaw, visited)
      return { value: result.value, chain: [hopFor(val, dtiRaw, bridge), ...result.chain] }
    }

    const refs = findEmbeddedRefs(val)
    if (refs.length === 0) {
      // True literal (possibly with a folded comment, e.g. "24px (6x...)"),
      // nothing embedded — today's behavior, unchanged.
      return { value: val, chain: [] }
    }

    const { value, composedOf, note } = resolveComposite(val, bsiMap, bridge, dtiRaw, visited)
    return { value, chain: [], composedOf, note }
  }

  return { value: null, chain: [] }
}

// ─── Cache and loading ────────────────────────────────────────────────────────

interface ResolvedMaps {
  bsiMap: BsiMap
  bridge: BridgeMap
  dtiRaw: DtiMap
}

async function loadMaps(): Promise<ResolvedMaps> {
  const cached = cache.get<ResolvedMaps>(CACHE_KEYS.designTokens())
  if (cached) return cached

  const [rootScss, variablesScss, customPropsRaw] = await Promise.all([
    fetchText(SNAPSHOT_BSI_ROOT_SCSS_URL),
    fetchText(SNAPSHOT_DTI_VARIABLES_SCSS_URL),
    fetchJson<RawTokensJson>(SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL),
  ])

  const bridge = parseBridge(rootScss)
  const dtiRaw = parseDesignTokens(variablesScss)
  const bsiMap = parseBsiMap(customPropsRaw)

  cache.set(CACHE_KEYS.designTokensDti(), dtiRaw, TTL.snapshot)

  const maps: ResolvedMaps = { bsiMap, bridge, dtiRaw }
  cache.set(CACHE_KEYS.designTokens(), maps, TTL.snapshot)
  return maps
}

// Resolves a single raw value string the same way regardless of where it
// came from (a token's own .value, or one entry in ambiguousValues) — used
// by resolveTokenValues for both.
export function resolveSingleValue(
  value: string,
  maps: ResolvedMaps
): { valueResolved: string | null; resolvedVia: ResolvedHop[] } {
  const type = classifyValue(value)
  if (type === 'literal') return { valueResolved: value, resolvedVia: [] }
  if (type === 'scss-expression') return { valueResolved: null, resolvedVia: [] }
  if (type === 'composite') {
    const { value: resolved } = resolveComposite(value, maps.bsiMap, maps.bridge, maps.dtiRaw)
    return { valueResolved: resolved, resolvedVia: [] }
  }
  const ref = value.match(/^var\((--[a-z0-9-]+)\)/)?.[1]
  if (!ref) return { valueResolved: null, resolvedVia: [] }
  const { value: resolved, chain } = resolveChain(ref, maps.bsiMap, maps.bridge, maps.dtiRaw)
  return { valueResolved: resolved, resolvedVia: [hopFor(ref, maps.dtiRaw, maps.bridge), ...chain] }
}

export async function resolveTokenValues(tokens: CssToken[]): Promise<CssToken[]> {
  if (tokens.length === 0) return tokens

  let maps: ResolvedMaps
  try {
    maps = await loadMaps()
  } catch (err) {
    console.warn(`Design Tokens Italia: token resolution failed: ${(err as Error).message}`)
    return tokens
  }

  return tokens.map((token) => {
    let resolved: CssToken = token

    if (token.valueType === 'composite') {
      const { value, composedOf, note } = resolveComposite(token.value, maps.bsiMap, maps.bridge, maps.dtiRaw)
      resolved = { ...token, valueResolved: value, composedOf, ...(note ? { valueResolvedNote: note } : {}) }
    } else if (token.valueType === 'token-reference') {
      const ref = token.value.match(/^var\((--[a-z0-9-]+)\)/)?.[1]
      if (ref) {
        const { value, chain } = resolveChain(ref, maps.bsiMap, maps.bridge, maps.dtiRaw)
        resolved = { ...token, valueResolved: value, resolvedVia: [hopFor(ref, maps.dtiRaw, maps.bridge), ...chain] }
      }
    }

    if (token.declaredTimes && token.declaredTimes > 1 && token.ambiguousValues) {
      const resolvedAmbiguous = token.ambiguousValues.map((a) => ({
        ...a,
        ...resolveSingleValue(a.value, maps),
      }))
      const note =
        `declared ${token.declaredTimes} times with different values in this component's source — ` +
        `likely responsive breakpoints, theme modifier classes, or element states (e.g. [readonly]), ` +
        `not distinguishable from this data alone (bootstrap-italia#1805 tracks the responsive case, ` +
        `not the others). Overriding this variable at a single point removes whatever variation BSI ` +
        `built in — replicate the same breakpoints/selectors if you want to preserve it, don't assume ` +
        `one override is equivalent to all of them.`
      resolved = { ...resolved, ambiguousValues: resolvedAmbiguous, valueResolvedNote: note }
    }

    return resolved
  })
}

// ─── Global search across all --it-* tokens ───────────────────────────────────

export async function searchDesignTokens(
  query: string
): Promise<Array<{ name: string; value: string; resolvedVia: ResolvedHop[] }>> {
  const { bsiMap, bridge, dtiRaw } = await loadMaps()
  const q = query.toLowerCase()
  const results: Array<{ name: string; value: string; resolvedVia: ResolvedHop[] }> = []

  for (const [name] of dtiRaw) {
    const { value, chain } = resolveChain(name, bsiMap, bridge, dtiRaw)
    if (!value) continue
    if (name.includes(q) || value.toLowerCase().includes(q)) {
      results.push({ name, value, resolvedVia: chain })
    }
  }

  return results
}

// ─── Multi-form token name normalization ──────────────────────────────────────
// tokens_resolve and tokens_find_components accept any point in the chain:
// --bsi-*, --it-*, or the Sass source form $it-* (as written in
// design-tokens-italia/_variables.scss, before compilation to a CSS custom
// property). Everything downstream (bridge, dtiRaw) already keys on --it-*,
// so $it-* just needs converting before the first lookup.

export function normalizeTokenName(input: string): string {
  const trimmed = input.trim().toLowerCase()

  // #{tokens.$it-spacing-m} or tokens.$it-spacing-m — Sass source forms
  // copied directly from root.scss, the same source the $it- gate targets.
  const tokensDotMatch = trimmed.match(/tokens\.\$it-([a-z0-9-]+)/)
  if (tokensDotMatch) return `--it-${tokensDotMatch[1]}`

  // var(--bsi-x) or var(--bsi-x, fallback) — allow a fallback after the name
  const varMatch = trimmed.match(/^var\(\s*(--[a-z0-9-]+)/)
  if (varMatch) return varMatch[1]

  if (trimmed.startsWith('$')) return `--${trimmed.slice(1)}`
  if (trimmed.startsWith('--bsi-') || trimmed.startsWith('--it-')) return trimmed
  if (trimmed.startsWith('it-') || trimmed.startsWith('bsi-')) return `--${trimmed}`
  return trimmed
}

// ─── Global bridge-pair listing (tokens_list_globals) ─────────────────────────
// Iterates the --bsi-* -> --it-* map parsed live from BSI's root.scss — grows
// automatically as BSI adds bridge entries. Never a hardcoded list, never a
// null or non-bridged row.

export async function listGlobalBridgePairs(): Promise<Array<{
  it: string
  bsiGlobal: string
  value: string | null
  resolvedVia: ResolvedHop[]
  composedOf?: ComposedRef[]
  note?: string
}>> {
  const { bsiMap, bridge, dtiRaw } = await loadMaps()
  const results: Array<{ it: string; bsiGlobal: string; value: string | null; resolvedVia: ResolvedHop[]; composedOf?: ComposedRef[]; note?: string }> = []

  for (const [bsiGlobal, it] of bridge) {
    const { value, chain, composedOf, note } = resolveChain(it, bsiMap, bridge, dtiRaw)
    results.push({ it, bsiGlobal, value, resolvedVia: chain, composedOf, note })
  }
  return results
}

// ─── Single token resolution (tokens_resolve) ─────────────────────────────────

export interface ResolveTokenResult {
  name: string
  value: string | null
  resolvedVia: ResolvedHop[]
  // Present only when the input is a literal --bsi-* value that differs
  // across components — cannot pick one without guessing which component
  // the caller means. Surfaced instead of an arbitrary answer.
  ambiguous?: Array<{ component: string; value: string }>
  // Present only for a composite value — one entry per embedded reference.
  composedOf?: ComposedRef[]
  // Present when value is null but the token exists with a value that
  // genuinely can't be resolved (scss-expression, or a broken chain), OR
  // when a composite resolved only partially — distinguishes "found but
  // unresolvable/incomplete" from "not found at all".
  note?: string
}

export async function resolveToken(input: string): Promise<ResolveTokenResult> {
  const name = normalizeTokenName(input)
  const { bsiMap, bridge, dtiRaw } = await loadMaps()

  // For --bsi-* names, check ambiguity across ALL declarations first — a
  // primary chain resolution via bsiMap (last-write-wins) can silently
  // return a plausible-looking wrong value if this variable-name is
  // declared multiple times with different values (e.g. per-component
  // responsive/theme variants). Ambiguity must be decided before attempting
  // resolution, not just as a fallback triggered when resolution fails.
  if (name.startsWith('--bsi-')) {
    const allTokens = await loadAllTokens()
    const matches: Array<{ component: string; value: string; type: ReturnType<typeof classifyValue> }> = []
    for (const [component, entries] of Object.entries(allTokens)) {
      for (const e of entries) {
        if (e['variable-name'] === name) {
          matches.push({ component, value: e.value, type: classifyValue(e.value) })
        }
      }
    }

    if (matches.length > 0) {
      const distinctValues = new Set(matches.map((m) => m.value))

      if (distinctValues.size > 1) {
        // Multiple distinct declared values — cannot pick one without guessing.
        const components = [...new Set(matches.map((m) => m.component))]
        const scope = components.length === 1
          ? `declared ${matches.length} times within "${components[0]}"`
          : `declared with different values across ${components.length} components`
        return {
          name, value: null, resolvedVia: [],
          ambiguous: matches.map(({ component, value }) => ({ component, value })),
          note: `${scope} — likely responsive/theme variants this dataset flattens. ` +
            `Use tokens_list_component_vars for a specific component, or check BSI docs for context.`,
        }
      }

      // Single distinct value declared everywhere — safe to resolve directly.
      const single = matches[0]
      if (single.type === 'literal') {
        return { name, value: single.value, resolvedVia: [] }
      }
      if (single.type === 'scss-expression') {
        return {
          name, value: null, resolvedVia: [],
          note: 'scss-expression value(s) found — cannot resolve to a concrete value (requires SCSS compilation context)',
        }
      }
      if (single.type === 'composite') {
        const { value, composedOf, note } = resolveComposite(single.value, bsiMap, bridge, dtiRaw)
        return { name, value, resolvedVia: [], composedOf, note }
      }
      // type === 'token-reference' and unambiguous — fall through to the
      // normal chain resolution below, which follows this single reference.
    }
  }

  const { value, chain, composedOf, note } = resolveChain(name, bsiMap, bridge, dtiRaw)
  return { name, value, resolvedVia: chain, composedOf, note }
}

// ─── Inverse lookup (tokens_find_components) ──────────────────────────────────
// Given a token name, finds every BSI component whose token resolves through
// it — either directly (the token itself) or as an intermediate hop in the
// --bsi-* -> --it-* chain.
//
// NOT extended for composedOf: a component whose token embeds the target
// only inside a composite value (rather than as a direct token-reference
// hop) is not found here yet. Deliberately deferred — classifyValue()
// returning 'composite' for those 8 entries still routes them through the
// existing `!== 'token-reference'` branch below unchanged (same as it did
// when they were misclassified 'literal'), so nothing breaks, it just
// doesn't gain the new match type. Revisit if/when real usage shows this
// gap matters.

export async function findComponentsByToken(input: string): Promise<Array<{
  component: string
  token: string
  resolvedVia: ResolvedHop[]
  valueResolved: string | null
}>> {
  const target = normalizeTokenName(input)
  const [allTokens, maps] = await Promise.all([loadAllTokens(), loadMaps()])
  const { bsiMap, bridge, dtiRaw } = maps
  const results: Array<{ component: string; token: string; resolvedVia: ResolvedHop[]; valueResolved: string | null }> = []

  for (const [component, entries] of Object.entries(allTokens)) {
    for (const e of entries) {
      const name = e['variable-name']
      const isDirectMatch = name === target

      if (classifyValue(e.value) !== 'token-reference') {
        // Literal (or composite, or scss-expression) token — no single-hop
        // chain possible. Include only on direct match, with its raw value
        // (nothing resolved further).
        if (isDirectMatch) {
          results.push({ component, token: name, resolvedVia: [], valueResolved: e.value })
        }
        continue
      }

      const ref = e.value.match(/^var\((--[a-z0-9-]+)\)/)?.[1]
      if (!ref) {
        // var(--x, fallback) or other unmatched form — still report on
        // direct match so the token doesn't silently vanish from results,
        // but don't claim an unresolved raw string as a resolved value.
        if (isDirectMatch) {
          results.push({ component, token: name, resolvedVia: [], valueResolved: null })
        }
        continue
      }

      const { value, chain } = resolveChain(ref, bsiMap, bridge, dtiRaw)
      const fullChain = [hopFor(ref, dtiRaw, bridge), ...chain]

      if (isDirectMatch || fullChain.some((h) => h.name === target)) {
        results.push({ component, token: name, resolvedVia: fullChain, valueResolved: value })
      }
    }
  }
  return results
}