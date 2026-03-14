#!/usr/bin/env tsx
/**
 * scripts/snapshot-static.ts
 *
 * Fetches all static upstream sources and saves them to data-fetched/.
 * No browser required — plain HTTP fetch only.
 *
 * Sources fetched:
 *   bsi/components-status.json       — component list + status
 *   bsi/components/{slug}.json       — HTML markup per component
 *   bsi/custom-properties.json       — CSS tokens --bsi-*
 *   bsi/root.scss                    — bridge --bsi-* → --it-*
 *   devkit/index.json                — Storybook index
 *   design-tokens/variables.scss     — global --it-* tokens
 *   designers/components/{slug}.json — guidelines YAML → JSON
 *   dsnav.json                       — DS nav + versions
 *   snapshot-meta.json               — versions + fetch stats
 *
 * Usage:
 *   npx tsx scripts/snapshot-static.ts
 *   npx tsx scripts/snapshot-static.ts --dry-run
 *
 * Note: --dry-run skips writing files but still makes all HTTP requests.
 * Use it to validate source reachability, not as a fully offline mode.
 */

import { slugFromStatusTitle, slugsToTry } from '../src/slugify.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import {
    BSI_STATUS_URL,
    BSI_CUSTOM_PROPERTIES_URL,
    BSI_ROOT_SCSS_URL,
    BSI_PACKAGE_JSON_URL,
    BSI_COMPONENT_URL,
    BSI_COMPONENT_DEFAULT_SUBFOLDER,
    DESIGNERS_COMPONENT_URL,
    DESIGNERS_DSNAV_URL,
    DTI_VARIABLES_SCSS_URL,
    DEVKIT_INDEX_URL,
    DEVKIT_PACKAGE_JSON_URL,
    subfolderFromDocUrl,
} from '../src/constants.js'

// ── Config ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_OUT = resolve(PROJECT_ROOT, 'data-fetched')

/** Concurrent fetches to raw.githubusercontent.com — no browser involved */
const CONCURRENCY = 8

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const outDir = args.includes('--out')
    ? args[args.indexOf('--out') + 1]!
    : DEFAULT_OUT

