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

  // "Uso e accessibilità" tab is always the first [0]
  const allComponents = raw?.tabs?.[0]?.sectionsEditorial
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
  for (const s of slugsToTry(slug)) {
    const normalized = slugify(s)
    const key = CACHE_KEYS.designers(normalized)
    const cached = cache.get<ComponentGuidelines>(key)
    if (cached) return cached

    const url = SNAPSHOT_DESIGNERS_COMPONENT_URL(normalized)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.json() as RawDesignersJson
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