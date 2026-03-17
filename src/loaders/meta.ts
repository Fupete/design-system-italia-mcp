import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { SNAPSHOT_DSNAV_URL, SNAPSHOT_META_URL, DESIGNERS_SITE_BASE } from '../constants.js'
import type { DsVersions, DsNavEntry, DsMeta, SnapshotMeta } from '../types.js'
import { getUserAgent } from '../fetch.js'

// ─── Internal types for dsnav.json ───────────────────────────────────────────
// Snapshot is already parsed JSON — no yaml needed.

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

// ─── Slug from Designers Italia URL ──────────────────────────────────────────
//
// "/design-system/componenti/accordion/" → "accordion"

function slugFromDesignersUrl(url: string): string {
  const match = url.match(/\/componenti\/([^/]+)\/?$/)
  return match?.[1] ?? ''
}

// ─── Main loader ──────────────────────────────────────────────────────────────

export async function loadDsMeta(): Promise<DsMeta> {
  const cached = cache.get<DsMeta>(CACHE_KEYS.dsMeta())
  if (cached) return cached

  // Parallel fetch — graceful fallback on single source error
  const [dsnavResult, snapshotMetaResult] = await Promise.allSettled([
    fetch(SNAPSHOT_DSNAV_URL, {
      headers: {
        'User-Agent': getUserAgent(),
      },
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<RawDsnav>
    }),
    fetch(SNAPSHOT_META_URL, {
      headers: {
        'User-Agent': getUserAgent(),
      },
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<SnapshotMeta>
    }),
  ])

  // Versions — from snapshot-meta.json (already resolved at fetch time)
  const versions: DsVersions = {
    designSystem: '',
    bootstrapItalia: '',
    devKitItalia: '',
    designTokensItalia: '',
  }

  if (snapshotMetaResult.status === 'fulfilled') {
    versions.designSystem = snapshotMetaResult.value.versions.designSystem ?? ''
    versions.bootstrapItalia = snapshotMetaResult.value.versions.bootstrapItalia ?? ''
    versions.devKitItalia = snapshotMetaResult.value.versions.devKitItalia ?? ''
    versions.designTokensItalia = snapshotMetaResult.value.versions.designTokensItalia ?? ''
  }

  // Navigation — from dsnav.json
  const components = new Map<string, DsNavEntry>()
  const foundations: DsNavEntry[] = []

  if (dsnavResult.status === 'fulfilled') {
    const dsnav = dsnavResult.value

    // fallback: if snapshot-meta failed, extract DS version from dsnav
    if (!versions.designSystem && dsnav.tag?.label) {
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
    fetchedAt: snapshotMetaResult.status === 'fulfilled'
      ? snapshotMetaResult.value.fetchedAt  // ← from snapshot-meta.json
      : new Date().toISOString(),           // ← fallback
  }

  cache.set(CACHE_KEYS.dsMeta(), meta, TTL.snapshot)
  return meta
}

// ─── Public helpers ───────────────────────────────────────────────────────────

// Returns the absolute Designers Italia URL for a component
export async function getDesignersUrl(slug: string): Promise<string | null> {
  const meta = await loadDsMeta()
  return meta.components.get(slug)?.absoluteUrl ?? null
}

// Returns the three design system versions
export async function getDsVersions(): Promise<DsVersions> {
  const meta = await loadDsMeta()
  return meta.versions
}

// Returns all foundations with absolute URLs
export async function getFoundations(): Promise<DsNavEntry[]> {
  const meta = await loadDsMeta()
  return meta.foundations
}