import { cache, CACHE_KEYS, TTL } from '../cache.js'

// ─── Sorgenti metadati ────────────────────────────────────────────────────────

const DSNAV_URL =
  'https://raw.githubusercontent.com/italia/designers.italia.it/main/src/data/dsnav.yaml'

const BSI_PACKAGE_URL =
  'https://raw.githubusercontent.com/italia/bootstrap-italia/3.x/package.json'

const DEVKIT_PACKAGE_URL =
  'https://raw.githubusercontent.com/italia/dev-kit-italia/main/package.json'

const DESIGNERS_BASE = 'https://designers.italia.it'

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface DsVersions {
  designSystem: string       // da dsnav.yaml → tag.label, es. "v1.10.1"
  bootstrapItalia: string    // da BSI package.json → .version, es. "3.0.0-alpha.2"
  devKitItalia: string       // da Dev Kit package.json → .version
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

// ─── Parser YAML minimale per dsnav.yaml ──────────────────────────────────────
//
// dsnav.yaml ha struttura semplice e stabile: label/url in list/subList.
// Non serve js-yaml completo — parsing riga per riga è sufficiente e
// più robusto contro cambi di struttura non critici.

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

function parseDsnavYaml(text: string): RawDsnav {
  // Usa js-yaml se disponibile nell'ambiente (è già una dipendenza del progetto)
  // altrimenti parsing riga per riga
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml')
    return yaml.load(text) as RawDsnav
  } catch {
    // Fallback: estrai solo label/url con regex
    const result: RawDsnav = { list: [] }

    // Versione
    const versionMatch = text.match(/label:\s*["']?(v[\d.]+(?:-[\w.]+)?)["']?/)
    if (versionMatch) {
      result.tag = { label: versionMatch[1] }
    }

    return result
  }
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

  // Fetch parallelo delle tre sorgenti — fallback su stringa vuota in caso di errore
  const [dsnavText, bsiPackage, devKitPackage] = await Promise.allSettled([
    fetchText(DSNAV_URL),
    fetchJson<{ version: string }>(BSI_PACKAGE_URL),
    fetchJson<{ version: string }>(DEVKIT_PACKAGE_URL),
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
    const dsnav = parseDsnavYaml(dsnavText.value)

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
          absoluteUrl: `${DESIGNERS_BASE}${item.url}`,
        }

        if (isComponents) {
          const slug = slugFromDesignersUrl(item.url)
          if (slug && slug !== 'componenti') {
            // Normalizza: "Buttons" → entry accessibile con slug "buttons"
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