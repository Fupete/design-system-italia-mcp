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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Config ────────────────────────────────────────────────────────────────────

const DEVKIT_BASE = 'https://italia.github.io/dev-kit-italia'
const INDEX_URL = `${DEVKIT_BASE}/index.json`
const PROJECT_ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_OUT = resolve(PROJECT_ROOT, 'data-fetched/devkit/stories')


/** Max concurrent Playwright pages — gentle on GitHub Pages CDN */
const CONCURRENCY = 4

/** Components known to have 0 variants upstream (not a bug) */
const KNOWN_ZERO_VARIANTS = new Set(['sticky'])

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const filterSlug = args.includes('--slug')
  ? args[args.indexOf('--slug') + 1]
  : null
const outDir = args.includes('--out')
  ? args[args.indexOf('--out') + 1]!
  : DEFAULT_OUT

// ── Security: output directory allowlist ──────────────────────────────────────
// Only data-fetched/ (local) or sibling data-fetched/ (CI dual-checkout pattern)
// are valid output targets. Prevents path traversal via --out argument.
const resolvedOut = resolve(outDir)
const ALLOWED_OUT_DIRS = [
  resolve(PROJECT_ROOT, 'data-fetched'),
  resolve(PROJECT_ROOT, '..', 'data-fetched'),  // CI dual-checkout pattern
]
if (!ALLOWED_OUT_DIRS.some(d => resolvedOut === d || resolvedOut.startsWith(d + '/'))) {
  console.error('❌ Output directory must be data-fetched/ or a subdirectory of it')
  process.exit(1)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoryVariant {
  name: string   // heading id, e.g. "elemento-richiudibile"
  html: string   // clean copy-paste HTML markup
}

interface ComponentSnapshot {
  slug: string
  devkitUrl: string
  description: string | null
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

    // wait for page to fully render before looking for buttons
    await page.waitForTimeout(1000)

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
        { timeout: 10_000 }
      ).catch(() => null) // fallback: some panels may genuinely have no code
    }

    // extract description and variants from rendered Storybook page
    // description: first <description> tag after <h1>
    // variants: each <pre> preceded by its h2/h3/h4 story title
    // multiple <pre> under the same heading get a numeric suffix (-2, -3, ...)
    const { variants, description } = await page.evaluate((slugArg) => {

      // ── Component description — <description> tag after <h1#{slug}> 
      // or <h1> with class `sbdocs-title`
      let description: string | null = null
      const slugWithoutForm = slugArg.replace(/^form-/, '')
      const h1 = document.querySelector(`h1#${slugArg}`)
        ?? document.querySelector(`h1#${slugWithoutForm}`)
        ?? document.querySelector('h1.sbdocs-title')
      if (h1) {
        const next = h1.nextElementSibling
        if (next?.tagName.toLowerCase() === 'description') {
          description = next.textContent?.trim() ?? null
        }
      }

      // Variants
      const results: { name: string; html: string }[] = []
      const nameCounts = new Map<string, number>()
      document.querySelectorAll('pre').forEach(el => {
        const html = (el as HTMLElement).innerText.trim()
        if (!html) return
        const preview = el.closest('.sbdocs-preview')
        if (!preview) return
        let sibling = preview.previousElementSibling
        while (sibling) {
          if (sibling.matches('h2, h3, h4')) {
            const baseName = (sibling as HTMLElement).id
            const count = (nameCounts.get(baseName) ?? 0) + 1
            nameCounts.set(baseName, count)
            const name = count === 1 ? baseName : `${baseName}-${count}`
            results.push({ name, html })
            break
          }
          sibling = sibling.previousElementSibling
        }
      })

      return { variants: results, description }
    }, slug)

    const snapshot: ComponentSnapshot = {
      slug,
      devkitUrl: url,
      description,
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
// Use local index.json if available (written by snapshot-static.ts)
// to guarantee consistency between static and devkit snapshots.

console.log('📡 Loading Dev Kit index...')

const localIndexPath = resolve(resolvedOut, '../index.json')
let indexRaw: string

if (existsSync(localIndexPath)) {
  console.log('  using local devkit/index.json from snapshot-static')
  indexRaw = readFileSync(localIndexPath, 'utf8')
} else {
  console.log('  fetching from upstream')
  const res = await fetch(INDEX_URL, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) {
    console.error(`❌ Index fetch failed: HTTP ${res.status}`)
    process.exit(1)
  }
  indexRaw = await res.text()
}

const index = JSON.parse(indexRaw) as {
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

// Slug sanitization
const SLUG_RE = /^[a-z0-9-]+$/
for (const s of filtered) {
  if (!SLUG_RE.test(s)) {
    console.error(`❌ Invalid slug "${s}" — must match /^[a-z0-9-]+$/`)
    process.exit(1)
  }
}

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