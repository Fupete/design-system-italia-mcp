import yaml from 'js-yaml'
import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { slugify, slugsToTry } from '../slugify.js'
import type { ComponentGuidelines } from '../types.js'
import { DESIGNERS_COMPONENT_URL, DESIGNERS_SITE_BASE } from '../constants.js'

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchYaml(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Designers fetch failed: ${res.status} ${url}`)
  const text = await res.text()
  return yaml.load(text, { schema: yaml.JSON_SCHEMA })
}

// ─── Designers Italia YAML structure ─────────────────────────────────────────
//
// src/data/content/design-system/componenti/{slug}.yaml
//
// Relevant fields are nested in Jekyll CMS structures.
// Empirically verified on accordion.yaml — adapt if other components
// have different structure.

interface RawDesignersYaml {
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

function parseYaml(raw: unknown): ComponentGuidelines {
  const data = raw as RawDesignersYaml
  const hero = data?.components?.hero

  // "Uso e accessibilità" tab is always the first [0]
  const allComponents = data?.tabs?.[0]?.sectionsEditorial
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

    const url = DESIGNERS_COMPONENT_URL(normalized)
    try {
      const raw = await fetchYaml(url)
      const guidelines = parseYaml(raw)
      cache.set(key, guidelines, TTL.designers)
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