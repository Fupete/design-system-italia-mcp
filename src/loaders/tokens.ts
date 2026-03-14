import { cache, CACHE_KEYS, TTL } from '../cache.js'
import type { CssToken } from '../types.js'
import { SNAPSHOT_DTI_VARIABLES_SCSS_URL, SNAPSHOT_BSI_ROOT_SCSS_URL } from '../constants.js'

// Map 1: --bsi-* → --it-* (from BSI scss/base/root.scss (v3))
// Map 2: $it-* → value or another $it-* (from design-tokens-italia > _variables.scss)

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Tokens fetch failed: ${res.status} ${url}`)
  return res.text()
}

// ─── Design Tokens Italia _variables.scss parser ───────────────────────────────
//
// Format: $it-spacing-m: 1.5rem; // 24px
// Extract: name ($it-* → --it-*) and concrete value with comment

type DtiMap = Map<string, string>           // --it-* → value (parseDesignTokens, invariato)
type TokenMap = Map<string, { value: string; via: string }>  // --bsi-* → { value, via } (loadTokenMap)

function parseDesignTokens(scss: string): DtiMap {
  const map: DtiMap = new Map()
  const lines = scss.split('\n')

  for (const line of lines) {
    // $it-spacing-m: 1.5rem; // 24px
    const match = line.match(/^\$([a-z0-9-]+):\s*([^;]+);(?:\s*\/\/\s*(.+))?/)
    if (!match) continue

    const [, varName, rawValue, comment] = match
    const cssName = `--${varName}`  // $it-spacing-m → --it-spacing-m
    const value = rawValue.trim()

    const isRef = value.startsWith('$')
    const resolved = isRef
      ? `--${value.slice(1)}`          // $it-spacing-base → --it-spacing-base
      : comment?.trim()
        ? `${value} (${comment.trim()})`
        : value

    map.set(cssName, resolved)
  }

  return map
}

// ─── BSI _root.scss parser ────────────────────────────────────────────────────
//
// Format: --#{$prefix}spacing-m: var(--it-spacing-m);
// Extract the bridge: --bsi-spacing-m → --it-spacing-m

type BridgeMap = Map<string, string>  // --bsi-spacing-m → --it-spacing-m

function parseBridge(scss: string): BridgeMap {
  const map: BridgeMap = new Map()
  const lines = scss.split('\n')

  for (const line of lines) {
    // --#{$prefix}spacing-m: var(--it-spacing-m);
    const match = line.match(/--#\{\$prefix\}([a-z0-9-]+):\s*var\((--it-[a-z0-9-]+)\)/)
    if (!match) continue
    const [, bsiSuffix, itName] = match
    map.set(`--bsi-${bsiSuffix}`, itName)
  }

  return map
}

// ─── Cache and loading ────────────────────────────────────────────────────────

async function loadTokenMap(): Promise<TokenMap> {
  const cached = cache.get<TokenMap>(CACHE_KEYS.designTokens())
  if (cached) return cached

  // Parallel fetch from snapshot branch
  const [rootScss, variablesScss] = await Promise.all([
    fetchText(SNAPSHOT_BSI_ROOT_SCSS_URL),
    fetchText(SNAPSHOT_DTI_VARIABLES_SCSS_URL),
  ])

  const bridge = parseBridge(rootScss)
  const dtiRaw = parseDesignTokens(variablesScss)

  cache.set(CACHE_KEYS.designTokensDti(), dtiRaw, TTL.snapshot)

  // Recursive DTI resolution: $it-spacing-base → --it-spacing-base → 1.5rem (24px)
  function resolveIt(name: string, visited = new Set<string>()): string | null {
    if (visited.has(name)) return null
    visited.add(name)
    const val = dtiRaw.get(name)
    if (!val) return null
    // If still a reference to $it-* (parseDesignTokens saves it as --it-*)
    if (val.startsWith('--it-')) return resolveIt(val, visited)
    return val
  }

  // Final map: --bsi-* → concrete value
  const map: TokenMap = new Map()
  for (const [bsiName, itName] of bridge) {
    const resolved = resolveIt(itName)
    if (resolved) map.set(bsiName, { value: resolved, via: itName })
  }

  cache.set(CACHE_KEYS.designTokens(), map, TTL.snapshot)
  return map
}

// DTI map cached separately for --it-* token search
async function loadDtiMap(): Promise<DtiMap> {
  const cached = cache.get<DtiMap>(CACHE_KEYS.designTokensDti())
  if (cached) return cached
  // Not yet cached — trigger loadTokenMap which populates it as a side effect
  await loadTokenMap()
  return cache.get<DtiMap>(CACHE_KEYS.designTokens()) ?? new Map()
}

// ─── Token value enrichment with resolved value ───────────────────────────────

export async function resolveTokenValues(tokens: CssToken[]): Promise<CssToken[]> {
  if (tokens.length === 0) return tokens

  let map: TokenMap
  try {
    map = await loadTokenMap()
  } catch (err) {
    console.warn(`Design Tokens Italia: token resolution failed: ${(err as Error).message}`)
    return tokens
  }

  return tokens.map((token) => {
    if (token.valueType !== 'token-reference') return token

    const ref = token.value.match(/^var\((--[a-z0-9-]+)\)/)?.[1]
    if (!ref) return token

    const entry = map.get(ref) ?? null
    return { ...token, valueResolved: entry?.value ?? null, resolvedVia: entry?.via ?? null }
  })
}

// ─── Global search across all --bsi-* → resolved value pairs ───────────────────

export async function searchDesignTokens(
  query: string
): Promise<Array<{ name: string; value: string }>> {
  const dtiMap = await loadDtiMap()
  const q = query.toLowerCase()
  const results: Array<{ name: string; value: string }> = []

  for (const [name, value] of dtiMap) {
    if (name.includes(q) || value.toLowerCase().includes(q)) {
      results.push({ name, value })
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