import yaml from 'js-yaml'
import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { slugify } from '../slugify.js'
import type { ComponentGuidelines } from '../types.js'

const DESIGNERS_RAW =
  'https://raw.githubusercontent.com/italia/designers.italia.it/main'

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchYaml(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Designers fetch failed: ${res.status} ${url}`)
  const text = await res.text()
  return yaml.load(text)
}

// ─── Struttura YAML Designers Italia ─────────────────────────────────────────
//
// src/data/content/design-system/componenti/{slug}.yaml
//
// I campi rilevanti sono annidati in strutture CMS Jekyll.
// Verifica empirica su accordion.yaml — adattare se altri componenti
// hanno struttura diversa.

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

  // tab Uso e accessibilità è sempre il primo [0]
  const allComponents = data?.tabs?.[0]?.sectionsEditorial
    ?.flatMap(s => s.components ?? []) ?? []

  function findText(titleMatch: string): string | null {
    return allComponents.find(
      c => c.name === 'TextImageCta' &&
           c.title?.toLowerCase().includes(titleMatch.toLowerCase())
    )?.text ?? null
  }

  return {
    description:        hero?.subtitle ?? null,
    categories:         hero?.kangaroo?.tagsDesignSystem ?? [],
    whenToUse:          findText('quando usarlo') ?? findText('quando usare'),
    howToUse:           findText('come usarlo') ?? findText('come usare'),
    accessibilityNotes: findText('accessibilit'),
  }
}

// ─── Loader pubblico ──────────────────────────────────────────────────────────

export async function loadGuidelines(slug: string): Promise<ComponentGuidelines | null> {
  const normalized = slugify(slug)
  const key = CACHE_KEYS.designers(normalized)
  const cached = cache.get<ComponentGuidelines>(key)
  if (cached) return cached

  const url = `${DESIGNERS_RAW}/src/data/content/design-system/componenti/${normalized}.yaml`
  try {
    const raw = await fetchYaml(url)
    const guidelines = parseYaml(raw)
    cache.set(key, guidelines, TTL.designers)
    return guidelines
  } catch {
    return null
  }
}

export function designersUrl(slug: string): string {
  return `https://designers.italia.it/design-system/componenti/${slugify(slug)}/`
}