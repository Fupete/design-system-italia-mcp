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

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Config ────────────────────────────────────────────────────────────────────

const DEVKIT_BASE = 'https://italia.github.io/dev-kit-italia'
const INDEX_URL = `${DEVKIT_BASE}/index.json`
const DEFAULT_OUT = resolve(import.meta.dirname, '../data-fetched/devkit/stories')

const args = process.argv.slice(2)
const filterSlug = args.includes('--slug')
  ? args[args.indexOf('--slug') + 1]
  : null
const outDir = args.includes('--out')
  ? args[args.indexOf('--out') + 1]
  : DEFAULT_OUT

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugFromEntry(id: string): string {
  // "componenti-accordion--documentazione" → "accordion"
  return id
    .replace(/^componenti-/, '')
    .replace(/--documentazione$/, '')
    .replace(/--.*$/, '')
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('📡 Fetching Dev Kit index...')
const index = await fetch(INDEX_URL).then(r => r.json()) as {
  entries: Record<string, {
    id: string
    type: string
    importPath: string
    storiesImports?: string[]
  }>
}

// extract unique slugs from docs entries
const slugs = [...new Set(
  Object.values(index.entries)
    .filter(e => e.type === 'docs' && e.id.startsWith('componenti-'))
    .map(e => slugFromEntry(e.id))
)]

const filtered = filterSlug ? slugs.filter(s => s === filterSlug) : slugs
console.log(`🔍 ${filtered.length} components to process${filterSlug ? ` (filter: ${filterSlug})` : ''}`)

mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const results: { slug: string; variants: number; ok: boolean }[] = []

for (const slug of filtered) {
  const url = `${DEVKIT_BASE}/iframe.html?id=componenti-${slug}--documentazione&viewMode=docs`
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })

    // click all "Show code" buttons
    const buttons = await page.$$('button')
    let clicked = 0
    for (const btn of buttons) {
      const text = await btn.innerText().catch(() => '')
      if (text.trim().toLowerCase().includes('show code')) {
        await btn.click({ timeout: 5_000 }).catch(() => null)
        clicked++
      }
    }

    // wait for source panels to render
    if (clicked > 0) {
      await page.waitForTimeout(400)
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

    const outPath = resolve(outDir, `${slug}.json`)
    writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8')

    console.log(`✅ ${slug}: ${variants.length} variants`)
    results.push({ slug, variants: variants.length, ok: true })

  } catch (err) {
    console.log(`❌ ${slug}: ${(err as Error).message}`)
    results.push({ slug, variants: 0, ok: false })
  } finally {
    await page.close()
  }
}

await browser.close()

// ── Summary ───────────────────────────────────────────────────────────────────

const ok = results.filter(r => r.ok)
const failed = results.filter(r => !r.ok)
const zero = ok.filter(r => r.variants === 0)

console.log(`\n${ok.length}/${results.length} components processed`)
if (zero.length > 0) {
  console.log(`⚠️  ${zero.length} components with 0 variants: ${zero.map(r => r.slug).join(', ')}`)
}
if (failed.length > 0) {
  console.log(`❌ ${failed.length} errors: ${failed.map(r => r.slug).join(', ')}`)
  process.exit(1)
}