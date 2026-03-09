#!/usr/bin/env tsx
/**
 * scripts/find-slug-mismatches.ts
 * Compares slugs across BSI components_status.json and Dev Kit index.json
 * to find aliases needed in SLUG_ALIASES.
 */

import { loadAllStatuses } from '../src/loaders/bsi.js'
import { loadDevKitIndex } from '../src/loaders/devkit.js'
import { slugsToTry } from '../src/slugify.js'

const statuses = await loadAllStatuses()
const devKit = await loadDevKitIndex()

const bsiSlugs = new Set(statuses.keys())
const dkSlugs = new Set(devKit.keys())

console.log('=== Dev Kit slugs NOT matched in BSI ===')
for (const dk of dkSlugs) {
  const found = slugsToTry(dk).some(s => bsiSlugs.has(s))
  if (!found) console.log(`  ${dk} (Dev Kit) → no BSI match`)
}

console.log('\n=== BSI slugs NOT matched in Dev Kit ===')
for (const bsi of bsiSlugs) {
  const found = slugsToTry(bsi).some(s => dkSlugs.has(s))
  if (!found) {
    // Check if Dev Kit has something similar
    const similar = [...dkSlugs].filter(dk =>
      dk.includes(bsi) || bsi.includes(dk)
    )
    console.log(`  ${bsi} (BSI)${similar.length ? ` → possible: ${similar.join(', ')}` : ''}`)
  }
}

console.log('\n=== All matched pairs ===')
for (const bsi of bsiSlugs) {
  const match = slugsToTry(bsi).find(s => dkSlugs.has(s))
  if (match && match !== bsi) console.log(`  ${bsi} ↔ ${match} (via alias)`)
}

// ----

import { BSI_COMPONENT_URL, subfolderFromDocUrl, BSI_COMPONENT_DEFAULT_SUBFOLDER } from '../src/constants.js'

console.log('\n=== BSI JSON API — 404 check ===')
for (const [slug, status] of statuses) {
  const subfolder = status.sourceUrls.bsiDoc
    ? subfolderFromDocUrl(status.sourceUrls.bsiDoc)
    : BSI_COMPONENT_DEFAULT_SUBFOLDER

  let found = false
  for (const s of slugsToTry(slug)) {
    const url = BSI_COMPONENT_URL(subfolder, s)
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.ok) { found = true; break }
    } catch { /* skip */ }
  }
  if (!found) {
    const docUrl = status.sourceUrls.bsiDoc ?? 'no bsiDocUrl'
    console.log(`  ${slug} → 404 for all slugsToTry (subfolder: ${subfolder}, doc: ${docUrl})`)
  }
}