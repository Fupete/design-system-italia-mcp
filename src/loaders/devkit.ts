import { fetchJson, fetchText } from '../fetch.js'
import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { slugFromStorybookTitle, slugsToTry } from '../slugify.js'
import type { DevKitEntry, DevKitComponent, WebComponentProp, ComponentVariant, DevKitStorySnapshot } from '../types.js'
import { SNAPSHOT_DEVKIT_INDEX_URL, SNAPSHOT_DEVKIT_STORY_URL, DEVKIT_STORYBOOK_BASE, DEVKIT_STORIES_URL } from '../constants.js'

// ─── Source #6 — devkit/index.json ───────────────────────────────────────────

interface IndexEntry {
  id: string
  title: string
  name: string
  type: 'docs' | 'story'
  tags: string[]
  importPath: string
  storiesImports?: string[]
}

type IndexJson = { v: number; entries: Record<string, IndexEntry> }
type DevKitIndex = Map<string, DevKitEntry>

export async function loadDevKitIndex(): Promise<DevKitIndex> {
  const cached = cache.get<DevKitIndex>(CACHE_KEYS.devKitIndex())
  if (cached) return cached

  const raw = await fetchJson<IndexJson>(SNAPSHOT_DEVKIT_INDEX_URL)
  const index: DevKitIndex = new Map()

  for (const entry of Object.values(raw.entries)) {
    if (entry.type !== 'docs') continue
    if (!entry.id.startsWith('componenti-')) continue

    const slug = slugFromStorybookTitle(entry.title)
    if (!slug) continue

    const importPath = entry.storiesImports?.[0] ?? entry.importPath
    const pattern = importPath.includes('/dev-kit-italia/stories/components/')
      ? 'bundle'
      : 'dedicated'

    const variants = Object.values(raw.entries)
      .filter((e) => e.type === 'story' && e.title === entry.title)
      .map((e) => e.name)

    const devKitEntry: DevKitEntry = {
      slug,
      tags: entry.tags.filter((t) => !['dev', 'test', 'attached-mdx', 'unattached-mdx'].includes(t)),
      storybookUrl: `${DEVKIT_STORYBOOK_BASE}/?path=/docs/${entry.id}`,
      importPath,
      variants,
      pattern,
      componentType: pattern === 'dedicated' ? 'web-component' as const : 'html-bsi' as const,
    }

    index.set(slug, devKitEntry)
  }

  cache.set(CACHE_KEYS.devKitIndex(), index, TTL.snapshot)
  return index
}

export async function loadDevKitEntry(slug: string): Promise<DevKitEntry | null> {
  const index = await loadDevKitIndex()
  for (const s of slugsToTry(slug)) {
    const entry = index.get(s)
    if (entry) return entry
  }
  return null
}

// ─── Source #7 — devkit/stories/{slug}.json ──────────────────────────────────
// Snapshot contains clean HTML markup extracted from Storybook source panels.
// Replaces runtime TypeScript parsing (parseStoryVariants).

export async function loadStoryVariants(
  slug: string
): Promise<ComponentVariant[] | null> {
  const key = CACHE_KEYS.devKitStories(slug)
  const cached = cache.get<ComponentVariant[]>(key)
  if (cached) return cached

  for (const s of slugsToTry(slug)) {
    const url = SNAPSHOT_DEVKIT_STORY_URL(s)
    try {
      const snapshot = await fetchJson<DevKitStorySnapshot>(url)
      if (!snapshot.variants || snapshot.variants.length === 0) continue
      const variants: ComponentVariant[] = snapshot.variants.map(v => ({
        name: v.name,
        html: v.html,
      }))
      cache.set(key, variants, TTL.snapshot)
      return variants
    } catch {
      continue
    }
  }
  return null
}

// ─── Web component props — stories.ts parsing ────────────────────────────────
// Still reads from upstream stories.ts for argTypes (props/subcomponents).
// This is separate from story variants — props are structural metadata,
// not affected by the Lit rendering issue that motivated the snapshot approach.

function extractArgTypesBlock(source: string, exportName?: string): string | null {
  const pattern = exportName
    ? new RegExp(`export const ${exportName}[\\s\\S]*?argTypes:\\s*\\{`, 's')
    : /const meta[\s\S]*?argTypes:\s*\{/s

  const startMatch = source.match(pattern)
  if (!startMatch) return null

  const startIdx = (startMatch.index ?? 0) + startMatch[0].length - 1
  let depth = 0
  let i = startIdx

  while (i < source.length) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(startIdx, i + 1)
    }
    i++
  }
  return null
}

function extractExportBlock(source: string, exportName: string): string | null {
  const start = source.indexOf(`export const ${exportName}`)
  if (start === -1) return null
  const braceStart = source.indexOf('{', start)
  if (braceStart === -1) return null
  let depth = 0, i = braceStart
  while (i < source.length) {
    if (source[i] === '{') depth++
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(braceStart, i + 1) }
    i++
  }
  return null
}