// ── Security: output directory must be within the project ─────────────────────
// Allow sibling directories of the project root (for CI dual-checkout pattern)
const resolvedOut = resolve(outDir)
const projectParent = resolve(PROJECT_ROOT, '..')
if (!resolvedOut.startsWith(PROJECT_ROOT) && !resolvedOut.startsWith(projectParent)) {
    console.error(`PROJECT_ROOT: ${PROJECT_ROOT}`)
    console.error(`projectParent: ${projectParent}`)
    console.error(`resolvedOut: ${resolvedOut}`)
    console.error('❌ Output directory must be within the project or its parent')
    process.exit(1)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SourceResult {
    path: string
    ok: boolean
    fetchedAt: string
    error?: string
}

interface RawStatusEntry {
    title: string
    'bootstrap Italia - url'?: string
}

type RawStatusJson = { items: RawStatusEntry[] }

interface DsnavYaml {
    tag?: { label?: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
    const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: {
            'User-Agent': 'design-system-italia-mcp/snapshot',
            ...(process.env.GITHUB_TOKEN
                ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
                : {}),
        },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.text()
}

function save(relativePath: string, content: string): void {
    if (dryRun) {
        console.log(`  [dry-run] ${relativePath} (${content.length} chars)`)
        return
    }
    const fullPath = resolve(resolvedOut, relativePath)
    mkdirSync(resolve(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content, 'utf8')
}

async function fetchAndSave(
    url: string,
    relativePath: string,
    transform?: (raw: string) => string
): Promise<SourceResult> {
    const fetchedAt = new Date().toISOString()
    try {
        const raw = await fetchText(url)
        const content = transform ? transform(raw) : raw
        save(relativePath, content)
        return { path: relativePath, ok: true, fetchedAt }
    } catch (err) {
        console.warn(`  ⚠️  ${relativePath}: ${(err as Error).message}`)
        return { path: relativePath, ok: false, fetchedAt, error: (err as Error).message }
    }
}

async function batchedFetchAndSave(
    items: { url: string; path: string; transform?: (raw: string) => string }[]
): Promise<SourceResult[]> {
    const results: SourceResult[] = []
    for (let i = 0; i < items.length; i += CONCURRENCY) {
        const batch = items.slice(i, i + CONCURRENCY)
        const batchResults = await Promise.allSettled(
            batch.map(item => fetchAndSave(item.url, item.path, item.transform))
        )
        for (const r of batchResults) {
            results.push(r.status === 'fulfilled'
                ? r.value
                : { path: 'unknown', ok: false, fetchedAt: new Date().toISOString(), error: String(r.reason) }
            )
        }
    }
    return results
}

// // ── Slug from status title ────────────────────────────────────────────────────
// // "`Accordion` - check a11y e status" → "accordion"
// // Inline — does not depend on slugify.ts export stability

// function slugFromStatusTitle(title: string): string {
//   return title.replace(/`/g, '').split('-')[0].trim().toLowerCase()
// }

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`📡 Fetching static sources${dryRun ? ' (dry-run)' : ''}...`)

const results: SourceResult[] = []

// Step 1 — components-status.json (required — provides slug list + subfolders)

console.log('  bsi/components-status.json')
const statusFetchedAt = new Date().toISOString()
let statusRaw: string
try {
    statusRaw = await fetchText(BSI_STATUS_URL)
} catch (err) {
    console.error(`❌ Cannot proceed without components-status.json: ${(err as Error).message}`)
    process.exit(1)
}
save('bsi/components-status.json', statusRaw)
results.push({ path: 'bsi/components-status.json', ok: true, fetchedAt: statusFetchedAt })

const statusJson = JSON.parse(statusRaw) as RawStatusJson
const slugsWithSubfolder = statusJson.items.map(i => ({
    slug: slugFromStatusTitle(i.title),
    subfolder: i['bootstrap Italia - url']
        ? subfolderFromDocUrl(i['bootstrap Italia - url'])
        : BSI_COMPONENT_DEFAULT_SUBFOLDER,
}))
const slugs = slugsWithSubfolder.map(s => s.slug)
console.log(`  → ${slugs.length} component slugs`)

// Step 2 — BSI per-component markup
// Mirrors loadVariants() in src/loaders/bsi.ts:
// uses subfolderFromDocUrl() + slugsToTry() loop — same fallback logic.

console.log(`  bsi/components/ (${slugsWithSubfolder.length} components)`)

async function fetchMarkup(slug: string, subfolder: string): Promise<SourceResult> {
    const fetchedAt = new Date().toISOString()
    for (const s of slugsToTry(slug)) {
        const url = BSI_COMPONENT_URL(subfolder, s)
        try {
            const raw = await fetchText(url)
            save(`bsi/components/${slug}.json`, raw)
            return { path: `bsi/components/${slug}.json`, ok: true, fetchedAt }
        } catch {
            continue
        }
    }
    console.warn(`  ⚠️  bsi/components/${slug}.json: 404 for all slugsToTry`)
    return {
        path: `bsi/components/${slug}.json`,
        ok: false,
        fetchedAt,
        error: 'HTTP 404 for all slugsToTry',
    }
}

const markupResults: SourceResult[] = []
for (let i = 0; i < slugsWithSubfolder.length; i += CONCURRENCY) {
    const batch = slugsWithSubfolder.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
        batch.map(({ slug, subfolder }) => fetchMarkup(slug, subfolder))
    )
    markupResults.push(...batchResults)
}
results.push(...markupResults)

// Step 3 — BSI tokens + root bridge

console.log('  bsi/custom-properties.json')
results.push(await fetchAndSave(BSI_CUSTOM_PROPERTIES_URL, 'bsi/custom-properties.json'))

console.log('  bsi/root.scss')
results.push(await fetchAndSave(BSI_ROOT_SCSS_URL, 'bsi/root.scss'))

// Step 4 — Dev Kit index

console.log('  devkit/index.json')
results.push(await fetchAndSave(DEVKIT_INDEX_URL, 'devkit/index.json'))

// Step 5 — Design Tokens Italia

console.log('  design-tokens/variables.scss')
results.push(await fetchAndSave(DTI_VARIABLES_SCSS_URL, 'design-tokens/variables.scss'))

// Step 6 — Designers Italia YAML → JSON
// Non-fatal: not all slugs have a corresponding YAML file

console.log(`  designers/components/ (${slugs.length} components)`)
results.push(...await batchedFetchAndSave(
    slugs.map(slug => ({
        url: DESIGNERS_COMPONENT_URL(slug),
        path: `designers/components/${slug}.json`,
        transform: (raw: string) =>
            JSON.stringify(yaml.load(raw, { schema: yaml.JSON_SCHEMA }), null, 2),
    }))
))

// Step 7 — dsnav YAML → JSON (also source for designSystem version)

console.log('  dsnav.json')
const dsnavFetchedAt = new Date().toISOString()
let dsnavParsed: DsnavYaml | null = null
try {
    const dsnavRaw = await fetchText(DESIGNERS_DSNAV_URL)
    dsnavParsed = yaml.load(dsnavRaw, { schema: yaml.JSON_SCHEMA }) as DsnavYaml
    save('dsnav.json', JSON.stringify(dsnavParsed, null, 2))
    results.push({ path: 'dsnav.json', ok: true, fetchedAt: dsnavFetchedAt })
} catch (err) {
    console.warn(`  ⚠️  dsnav.json: ${(err as Error).message}`)
    results.push({ path: 'dsnav.json', ok: false, fetchedAt: dsnavFetchedAt, error: (err as Error).message })
}

// Step 8 — versions (BSI + Dev Kit from package.json, DS from dsnav)

console.log('  versions (BSI + Dev Kit + Design System)')
let bsiVersion = 'unknown'
let devkitVersion = 'unknown'
let dsVersion = 'unknown'

try {
    const bsiPkg = JSON.parse(await fetchText(BSI_PACKAGE_JSON_URL)) as { version: string }
    bsiVersion = bsiPkg.version
} catch (err) {
    console.warn(`  ⚠️  BSI version: ${(err as Error).message}`)
}

try {
    const dkPkg = JSON.parse(await fetchText(DEVKIT_PACKAGE_JSON_URL)) as { version: string }
    devkitVersion = dkPkg.version
} catch (err) {
    console.warn(`  ⚠️  Dev Kit version: ${(err as Error).message}`)
}

// reuse already-parsed dsnav — no second fetch or parse
if (dsnavParsed) {
    dsVersion = dsnavParsed.tag?.label ?? 'unknown'
}

// Step 9 — snapshot-meta.json

const ok = results.filter(r => r.ok)
const failed = results.filter(r => !r.ok)

const meta = {
    fetchedAt: new Date().toISOString(),
    versions: {
        designSystem: dsVersion,
        bootstrapItalia: bsiVersion,
        devKitItalia: devkitVersion,
    },
    stats: {
        total: results.length,
        ok: ok.length,
        failed: failed.length,
    },
    sources: Object.fromEntries(
        results.map(r => [
            r.path,
            { ok: r.ok, fetchedAt: r.fetchedAt, ...(r.error ? { error: r.error } : {}) },
        ])
    ),
}

save('snapshot-meta.json', JSON.stringify(meta, null, 2))
console.log('  snapshot-meta.json')

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${ok.length}/${results.length} sources fetched successfully`)

// Non-fatal: designers 404s are expected (not all components have YAML)
// Fatal: everything else — broken upstream or structural change
const fatalFailed = failed.filter(r =>
    !r.path.startsWith('designers/') &&
    r.path !== 'snapshot-meta.json'
)

if (failed.length > 0) {
    const designersFailed = failed.filter(r => r.path.startsWith('designers/'))
    if (designersFailed.length > 0) {
        console.warn(`⚠️  ${designersFailed.length} designers 404s (expected):`)
        designersFailed.forEach(r => console.warn(`   ${r.path}`))
    }
}

if (fatalFailed.length > 0) {
    console.error(`❌ ${fatalFailed.length} fatal errors:`)
    fatalFailed.forEach(r => console.error(`   ${r.path}: ${r.error}`))
    process.exit(1)
}