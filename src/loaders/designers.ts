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

interface RawDesignersJson {
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

function parseGuidelines(raw: RawDesignersJson): ComponentGuidelines {
  const hero = raw?.components?.hero

  // "Uso e accessibilità" tab — find by title, fallback to first tab if renamed upstream
  const usageTab = raw?.tabs?.find(t =>
    t.title?.toLowerCase().includes('uso') ||
    t.title?.toLowerCase().includes('accessibilit')
  ) ?? raw?.tabs?.[0]  // fallback to first tab if title match fails

  if (!usageTab && raw?.tabs?.length) {
    console.warn('parseGuidelines: usage tab not found by title, no fallback available')
  }

  const allComponents = usageTab?.sectionsEditorial
    ?.flatMap(s => s.components ?? []) ?? []

  function findText(titleMatch: string): string | null {
    return allComponents.find(
      c => c.name === 'TextImageCta' &&
        c.title?.toLowerCase().includes(titleMatch.toLowerCase())
    )?.text ?? null
  }

  return {
    description: hero?.subtitle ?? null,
    categories: hero?.kangaroo?.tagsDesignSystem ?? [],
    whenToUse: findText('quando usarlo') ?? findText('quando usare'),
    howToUse: findText('come usarlo') ?? findText('come usare'),
    accessibilityNotes: findText('accessibilit'),
  }
}

// ─── Public loader ────────────────────────────────────────────────────────────

export async function loadGuidelines(slug: string): Promise<ComponentGuidelines | null> {
  const normalized = slugify(slug)
  for (const s of slugsToTry(normalized)) {
    const key = CACHE_KEYS.designers(s)
    const cached = cache.get<ComponentGuidelines>(key)
    if (cached) return cached
    const url = SNAPSHOT_DESIGNERS_COMPONENT_URL(s)
    try {
      const raw = await fetchJson<RawDesignersJson>(url)
      const guidelines = parseGuidelines(raw)
      cache.set(key, guidelines, TTL.snapshot)
      return guidelines
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