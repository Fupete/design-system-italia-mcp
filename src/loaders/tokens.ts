import { fetchText, fetchJson } from '../fetch.js'
import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { loadAllTokens, classifyValue } from './bsi.js'
import type { CssToken, ResolvedHop, TokenRole } from '../types.js'
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

type DtiMap = Map<string, string>     // --it-* → value or --it-* reference
type BridgeMap = Map<string, string>  // --bsi-* → --it-* (root.scss)
type BsiMap = Map<string, string>     // --bsi-* → --bsi-* or --it-* (custom-properties.json, token-reference only)

// Format: $it-spacing-m: 1.5rem; // 24px
export function parseDesignTokens(scss: string): DtiMap {
  const map: DtiMap = new Map()
  for (const line of scss.split('\n')) {
    const match = line.match(/^\$([a-z0-9-]+):\s*([^;]+);(?:\s*\/\/\s*(.+))?/)
    if (!match) continue
    const [, varName, rawValue, comment] = match
    const cssName = `--${varName}`
    const value = rawValue.trim()
    const isRef = value.startsWith('$')
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

// Extract --bsi-* → var(--bsi-* | --it-*) from custom-properties.json
// Only token-reference entries — literals are already concrete (see
// resolveToken()'s literal fallback for those).
type RawTokensJson = Record<string, Array<{ 'variable-name': string; value: string }>>

function parseBsiMap(raw: RawTokensJson): BsiMap {
  const map: BsiMap = new Map()
  for (const entries of Object.values(raw)) {
    for (const e of entries) {
      if (!e.value.startsWith('var(')) continue
      const ref = e.value.match(/^var\((--[a-z0-9-]+)\)/)?.[1]
      if (ref) map.set(e['variable-name'], ref)
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

function roleFor(name: string, bridge: BridgeMap): TokenRole {
  if (name.startsWith('--it-')) return 'dti'
  if (bridge.has(name)) return 'bsi-global'
  return 'bsi-component'
}

function hopFor(name: string, bridge: BridgeMap): ResolvedHop {
  return { name, role: roleFor(name, bridge), overridable: !name.startsWith('--it-') }
}

// ─── Unified resolver ─────────────────────────────────────────────────────────
//
// Follows the full chain: --bsi-* → --bsi-* → --it-* → --it-* → concrete value
// Returns { value, chain } where chain is every intermediate hop (excluding
// the starting name), each labeled with its manipulability role.

interface ResolveResult {
  value: string | null
  chain: ResolvedHop[]
}

function resolveChain(
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
    const result = resolveChain(next, bsiMap, bridge, dtiRaw, visited)
    return { value: result.value, chain: [hopFor(next, bridge), ...result.chain] }
  }

  // --it-* → follow dtiRaw
  if (name.startsWith('--it-')) {
    const val = dtiRaw.get(name)
    if (!val) return { value: null, chain: [] }
    if (val.startsWith('--it-')) {
      const result = resolveChain(val, bsiMap, bridge, dtiRaw, visited)
      return { value: result.value, chain: [hopFor(val, bridge), ...result.chain] }
    }
    return { value: val, chain: [] }
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

async function loadDtiMap(): Promise<DtiMap> {
  const cached = cache.get<DtiMap>(CACHE_KEYS.designTokensDti())
  if (cached) return cached
  await loadMaps()
  return cache.get<DtiMap>(CACHE_KEYS.designTokensDti()) ?? new Map()
}

// ─── Token value enrichment ───────────────────────────────────────────────────

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
    if (token.valueType !== 'token-reference') return token

    const ref = token.value.match(/^var\((--[a-z0-9-]+)\)/)?.[1]
    if (!ref) return token

    // Resolve from the token's own declared reference (ref), not from a
    // re-lookup of token.name in bsiMap. custom_properties.json can contain
    // duplicate variable-names across components with different values —
    // bsiMap is a flat Map keyed by name, so a re-lookup by name can return
    // a different component's value (last write wins). Starting from `ref`
    // sidesteps that ambiguity entirely.
    const { value, chain } = resolveChain(ref, maps.bsiMap, maps.bridge, maps.dtiRaw)
    return { ...token, valueResolved: value, resolvedVia: [hopFor(ref, maps.bridge), ...chain] }
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

function normalizeTokenName(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('$')) return `--${trimmed.slice(1)}`
  if (trimmed.startsWith('--bsi-') || trimmed.startsWith('--it-')) return trimmed
  // Defensive: bare name without -- prefix (e.g. "it-spacing-m", "bsi-accordion-padding")
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
}>> {
  const { bsiMap, bridge, dtiRaw } = await loadMaps()
  const results: Array<{ it: string; bsiGlobal: string; value: string | null; resolvedVia: ResolvedHop[] }> = []

  for (const [bsiGlobal, it] of bridge) {
    const { value, chain } = resolveChain(it, bsiMap, bridge, dtiRaw)
    results.push({ it, bsiGlobal, value, resolvedVia: chain })
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
}

export async function resolveToken(input: string): Promise<ResolveTokenResult> {
  const name = normalizeTokenName(input)
  const { bsiMap, bridge, dtiRaw } = await loadMaps()
  const { value, chain } = resolveChain(name, bsiMap, bridge, dtiRaw)

  if (value !== null) {
    return { name, value, resolvedVia: chain }
  }

  // Fallback: name may be a literal --bsi-* value (e.g. "0", "1px"), which
  // parseBsiMap never indexes because it only captures token-reference
  // entries. Search the raw per-component data directly instead of
  // declaring a token that genuinely exists "not found".
  if (name.startsWith('--bsi-')) {
    const allTokens = await loadAllTokens()
    const matches: Array<{ component: string; value: string }> = []
    for (const [component, entries] of Object.entries(allTokens)) {
      for (const e of entries) {
        if (e['variable-name'] === name) matches.push({ component, value: e.value })
      }
    }
    const distinctValues = new Set(matches.map((m) => m.value))
    if (distinctValues.size === 1) {
      return { name, value: matches[0].value, resolvedVia: [] }
    }
    if (distinctValues.size > 1) {
      return { name, value: null, resolvedVia: [], ambiguous: matches }
    }
  }

  return { name, value: null, resolvedVia: chain }
}

// ─── Inverse lookup (tokens_find_components) ──────────────────────────────────
// Given a token name, finds every BSI component whose token resolves through
// it — either directly (the token itself) or as an intermediate hop in the
// --bsi-* -> --it-* chain.

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
        // Literal token — no chain possible. Include only on direct match,
        // with its raw value (nothing to resolve further).
        if (isDirectMatch) {
          results.push({ component, token: name, resolvedVia: [], valueResolved: e.value })
        }
        continue
      }

      const ref = e.value.match(/^var\((--[a-z0-9-]+)\)/)?.[1]
      if (!ref) continue

      const { value, chain } = resolveChain(ref, bsiMap, bridge, dtiRaw)
      const fullChain = [hopFor(ref, bridge), ...chain]

      if (isDirectMatch || fullChain.some((h) => h.name === target)) {
        results.push({ component, token: name, resolvedVia: fullChain, valueResolved: value })
      }
    }
  }
  return results
}