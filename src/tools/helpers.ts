// src/tools/helpers.ts
// ─── Shared helpers for tool handlers ────────────────────────────────────────

import { loadStatus, loadAllStatuses } from '../loaders/bsi.js'
import { loadDevKitIndex } from '../loaders/devkit.js'
import { loadDsMeta } from '../loaders/meta.js'
import { slugify, slugsToTry } from '../slugify.js'
import { BSI_DOC_BASE } from '../constants.js'
import type { DsMeta, StabilityLevel, StatusValue } from '../types.js'

// ─── resolveSlug ──────────────────────────────────────────────────────────────
// Resolves user input to canonical slug via components_status.json.
// e.g. "fisarmonica" → "accordion", "Alert" → "alert"
// Note: get_component_full keeps its own loadStatus call — it needs
// the full status object for sourceUrls assembly, not just the slug.
// Note: BSI component in meta sources keeps its resolved url (not canonical). 

export async function resolveSlug(input: string): Promise<string> {
  const slug = slugify(input.trim())
  const status = await loadStatus(slug)
  return status?.slug ?? slug
}

// ─── buildMeta ────────────────────────────────────────────────────────────────
// Builds the standard meta object for tool responses.
// dataFetchedAt reflects CI snapshot time, not server request time.
// Exception: GitHub Issues tool passes formatTimestamp() as dataFetchedAt
// since issues are fetched live at runtime.

export interface ToolMeta {
  dataFetchedAt: string | null
  sourceUrls: string[]
  warnings: string[]
  stability: StabilityLevel
  [key: string]: unknown
}

export function buildMeta(opts: {
  dsMeta: DsMeta | null
  sourceUrls: string[]
  warnings: string[]
  stability: StabilityLevel
  extra?: Record<string, unknown>
}): ToolMeta {
  return {
    dataFetchedAt: opts.dsMeta?.fetchedAt ?? null,
    sourceUrls: opts.sourceUrls,
    warnings: opts.warnings,
    stability: opts.stability,
    ...opts.extra,
  }
}

// ─── Component union ───────────────────────────────────────────────────────────
// Shared by dsi_list_components and dsi_search_components. A component is one
// entity with two possible implementations, never two parallel entities:
// bsi and devkit are independently null — filter client-side on either field
// to get BSI-only or DevKit-only rows. Never iterate BSI-only and silently
// drop DevKit-only components (the bug this replaces).

function bsiDocUrl(slug: string): string {
  return `${BSI_DOC_BASE}/${slug}/`
}

export interface UnionRow {
  name: string
  slug: string
  bsi: {
    status: { bootstrapItalia: StatusValue; uiKitItalia: StatusValue }
    accessibility: { checkCompleted: boolean }
    docUrl: string
  } | null
  devkit: {
    slug: string
    tags: string[]
    storybookUrl: string
    pattern: 'dedicated' | 'bundle'
    componentType: 'web-component' | 'html-bsi'
  } | null
}

export async function buildComponentUnion(): Promise<{ rows: UnionRow[]; dsMeta: DsMeta | null }> {
  const [statuses, devKitIndex, dsMeta] = await Promise.all([
    loadAllStatuses(),
    loadDevKitIndex(),
    loadDsMeta(),
  ])

  const claimedEntries = new Set<string>()   // key: dk.importPath — real identity, not slug string
  const rows: UnionRow[] = []

  // Pass 1: every BSI slug, cross-matched to its Dev Kit counterpart via slugsToTry.
  for (const [bsiSlug, s] of statuses) {
    const devKitSlug = slugsToTry(bsiSlug).find((a) => devKitIndex.has(a)) ?? null
    const dk = devKitSlug ? devKitIndex.get(devKitSlug)! : null
    if (dk) claimedEntries.add(dk.importPath)

    rows.push({
      name: s.name,
      slug: bsiSlug,
      bsi: {
        status: {
          bootstrapItalia: s.libraryStatus.bootstrapItalia,
          uiKitItalia: s.libraryStatus.uiKitItalia,
        },
        accessibility: { checkCompleted: s.accessibility.checkCompleted },
        docUrl: s.sourceUrls.bsiDoc ?? bsiDocUrl(bsiSlug),
      },
      devkit: dk
        ? { slug: dk.slug, tags: dk.tags, storybookUrl: dk.storybookUrl, pattern: dk.pattern, componentType: dk.componentType }
        : null,
    })
  }

  // Pass 2: Dev Kit-only entries — no BSI counterpart claimed this importPath in pass 1.
  // Identity is the entry itself (importPath), not the slug string: two different
  // Storybook titles that happen to share aliases (e.g. "chips" vs a real "tag"
  // entry) must never collapse into one, even though slugsToTry links them.
  for (const [, dk] of devKitIndex) {
    if (claimedEntries.has(dk.importPath)) continue
    rows.push({
      name: dk.displayName,
      slug: dk.slug,
      bsi: null,
      devkit: { slug: dk.slug, tags: dk.tags, storybookUrl: dk.storybookUrl, pattern: dk.pattern, componentType: dk.componentType },
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'it'))
  return { rows, dsMeta }
}