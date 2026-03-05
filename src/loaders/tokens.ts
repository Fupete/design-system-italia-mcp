import { cache, CACHE_KEYS, TTL } from '../cache.js'
import type { CssToken } from '../types.js'
import { DTI_VARIABLES_SCSS_URL, BSI_ROOT_SCSS_URL } from '../constants.js'

// Map 1: --bsi-* → --it-* (from BSI scss/base/root.scss (v3))
// Map 2: $it-* → value or another $it-* (from design-tokens-italia > _variables.scss)

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Tokens fetch failed: ${res.status} ${url}`)
  return res.text()
}

// ─── _variables.scss parser ───────────────────────────────────────────────────
//
// Format: $it-spacing-m: 1.5rem; // 24px
// Extract: name ($it-* → --it-*) and concrete value with comment

type TokenMap = Map<string, string>  // --it-spacing-m → "1.5rem (24px)"

function parseVariables(scss: string): TokenMap {
  const map: TokenMap = new Map()
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

  // Parallel fetch
  const [rootScss, variablesScss] = await Promise.all([
    fetchText(BSI_ROOT_SCSS_URL),
    fetchText(DTI_VARIABLES_SCSS_URL),
  ])

  const bridge = parseBridge(rootScss)       // --bsi-* → --it-*
  const dtiRaw = parseVariables(variablesScss) // --it-* → value or $it-* ref

  // Recursive DTI resolution: $it-spacing-base → --it-spacing-base → 1.5rem (24px)
  function resolveIt(name: string, visited = new Set<string>()): string | null {
    if (visited.has(name)) return null  // loop protection
    visited.add(name)
    const val = dtiRaw.get(name)
    if (!val) return null
    // If still a reference to $it-* (parseVariables saves it as --it-*)
    if (val.startsWith('--it-')) return resolveIt(val, visited)
    return val
  }

  // Final map: --bsi-* → concrete value
  const map: TokenMap = new Map()
  for (const [bsiName, itName] of bridge) {
    const resolved = resolveIt(itName)
    if (resolved) map.set(bsiName, resolved)
  }

  cache.set(CACHE_KEYS.designTokens(), map, TTL.designTokens)
  return map
}

// ─── Token value enrichment with resolved value ───────────────────────────────

export async function resolveTokenValues(tokens: CssToken[]): Promise<CssToken[]> {
  if (tokens.length === 0) return tokens

  let map: TokenMap
  try {
    map = await loadTokenMap()
  } catch {
    return tokens  // fallback: return without resolution
  }

  return tokens.map((token) => {
    if (token.valueType !== 'token-reference') return token

    // var(--bsi-spacing-m) → --bsi-spacing-m
    const ref = token.value.match(/^var\((--[a-z0-9-]+)\)/)?.[1]
    if (!ref) return token

    const resolved = map.get(ref) ?? null
    return { ...token, valueResolved: resolved }
  })
}

// ─── Global search across all --bsi-* tokens ──────────────────────────────────

export async function searchDesignTokens(
  query: string
): Promise<Array<{ name: string; value: string }>> {
  const map = await loadTokenMap()
  const q = query.toLowerCase()
  const results: Array<{ name: string; value: string }> = []

  for (const [name, value] of map) {
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
//     const dtiRaw = parseVariables(variablesScss)

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