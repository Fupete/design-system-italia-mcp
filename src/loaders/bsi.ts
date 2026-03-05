import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { slugify, slugFromStatusTitle, slugsToTry } from '../slugify.js'
import type { ComponentStatus, ComponentVariant, CssToken, StatusValue } from '../types.js'
import { BSI_STATUS_URL, BSI_COMPONENT_URL, BSI_COMPONENT_DEFAULT_SUBFOLDER, BSI_CUSTOM_PROPERTIES_URL, subfolderFromDocUrl } from '../constants.js'

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`BSI fetch failed: ${res.status} ${url}`)
  return res.json() as Promise<T>
}

// ─── Source #2 — components_status.json ──────────────────────────────────────

interface RawStatusEntry {
  'title': string
  'bootstrap Italia': StatusValue
  'bootstrap Italia - url'?: string
  'uI Kit Italia': StatusValue
  'uI Kit Italia - url'?: string
  'visivamente accessibile': StatusValue
  'amichevole con lettori di schermo': StatusValue
  'navigabile': StatusValue
  'comprensibile': StatusValue
  'check completato'?: boolean
  'status a11y check'?: string
  'notes / More'?: string
  'notes / Issues'?: string  // string with URLs separated by " — "
}

type RawStatusJson = { items: RawStatusEntry[] }

export async function loadAllStatuses(): Promise<Map<string, ComponentStatus>> {
  const cached = cache.get<Map<string, ComponentStatus>>(CACHE_KEYS.bsiStatus())
  if (cached) return cached

  const url = BSI_STATUS_URL
  const raw = await fetchJson<RawStatusJson>(url)

  const result = new Map<string, ComponentStatus>()

  for (const entry of raw.items) {
    const slug = slugFromStatusTitle(entry.title)
    const status: ComponentStatus = {
      slug,
      name: entry.title.replace(/`/g, '').replace(/\s*-\s*check\s+a11y\s+e\s+status\s*/i, '').trim(),
      libraryStatus: {
        bootstrapItalia: entry['bootstrap Italia'] ?? 'N/D',
        uiKitItalia: entry['uI Kit Italia'] ?? 'N/D',
      },
      accessibility: {
        visivamenteAccessibile: entry['visivamente accessibile'] ?? 'N/D',
        amichevoleConLettoriDiSchermo: entry['amichevole con lettori di schermo'] ?? 'N/D',
        navigabile: entry['navigabile'] ?? 'N/D',
        comprensibile: entry['comprensibile'] ?? 'N/D',
        checkCompleted: entry['status a11y check'] === 'Done',
      },
      knownIssueUrls: entry['notes / Issues']
        ? entry['notes / Issues']
          .split(/\s*—\s*|\s+-\s+(?=https?:\/\/)/)
          .map(s => s.trim())
          .filter(s => s.startsWith('http'))
        : [],
      notes: entry['notes / More'] ?? null,
      sourceUrls: {
        bsiDoc: entry['bootstrap Italia - url'] ?? null,
        figma: entry['uI Kit Italia - url'] ?? null,
      },
    }
    result.set(slug, status)
  }

  cache.set(CACHE_KEYS.bsiStatus(), result, TTL.bsiStatus)
  return result
}

export async function loadStatus(slug: string): Promise<ComponentStatus | null> {
  const all = await loadAllStatuses()
  return all.get(slugify(slug)) ?? null
}

// ─── Source #1 — api/componenti/{slug}.json ───────────────────────────────────

type RawVariantsJson = Array<{ name: string; content: string }>

export async function loadVariants(
  slug: string,
  bsiDocUrl?: string | null
): Promise<ComponentVariant[]> {
  const key = CACHE_KEYS.bsiMarkup(slug)
  const cached = cache.get<ComponentVariant[]>(key)
  if (cached) return cached

  const subfolder = bsiDocUrl
    ? subfolderFromDocUrl(bsiDocUrl)
    : BSI_COMPONENT_DEFAULT_SUBFOLDER

  for (const s of slugsToTry(slug)) {
    const url = BSI_COMPONENT_URL(subfolder, s)
    try {
      const raw = await fetchJson<RawVariantsJson>(url)
      const variants = raw.map((v) => ({ name: v.name, html: v.content }))
      cache.set(key, variants, TTL.bsiMarkup)
      return variants
    } catch(err) {
      console.warn(`BSI markup fetch failed for slug "${s}": ${(err as Error).message}`)
      continue
    }
  }
  return []
}

// ─── Source #3 — api/custom_properties.json ──────────────────────────────────

type RawTokenEntry = { 'variable-name': string; value: string; description: string }
type RawTokensJson = Record<string, RawTokenEntry[]>

function classifyValue(value: string): CssToken['valueType'] {
  if (value.startsWith('#{') || value.startsWith('escape-svg(')) return 'scss-expression'
  if (value.startsWith('var(')) return 'token-reference'
  return 'literal'
}

async function loadAllTokens(): Promise<RawTokensJson> {
  const cached = cache.get<RawTokensJson>(CACHE_KEYS.bsiTokens())
  if (cached) return cached

  const url = BSI_CUSTOM_PROPERTIES_URL
  const raw = await fetchJson<RawTokensJson>(url)
  cache.set(CACHE_KEYS.bsiTokens(), raw, TTL.bsiTokens)
  return raw
}

export async function loadTokens(slug: string): Promise<CssToken[]> {
  const all = await loadAllTokens()

  // Try canonical slug first, then all known aliases
  // e.g. "buttons" → tries "buttons", "button", "btn"
  for (const s of slugsToTry(slug)) {
    const entries = all[s]
    if (entries && entries.length > 0) {
      return entries.map((e) => ({
        name: e['variable-name'],
        value: e.value,
        valueType: classifyValue(e.value),
        valueResolved: null,
        description: e.description || null,
      }))
    }
  }

  return []
}

export async function searchTokens(query: string): Promise<Array<CssToken & { component: string }>> {
  const all = await loadAllTokens()
  const q = query.toLowerCase()
  const results: Array<CssToken & { component: string }> = []

  for (const [slug, entries] of Object.entries(all)) {
    for (const e of entries) {
      if (
        e['variable-name'].includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.value.toLowerCase().includes(q)
      ) {
        results.push({
          component: slug,
          name: e['variable-name'],
          value: e.value,
          valueType: classifyValue(e.value),
          valueResolved: null,
          description: e.description || null,
        })
      }
    }
  }

  return results
}