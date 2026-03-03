import { cache, CACHE_KEYS, TTL } from '../cache.js'
import type { CssToken } from '../types.js'
import { DTI_VARIABLES_SCSS_URL, BSI_ROOT_SCSS_URL } from '../constants.js'

// Map 1: --bsi-* → --it-* (da BSI scss/base/root.scss (v3))
// Map 2: $it-* → valore o altra $it-* (da design-tokens-italia > _variables.scss)


// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Tokens fetch failed: ${res.status} ${url}`)
  return res.text()
}

// ─── Parser _variables.scss ───────────────────────────────────────────────────
//
// Formato: $it-spacing-m: 1.5rem; // 24px
// Estraiamo: nome ($it-* → --it-*) e valore concreto con commento

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

// ─── Parser _root.scss BSI ────────────────────────────────────────────────────
//
// Formato: --#{$prefix}spacing-m: var(--it-spacing-m);
// Estraiamo il bridge: --bsi-spacing-m → --it-spacing-m

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

// ─── Cache e caricamento ──────────────────────────────────────────────────────

async function loadTokenMap(): Promise<TokenMap> {
  const cached = cache.get<TokenMap>(CACHE_KEYS.designTokens())
  if (cached) return cached

  // Dopo
  const [rootScss, variablesScss] = await Promise.all([
    fetchText(BSI_ROOT_SCSS_URL),
    fetchText(DTI_VARIABLES_SCSS_URL),
  ])

  const bridge = parseBridge(rootScss)       // --bsi-* → --it-*
  const dtiRaw = parseVariables(variablesScss) // --it-* → valore o $it-* ref

  // Risoluzione ricorsiva DTI: $it-spacing-base → --it-spacing-base → 1.5rem (24px)
  function resolveIt(name: string, visited = new Set<string>()): string | null {
    if (visited.has(name)) return null  // protezione loop
    visited.add(name)
    const val = dtiRaw.get(name)
    if (!val) return null
    // Se è ancora un riferimento a $it-* (parseVariables lo salva come --it-*)
    if (val.startsWith('--it-')) return resolveIt(val, visited)
    return val
  }

  // Mappa finale: --bsi-* → valore concreto
  const map: TokenMap = new Map()
  for (const [bsiName, itName] of bridge) {
    const resolved = resolveIt(itName)
    if (resolved) map.set(bsiName, resolved)
  }

  cache.set(CACHE_KEYS.designTokens(), map, TTL.designTokens)
  return map
}

// ─── Arricchimento token con valore risolto ───────────────────────────────────

export async function resolveTokenValues(tokens: CssToken[]): Promise<CssToken[]> {
  if (tokens.length === 0) return tokens

  let map: TokenMap
  try {
    map = await loadTokenMap()
  } catch {
    return tokens  // fallback: restituisci senza risoluzione
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

// ─── Ricerca globale su tutti i token --bsi-* ──────────────────────────────────

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