function findArgTypesInBlock(block: string): string | null {
  const match = block.match(/argTypes:\s*\{/)
  if (!match) return null
  const startIdx = (match.index ?? 0) + match[0].length - 1
  let depth = 0, i = startIdx
  while (i < block.length) {
    if (block[i] === '{') depth++
    if (block[i] === '}') { depth--; if (depth === 0) return block.slice(startIdx, i + 1) }
    i++
  }
  return null
}

function parseProp(name: string, block: string): WebComponentProp | null {
  const propPattern = new RegExp(`${name}:\\s*\\{`, 's')
  const startMatch = block.match(propPattern)
  if (!startMatch) return null

  const startIdx = (startMatch.index ?? 0) + startMatch[0].length - 1
  let depth = 0
  let i = startIdx
  while (i < block.length) {
    if (block[i] === '{') depth++
    if (block[i] === '}') { depth--; if (depth === 0) break }
    i++
  }
  const propBlock = block.slice(startIdx, i + 1)

  if (propBlock.includes('disable: true')) return null

  const descMatch = propBlock.match(/description:\s*("[\s\S]*?"|'[\s\S]*?'|`[\s\S]*?`)/)
  const desc = descMatch ? descMatch[1].slice(1, -1).trim() : null

  const control = propBlock.match(/control:\s*['"`]([^'"`]+)['"`]/)?.[1] ??
    propBlock.match(/control:\s*\{[^}]*type:\s*['"`]([^'"`]+)['"`]/)?.[1] ??
    'text'

  const defaultVal = propBlock.match(/summary:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? null

  const optionsMatch = propBlock.match(/options:\s*\[([^\]]+)\]/)
  const options = optionsMatch
    ? optionsMatch[1].match(/['"`]([^'"`]+)['"`]/g)?.map((s) => s.replace(/['"`]/g, '')) ?? []
    : []

  const htmlName = propBlock.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? name

  return { name: htmlName, type: control, description: desc, default: defaultVal, options }
}

function extractPropKeys(argTypesBlock: string): string[] {
  const keys: string[] = []
  const matches = argTypesBlock.matchAll(/^\s{2,4}(\w+):\s*\{/gm)
  for (const m of matches) keys.push(m[1])
  return keys
}

function extractSubcomponentExports(source: string): string[] {
  const exports: string[] = []
  const matches = source.matchAll(/^export const (\w+)\s*=/gm)
  for (const m of matches) {
    if (m[1] !== 'default' && /^[A-Z]/.test(m[1])) exports.push(m[1])
  }
  return exports
}

function extractTagName(source: string): string | null {
  return source.match(/^\s*component:\s*['"`](it-[a-z0-9-]+)['"`]\s*,?$/m)?.[1] ?? null
}

function extractSubTagNames(source: string, exportName: string): string[] {
  const block = extractExportBlock(source, exportName) ?? ''
  const tags = new Set<string>()
  const matches = block.matchAll(/<(it-[a-z0-9-]+)/g)
  for (const m of matches) tags.add(m[1])
  return [...tags]
}

function parseStories(source: string): DevKitComponent | null {
  const tagName = extractTagName(source)
  if (!tagName) return null

  const metaArgTypes = extractArgTypesBlock(source)
  const mainProps: WebComponentProp[] = []

  if (metaArgTypes) {
    const keys = extractPropKeys(metaArgTypes)
    for (const key of keys) {
      const prop = parseProp(key, metaArgTypes)
      if (prop) mainProps.push(prop)
    }
  }

  const subExports = extractSubcomponentExports(source)
  const subcomponents: DevKitComponent['subcomponents'] = []

  for (const exportName of subExports) {
    const exportBlock = extractExportBlock(source, exportName)
    const argTypesBlock = exportBlock ? findArgTypesInBlock(exportBlock) : null
    if (!argTypesBlock) continue

    const subTagNames = extractSubTagNames(source, exportName)
    const subTagName = subTagNames.find((t) => t !== tagName)
    if (!subTagName) continue

    const subProps: WebComponentProp[] = []
    const keys = extractPropKeys(argTypesBlock)
    for (const key of keys) {
      const prop = parseProp(key, argTypesBlock)
      if (prop) subProps.push(prop)
    }

    if (subProps.length > 0) subcomponents.push({ tagName: subTagName, props: subProps })
  }

  const desc = source.match(/component:\s*`([\s\S]*?)`/)?.[1]?.trim() ?? null

  return { tagName, props: mainProps, subcomponents, description: desc }
}

export async function loadDevKitComponent(slug: string): Promise<DevKitComponent | null> {
  const key = CACHE_KEYS.devKitComponent(slug)
  const cached = cache.get<DevKitComponent>(key)
  if (cached) return cached

  const entry = await loadDevKitEntry(slug)
  if (!entry) return null
  if (entry.pattern === 'bundle') return null

  const rawUrl = DEVKIT_STORIES_URL(entry.importPath)
  try {
    const source = await fetchText(rawUrl)
    const component = parseStories(source)
    if (component) cache.set(key, component, TTL.snapshot)
    return component
  } catch (err) {
    console.warn(`Dev Kit stories parse failed for "${slug}": ${(err as Error).message}`)
    return null
  }
}