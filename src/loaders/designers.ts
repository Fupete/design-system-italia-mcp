import { fetchJson } from '../fetch.js'
import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { slugify, slugsToTry } from '../slugify.js'
import type { ComponentGuidelines } from '../types.js'
import { SNAPSHOT_DESIGNERS_COMPONENT_URL, DESIGNERS_SITE_BASE } from '../constants.js'

// ─── Snapshot JSON structure ──────────────────────────────────────────────────
//
// data-fetched/designers/components/{slug}.json
//
// Raw YAML parsed to JSON by snapshot-static.ts at fetch time.
// Same structure as the original YAML — no runtime yaml parsing needed.

export interface RawDesignersJson {
  components?: {
    hero?: {
      subtitle?: string
      kangaroo?: {
        tagsDesignSystem?: string[]
      }
    }
  }
  tabs?: Array<{
    title?: string
    sectionsEditorial?: Array<{
      components?: Array<{
        name?: string
        title?: string
        text?: string
      }>
    }>
  }>
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export interface GuidelinesResult {
  guidelines: ComponentGuidelines
  // Non-null when the "Uso e accessibilità" tab wasn't found by title and we
  // fell back to the first tab — that fallback may be wrong if upstream also
  // reorders tabs, not just renames this one.
  tabWarning: string | null
}

export function parseGuidelines(raw: RawDesignersJson): GuidelinesResult {
  const hero = raw?.components?.hero

  // "Uso e accessibilità" tab — matched by title, fallback to first tab if
  // renamed upstream. The fallback is surfaced as a warning, not silent.
  const matchedTab = raw?.tabs?.find(t =>
    t.title?.toLowerCase().includes('uso') ||
    t.title?.toLowerCase().includes('accessibilit')
  )
  const usageTab = matchedTab ?? raw?.tabs?.[0]

  let tabWarning: string | null = null
  if (!matchedTab && usageTab) {
    const titles = raw?.tabs?.map(t => t.title ?? '(untitled)').join(', ')
    tabWarning = `"Uso e accessibilità" tab not found by title (tabs seen: ${titles}) — ` +
      `fell back to first tab "${usageTab.title ?? '(untitled)'}", content may be from the wrong tab`
  }

  const allComponents = usageTab?.sectionsEditorial
    ?.flatMap(s => s.components ?? []) ?? []

  function findText(titleMatch: string): string | null {
    return allComponents.find(
      c => c.name === 'TextImageCta' &&
        c.title?.toLowerCase().includes(titleMatch.toLowerCase())
    )?.text ?? null
  }

  const guidelines: ComponentGuidelines = {
    description: hero?.subtitle ?? null,
    categories: hero?.kangaroo?.tagsDesignSystem ?? [],
    whenToUse: findText('quando usarlo') ?? findText('quando usare'),
    howToUse: findText('come usarlo') ?? findText('come usare'),
  }

  return { guidelines, tabWarning }
}

// ─── Public loader ────────────────────────────────────────────────────────────

export async function loadGuidelines(slug: string): Promise<GuidelinesResult | null> {
  const normalized = slugify(slug)
  for (const s of slugsToTry(normalized)) {
    const key = CACHE_KEYS.designers(s)
    const cached = cache.get<GuidelinesResult>(key)
    if (cached) return cached
    const url = SNAPSHOT_DESIGNERS_COMPONENT_URL(s)
    try {
      const raw = await fetchJson<RawDesignersJson>(url)
      const result = parseGuidelines(raw)
      cache.set(key, result, TTL.snapshot)
      return result
    } catch {
      continue
    }
  }
  console.warn(`Designers Italia: guidelines not found for "${slug}" (tried: ${slugsToTry(slug).join(', ')})`)
  return null
}

export function designersUrl(slug: string): string {
  return `${DESIGNERS_SITE_BASE}/design-system/componenti/${slugify(slug)}/`
}