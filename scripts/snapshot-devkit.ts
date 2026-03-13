#!/usr/bin/env tsx
/**
 * scripts/snapshot-devkit.ts
 *
 * Extracts HTML markup for all Dev Kit Italia component variants
 * from the public Storybook via Playwright (Chromium).
 *
 * Saves results to data-fetched/devkit/stories/{slug}.json
 *
 * Usage:
 *   npx tsx scripts/snapshot-devkit.ts
 *   npx tsx scripts/snapshot-devkit.ts --slug accordion
 *   npx tsx scripts/snapshot-devkit.ts --out ./data-fetched/devkit/stories
 *
 * Manual trigger or nightly CI via upstream-snapshot.yml
 */

import { chromium, type Browser } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Config ────────────────────────────────────────────────────────────────────

const DEVKIT_BASE = 'https://italia.github.io/dev-kit-italia'
const INDEX_URL = `${DEVKIT_BASE}/index.json`
const DEFAULT_OUT = resolve(import.meta.dirname, '../data-fetched/devkit/stories')

/** Max concurrent Playwright pages — gentle on GitHub Pages CDN */
const CONCURRENCY = 4

/** Components known to have 0 variants upstream (not a bug) */
const KNOWN_ZERO_VARIANTS = new Set(['form-select'])

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const filterSlug = args.includes('--slug')
  ? args[args.indexOf('--slug') + 1]
  : null
const outDir = args.includes('--out')
  ? args[args.indexOf('--out') + 1]!
  : DEFAULT_OUT

// ── Security: output directory must be within the project ─────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, '..')
const resolvedOut = resolve(outDir)
if (!resolvedOut.startsWith(PROJECT_ROOT)) {
  console.error('❌ Output directory must be within the project')
  process.exit(1)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoryVariant {
  name: string   // heading id, e.g. "elemento-richiudibile"
  html: string   // clean copy-paste HTML markup
}

interface ComponentSnapshot {
  slug: string
  fetchedAt: string
  devkitUrl: string
  variants: StoryVariant[]
}

interface ProcessResult {
  slug: string
  variants: number
  ok: boolean
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugFromEntry(id: string): string {
  // "componenti-accordion--documentazione" → "accordion"
  return id
    .replace(/^componenti-/, '')
    .replace(/--documentazione$/, '')
    .replace(/--.*$/, '')
}

// ── Per-component extraction ──────────────────────────────────────────────────

async function processSlug(slug: string, browser: Browser): Promise<ProcessResult> {
  const url = `${DEVKIT_BASE}/iframe.html?id=componenti-${slug}--documentazione&viewMode=docs`
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })

    // click all "Show code" buttons — ElementHandle snapshot,
    // stable across DOM reflows caused by panel expansion
    const buttons = await page.$$('button')
    let clicked = 0
    for (const btn of buttons) {
      const text = await btn.innerText().catch(() => '')
      if (text.trim().toLowerCase().includes('show code')) {
        try {
          await btn.click({ timeout: 5_000 })
          clicked++
        } catch (err) {
          console.warn(`⚠️  ${slug}: Show code click failed: ${(err as Error).message}`)
        }
      }
    }

    // wait for source panels to actually render (replaces fixed 400ms sleep)
    if (clicked > 0) {
      await page.waitForFunction(
        (expected: number) =>
          document.querySelectorAll('.sbdocs-preview pre').length >= expected,
        clicked,
        { timeout: 5_000 }
      ).catch(() => null) // fallback: some panels may genuinely have no code
    }

    // extract variants — each pre is preceded by its h2/h3 story title
    const variants: StoryVariant[] = await page.evaluate(() => {
      const results: { name: string; html: string }[] = []
      document.querySelectorAll('pre').forEach(el => {
        const html = (el as HTMLElement).innerText.trim()
        if (!html) return
        const preview = el.closest('.sbdocs-preview')
        if (!preview) return
        let sibling = preview.previousElementSibling
        while (sibling) {
          if (sibling.matches('h2, h3')) {
            results.push({
              name: (sibling as HTMLElement).id,
              html,
            })
            break
          }
          sibling = sibling.previousElementSibling
        }
      })
      return results
    })

    const snapshot: ComponentSnapshot = {
      slug,
      fetchedAt: new Date().toISOString(),
      devkitUrl: url,
      variants,
    }

    const outPath = resolve(resolvedOut, `${slug}.json`)
    writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8')

    console.log(`✅ ${slug}: ${variants.length} variants`)
    return { slug, variants: variants.length, ok: true }

  } catch (err) {
    const message = (err as Error).message
    console.log(`❌ ${slug}: ${message}`)
    return { slug, variants: 0, ok: false, error: message }
  } finally {
    await page.close()
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Step 1 — fetch and validate index

console.log('📡 Fetching Dev Kit index...')

const res = await fetch(INDEX_URL, { signal: AbortSignal.timeout(15_000) })
if (!res.ok) {
  console.error(`❌ Index fetch failed: HTTP ${res.status}`)
  process.exit(1)
}

const index = await res.json() as {
  entries?: Record<string, {
    id: string
    type: string
    importPath: string
    storiesImports?: string[]
  }>
}

if (!index?.entries || typeof index.entries !== 'object') {
  console.error('❌ Unexpected index structure — missing or invalid entries')
  process.exit(1)
}

// Step 2 — extract unique slugs from docs entries

const slugs = [...new Set(
  Object.values(index.entries)
    .filter(e => e.type === 'docs' && e.id.startsWith('componenti-'))
    .map(e => slugFromEntry(e.id))
)]

const filtered = filterSlug ? slugs.filter(s => s === filterSlug) : slugs
console.log(`🔍 ${filtered.length} components to process${filterSlug ? ` (filter: ${filterSlug})` : ''}`)

if (filtered.length === 0) {
  console.error(`❌ No components matched${filterSlug ? ` slug "${filterSlug}"` : ''}`)
  process.exit(1)
}

// Step 3 — launch browser and process in batches

mkdirSync(resolvedOut, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'],
})

