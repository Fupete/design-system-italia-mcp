import yaml from 'js-yaml'
import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { DESIGNERS_DSNAV_URL, BSI_PACKAGE_JSON_URL, DEVKIT_PACKAGE_JSON_URL, DESIGNERS_SITE_BASE } from '../constants.js'

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface DsVersions {
  designSystem: string       // da dsnav.yaml → tag.label, es. "v1.10.1"
  bootstrapItalia: string    // da BSI package.json → .version, es. "3.0.0-alpha.2"
  devKitItalia: string       // da Dev Kit packages/dev-kit-italia/package.json → .version
}

export interface DsNavEntry {
  label: string
  url: string                // URL relativo designers.italia.it
  absoluteUrl: string        // URL assoluto completo
}

export interface DsMeta {
  versions: DsVersions
  components: Map<string, DsNavEntry>   // slug → entry
  foundations: DsNavEntry[]             // lista fondamenti
  fetchedAt: string
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`meta fetch failed: ${res.status} ${url}`)
  return res.json() as Promise<T>
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`meta fetch failed: ${res.status} ${url}`)
  return res.text()
}

// ─── Tipi interni per dsnav.yaml ─────────────────────────────────────────────

interface RawNavItem {
  label: string
  url?: string
}

interface RawNavSection {
  label: string
  subList?: RawNavItem[]
}

interface RawDsnav {
  tag?: { label?: string }
  list?: RawNavSection[]
}

// ─── Slug da URL Designers Italia ─────────────────────────────────────────────
//
// "/design-system/componenti/accordion/" → "accordion"

function slugFromDesignersUrl(url: string): string {
  const match = url.match(/\/componenti\/([^/]+)\/?$/)
  return match?.[1] ?? ''
}

// ─── Loader principale ────────────────────────────────────────────────────────

export async function loadDsMeta(): Promise<DsMeta> {
  const cached = cache.get<DsMeta>(CACHE_KEYS.dsMeta())
  if (cached) return cached

  // Fetch parallelo — fallback graceful su errore di singola sorgente
  const [dsnavText, bsiPackage, devKitPackage] = await Promise.allSettled([
    fetchText(DESIGNERS_DSNAV_URL),
    fetchJson<{ version: string }>(BSI_PACKAGE_JSON_URL),
    fetchJson<{ version: string }>(DEVKIT_PACKAGE_JSON_URL),
  ])

  // Versioni
  const versions: DsVersions = {
    designSystem: '',
    bootstrapItalia: '',
    devKitItalia: '',
  }

  if (bsiPackage.status === 'fulfilled') {
    versions.bootstrapItalia = bsiPackage.value.version
  }
  if (devKitPackage.status === 'fulfilled') {
    versions.devKitItalia = devKitPackage.value.version
  }

  // Navigazione
  const components = new Map<string, DsNavEntry>()
  const foundations: DsNavEntry[] = []

  if (dsnavText.status === 'fulfilled') {
    const dsnav = yaml.load(dsnavText.value) as RawDsnav

    if (dsnav.tag?.label) {
      versions.designSystem = dsnav.tag.label
    }

    for (const section of dsnav.list ?? []) {
      if (!section.subList) continue

      const isComponents = section.label === 'Componenti'
      const isFoundations = section.label === 'Fondamenti'

      for (const item of section.subList) {
        if (!item.url) continue

        const entry: DsNavEntry = {
          label: item.label,
          url: item.url,
          absoluteUrl: `${DESIGNERS_SITE_BASE}${item.url}`,
        }

        if (isComponents) {
          const slug = slugFromDesignersUrl(item.url)
          if (slug && slug !== 'componenti') {
            components.set(slug.toLowerCase(), entry)
          }
        } else if (isFoundations) {
          foundations.push(entry)
        }
      }
    }
  }

  const meta: DsMeta = {
    versions,
    components,
    foundations,
    fetchedAt: new Date().toISOString(),
  }

  cache.set(CACHE_KEYS.dsMeta(), meta, TTL.dsMeta)
  return meta
}

// ─── Helper pubblici ──────────────────────────────────────────────────────────

// Restituisce l'URL assoluto della pagina Designers Italia per un componente
export async function getDesignersUrl(slug: string): Promise<string | null> {
  const meta = await loadDsMeta()
  return meta.components.get(slug)?.absoluteUrl ?? null
}

// Restituisce le tre versioni del design system
export async function getDsVersions(): Promise<DsVersions> {
  const meta = await loadDsMeta()
  return meta.versions
}

// Restituisce tutti i fondamenti con URL assoluti
export async function getFoundations(): Promise<DsNavEntry[]> {
  const meta = await loadDsMeta()
  return meta.foundations
}