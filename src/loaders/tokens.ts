import { fetchText, fetchJson } from '../fetch.js'
import { cache, CACHE_KEYS, TTL } from '../cache.js'
import type { CssToken } from '../types.js'
import { SNAPSHOT_DTI_VARIABLES_SCSS_URL, SNAPSHOT_BSI_ROOT_SCSS_URL, SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL, } from '../constants.js'

// Map 1: --bsi-* component tokens (custom-properties.json) — token-reference entries only
// Map 2: --bsi-* → --it-* bridge (BSI scss/base/root.scss v3)
// Map 3: --it-* → value or --it-* reference (design-tokens-italia > _variables.scss)
//
// Resolution chain: --bsi-accordion-padding → --bsi-spacing-m → --it-spacing-m → 1.5rem (24px)

// ─── Parsers ──────────────────────────────────────────────────────────────────

type DtiMap = Map<string, string>     // --it-* → value or --it-* reference
type BridgeMap = Map<string, string>  // --bsi-* → --it-* (root.scss)
type BsiMap = Map<string, string>     // --bsi-* → --bsi-* or --it-* (custom-properties.json, token-reference only)

// Format: $it-spacing-m: 1.5rem; // 24px
function parseDesignTokens(scss: string): DtiMap {
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

// Format: --#{$prefix}spacing-m: var(--it-spacing-m);
function parseBridge(scss: string): BridgeMap {
  const map: BridgeMap = new Map()
  for (const line of scss.split('\n')) {
    const match = line.match(/--#\{\$prefix\}([a-z0-9-]+):\s*var\((--it-[a-z0-9-]+)\)/)
    if (!match) continue
    const [, bsiSuffix, itName] = match
    map.set(`--bsi-${bsiSuffix}`, itName)
  }
  return map
}

// Extract --bsi-* → var(--bsi-* | --it-*) from custom-properties.json
// Only token-reference entries — literals are already concrete
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

// ─── Unified resolver ─────────────────────────────────────────────────────────
//
// Follows the full chain: --bsi-* → --bsi-* → --it-* → --it-* → concrete value
// Returns { value, chain } where chain is every intermediate hop (excluding start and final value)

interface ResolveResult {
  value: string | null
  chain: string[]
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
    return { value: result.value, chain: [next, ...result.chain] }
  }

  // --it-* → follow dtiRaw
  if (name.startsWith('--it-')) {
    const val = dtiRaw.get(name)
    if (!val) return { value: null, chain: [] }
    if (val.startsWith('--it-')) {
      const result = resolveChain(val, bsiMap, bridge, dtiRaw, visited)
      return { value: result.value, chain: [val, ...result.chain] }
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

    const { value, chain } = resolveChain(token.name, maps.bsiMap, maps.bridge, maps.dtiRaw)
    return { ...token, valueResolved: value, resolvedVia: chain }
  })
}

// ─── Global search across all --it-* tokens ───────────────────────────────────

export async function searchDesignTokens(
  query: string
): Promise<Array<{ name: string; value: string; resolvedVia: string[] }>> {
  const { bsiMap, bridge, dtiRaw } = await loadMaps()
  const q = query.toLowerCase()
  const results: Array<{ name: string; value: string; resolvedVia: string[] }> = []

  for (const [name] of dtiRaw) {
    const { value, chain } = resolveChain(name, bsiMap, bridge, dtiRaw)
    if (!value) continue
    if (name.includes(q) || value.toLowerCase().includes(q)) {
      results.push({ name, value, resolvedVia: chain })
    }
  }

  return results
}

// Debug: uncomment to diagnose token resolution chain (bridge/DTI sizes, key matching)
// export async function debugTokenResolution(): Promise<string[]> {
//   const logs: string[] = []

//   try {
//     const [rootScss, variablesScss] = await Promise.all([
//       fetchText(BSI_ROOT_SCSS_URL),
//       fetchText(DTI_VARIABLES_SCSS_URL),
//     ])

//     const bridge = parseBridge(rootScss)
//     const dtiRaw = parseDesignTokens(variablesScss)

//     logs.push(`bridge.size: ${bridge.size}`)
//     logs.push(`dtiRaw.size: ${dtiRaw.size}`)

//     // Count concrete vs reference values in DTI
//     let concrete = 0, refs = 0
//     for (const val of dtiRaw.values()) {
//       if (val.startsWith('--it-')) refs++
//       else concrete++
//     }
//     logs.push(`dtiRaw: ${concrete} concrete, ${refs} references`)

//     // Sample bridge entries and check if DTI has them
//     const sample = [...bridge.entries()].slice(0, 3)
//     for (const [bsi, it] of sample) {
//       logs.push(`${bsi} → ${it} → dtiRaw.has: ${dtiRaw.has(it)}`)
//     }
//   } catch (err) {
//     logs.push(`error: ${(err as Error).message}`)
//   }

//   return logs
// }