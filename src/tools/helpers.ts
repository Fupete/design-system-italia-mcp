// src/tools/helpers.ts
// ─── Shared helpers for tool handlers ────────────────────────────────────────

import { loadStatus } from '../loaders/bsi.js'
import { loadDsMeta } from '../loaders/meta.js'
import { slugify } from '../slugify.js'
import type { DsMeta, StabilityLevel } from '../types.js'

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

export function buildMeta(opts: {
  dsMeta: DsMeta | null
  sourceUrls: string[]
  warnings: string[]
  stability: StabilityLevel
  extra?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    dataFetchedAt: opts.dsMeta?.fetchedAt ?? null,
    sourceUrls: opts.sourceUrls,
    warnings: opts.warnings,
    stability: opts.stability,
    ...opts.extra,
  }
}