const results: ProcessResult[] = []

for (let i = 0; i < filtered.length; i += CONCURRENCY) {
  const batch = filtered.slice(i, i + CONCURRENCY)
  const batchResults = await Promise.allSettled(
    batch.map(slug => processSlug(slug, browser))
  )
  for (const r of batchResults) {
    if (r.status === 'fulfilled') {
      results.push(r.value)
    } else {
      // processSlug handles its own errors, but guard against unexpected throws
      console.error(`❌ Unexpected batch error: ${r.reason}`)
      results.push({ slug: 'unknown', variants: 0, ok: false, error: String(r.reason) })
    }
  }
}

await browser.close()

// ── Summary ───────────────────────────────────────────────────────────────────

const ok = results.filter(r => r.ok)
const failed = results.filter(r => !r.ok)
const zero = ok.filter(r => r.variants === 0)
const unexpectedZero = zero.filter(r => !KNOWN_ZERO_VARIANTS.has(r.slug))

console.log(`\n${ok.length}/${results.length} components processed`)

if (zero.length > 0) {
  console.log(`⚠️  ${zero.length} components with 0 variants: ${zero.map(r => r.slug).join(', ')}`)
}

// ── Exit code policy ──────────────────────────────────────────────────────────
// Fail CI on: fetch errors OR unexpected 0-variant components (selector breakage)

let exitCode = 0

if (failed.length > 0) {
  console.error(`❌ ${failed.length} errors: ${failed.map(r => r.slug).join(', ')}`)
  exitCode = 1
}

if (unexpectedZero.length > 0) {
  console.error(`❌ ${unexpectedZero.length} unexpected 0-variant components: ${unexpectedZero.map(r => r.slug).join(', ')}`)
  console.error('   If a new component legitimately has 0 variants, add it to KNOWN_ZERO_VARIANTS')
  exitCode = 1
}

process.exit(exitCode)