// src/tools/helpers.ts
// ─── Shared helpers for tool handlers ────────────────────────────────────────

import { loadAllStatuses } from '../loaders/bsi.js'
import { loadDevKitIndex } from '../loaders/devkit.js'
import { loadDsMeta } from '../loaders/meta.js'
import { designersUrl } from '../loaders/designers.js'
import { slugsToTry } from '../slugify.js'
import { BSI_DOC_BASE } from '../constants.js'
import type { ComponentStatus, DevKitEntry, DsMeta, StabilityLevel, StatusValue } from '../types.js'

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

// ─── Component-specific Designers Italia URL ───────────────────────────────
// Shared by every component-specific tool's meta.designersUrl. Prefers the
// URL verified live from dsnav (dsMeta.components), falls back to the
// slug-derived one (designersUrl()) when dsMeta is unavailable or doesn't
// have this component — same fallback docs_get_component_guide already used
// for sourceUrls.designersItalia, now the single source of truth for both.

export function resolveDesignersUrl(dsMeta: DsMeta | null, slug: string): string {
  return dsMeta?.components.get(slug)?.absoluteUrl ?? designersUrl(slug)
}

// ─── Dev Kit URL coherence check ───────────────────────────────────────────
// Compares the Dev Kit doc URL recorded in components_status.json (board,
// hand-maintained) against the one derived live from devkit/index.json
// (Storybook snapshot). A mismatch means one of the two sources is stale —
// surfaced as a warning, not treated as an error (neither source is
// authoritative over the other).

export function devKitUrlMismatch(
  slug: string,
  boardUrl: string | null | undefined,
  storybookUrl: string | null | undefined
): string | null {
  if (!boardUrl || !storybookUrl || boardUrl === storybookUrl) return null
  return `Dev Kit URL mismatch for "${slug}": components_status.json has "${boardUrl}", ` +
    `Dev Kit index.json has "${storybookUrl}" — one source may be stale.`
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
    status: { bootstrapItalia: StatusValue; uiKitItalia: StatusValue; devKitItalia: StatusValue }
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

// Pure union logic — no fetching, easy to test with fixtures. A component is
// one entity with two possible implementations, never two parallel entities:
// bsi and devkit are independently null — filter client-side on either field
// to get BSI-only or DevKit-only rows. Never iterate BSI-only and silently
// drop DevKit-only components (the bug this replaces).

export function unionRows(
  statuses: Map<string, ComponentStatus>,
  devKitIndex: Map<string, DevKitEntry>
): UnionRow[] {
  const claimedEntries = new Set<string>()   // key: dk.id — Storybook's guaranteed-unique identifier
  const matches = new Map<string, DevKitEntry | null>()   // bsiSlug -> matched entry (or null)

  // Pass 1a: exact slug matches first. These must win over alias matches
  // regardless of Map iteration order — otherwise which BSI slug claims a
  // shared Dev Kit entry would depend on source ordering, not semantics.
  for (const bsiSlug of statuses.keys()) {
    const dk = devKitIndex.get(bsiSlug) ?? null
    if (dk && !claimedEntries.has(dk.id)) {
      claimedEntries.add(dk.id)
      matches.set(bsiSlug, dk)
    }
  }

  // Pass 1b: alias matches (via slugsToTry) for whatever wasn't claimed by
  // an exact match above.
  for (const bsiSlug of statuses.keys()) {
    if (matches.has(bsiSlug)) continue
    const devKitSlug = slugsToTry(bsiSlug).find((a) => {
      const dk = devKitIndex.get(a)
      return dk && !claimedEntries.has(dk.id)
    })
    const dk = devKitSlug ? devKitIndex.get(devKitSlug)! : null
    // If this Dev Kit entry was already claimed by an earlier BSI slug (two
    // BSI slugs aliasing to the same Dev Kit entry), dk is null here — this
    // row gets bsi-only: the devkit block stays attached to whichever BSI
    // row claimed it first (in exact-match or alias order).
    if (dk) claimedEntries.add(dk.id)
    matches.set(bsiSlug, dk)
  }

  const rows: UnionRow[] = []
  for (const [bsiSlug, s] of statuses) {
    const dk = matches.get(bsiSlug) ?? null
    rows.push({
      name: s.name,
      slug: bsiSlug,
      bsi: {
        status: {
          bootstrapItalia: s.libraryStatus.bootstrapItalia,
          uiKitItalia: s.libraryStatus.uiKitItalia,
          devKitItalia: s.libraryStatus.devKitItalia,
        },
        accessibility: { checkCompleted: s.accessibility.checkCompleted },
        docUrl: s.sourceUrls.bsiDoc ?? bsiDocUrl(bsiSlug),
      },
      devkit: dk
        ? { slug: dk.slug, tags: dk.tags, storybookUrl: dk.storybookUrl, pattern: dk.pattern, componentType: dk.componentType }
        : null,
    })
  }

  // Pass 2: Dev Kit-only entries — no BSI counterpart claimed this id in
  // pass 1a/1b. Identity is the Storybook entry id, not the slug string:
  // two different entries whose slugs happen to alias to each other (e.g.
  // a genuine "tag" entry aliasing to "chips") must never collapse into one.
  for (const [, dk] of devKitIndex) {
    if (claimedEntries.has(dk.id)) continue
    rows.push({
      name: dk.displayName,
      slug: dk.slug,
      bsi: null,
      devkit: { slug: dk.slug, tags: dk.tags, storybookUrl: dk.storybookUrl, pattern: dk.pattern, componentType: dk.componentType },
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'it'))
  return rows
}

export async function buildComponentUnion(): Promise<{ rows: UnionRow[]; dsMeta: DsMeta | null }> {
  const [statuses, devKitIndex, dsMeta] = await Promise.all([
    loadAllStatuses(),
    loadDevKitIndex(),
    loadDsMeta(),
  ])
  return { rows: unionRows(statuses, devKitIndex), dsMeta }
}