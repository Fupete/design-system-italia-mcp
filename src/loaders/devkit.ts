import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { slugFromStorybookTitle } from '../slugify.js'
import type { DevKitEntry, DevKitComponent, WebComponentProp } from '../types.js'
import { DEVKIT_INDEX_URL, DEVKIT_STORIES_URL, DEVKIT_STORYBOOK_BASE } from '../constants.js'
import { slugsToTry } from '../slugify.js'

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`DevKit fetch failed: ${res.status} ${url}`)
  return res.json() as Promise<T>
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`DevKit fetch failed: ${res.status} ${url}`)
  return res.text()
}

// ─── Source #6 — index.json ───────────────────────────────────────────────────

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

type DevKitIndex = Map<string, DevKitEntry>  // slug → DevKitEntry

export async function loadDevKitIndex(): Promise<DevKitIndex> {
  const cached = cache.get<DevKitIndex>(CACHE_KEYS.devKitIndex())
  if (cached) return cached

  const raw = await fetchJson<IndexJson>(DEVKIT_INDEX_URL)
  const index: DevKitIndex = new Map()

  for (const entry of Object.values(raw.entries)) {
    // Take only docs-type entries for components
    if (entry.type !== 'docs') continue
    if (!entry.id.startsWith('componenti-')) continue

    const slug = slugFromStorybookTitle(entry.title)
    if (!slug) continue

    // Determine story importPath (from storiesImports if present)
    const importPath = entry.storiesImports?.[0] ?? entry.importPath

    // Determine pattern: dedicated (it-* package) or bundle
    const pattern = importPath.includes('/dev-kit-italia/stories/components/')
      ? 'bundle'
      : 'dedicated'

    // Variants: 'story' type entries with same title
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
    }

    index.set(slug, devKitEntry)
  }

  cache.set(CACHE_KEYS.devKitIndex(), index, TTL.devKitIndex)
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

// ─── Source #7 — stories.ts ───────────────────────────────────────────────────
//
// Static TypeScript parsing as text — regex only, no transpiler.
// Extracts argTypes for each component and subcomponent.

// Extracts the argTypes block from a story export
function extractArgTypesBlock(source: string, exportName?: string): string | null {
  // Fix: use [\s\S]*? instead of [^}]* to traverse nested objects
  // before reaching argTypes in meta or export
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

// Extracts the full block of a named export: export const Foo = { ... }
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

// Finds argTypes: { ... } inside an already-extracted block
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

// Extracts a single prop from an argTypes block
function parseProp(name: string, block: string): WebComponentProp | null {
  // Search for the prop block: propName: { ... }
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

  // Skip props explicitly disabled in table
  if (propBlock.includes('disable: true')) return null

  // description
  const descMatch = propBlock.match(/description:\s*("[\s\S]*?"|'[\s\S]*?'|`[\s\S]*?`)/)
  const desc = descMatch ? descMatch[1].slice(1, -1).trim() : null

  // control type
  const control = propBlock.match(/control:\s*['"`]([^'"`]+)['"`]/)?.[1] ??
    propBlock.match(/control:\s*\{[^}]*type:\s*['"`]([^'"`]+)['"`]/)?.[1] ??
    'text'

  // default value
  const defaultVal = propBlock.match(/summary:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? null

  // options
  const optionsMatch = propBlock.match(/options:\s*\[([^\]]+)\]/)
  const options = optionsMatch
    ? optionsMatch[1].match(/['"`]([^'"`]+)['"`]/g)?.map((s) => s.replace(/['"`]/g, '')) ?? []
    : []

  // HTML attribute name (may differ from TS key)
  const htmlName = propBlock.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? name

  return {
    name: htmlName,
    type: control,
    description: desc,
    default: defaultVal,
    options,
  }
}

// Extracts all prop keys from an argTypes block
function extractPropKeys(argTypesBlock: string): string[] {
  const keys: string[] = []
  // Matches pattern: "  propName: {" at start of line (inside the block)
  const matches = argTypesBlock.matchAll(/^\s{2,4}(\w+):\s*\{/gm)
  for (const m of matches) {
    keys.push(m[1])
  }
  return keys
}

// Searches for export const with argTypes for a subcomponent
function extractSubcomponentExports(source: string): string[] {
  const exports: string[] = []
  const matches = source.matchAll(/^export const (\w+)\s*=/gm)
  for (const m of matches) {
    if (m[1] !== 'default' && /^[A-Z]/.test(m[1])) {
      exports.push(m[1])
    }
  }
  return exports
}

// Extracts the main component tag name from meta
// Fix: anchored to single line with $ to avoid matching multiline descriptions
function extractTagName(source: string): string | null {
  return source.match(/^\s*component:\s*['"`](it-[a-z0-9-]+)['"`]\s*,?$/m)?.[1] ?? null
}

// Extracts tag names from subcomponents (decorator or render)
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

  // Props of the main component from meta.argTypes
  const metaArgTypes = extractArgTypesBlock(source)
  const mainProps: WebComponentProp[] = []

  if (metaArgTypes) {
    const keys = extractPropKeys(metaArgTypes)
    for (const key of keys) {
      const prop = parseProp(key, metaArgTypes)
      if (prop) mainProps.push(prop)
    }
  }

  // Subcomponents from secondary exports
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

    if (subProps.length > 0) {
      subcomponents.push({ tagName: subTagName, props: subProps })
    }
  }

  // Description from docs.description.component
  const desc = source.match(/component:\s*`([\s\S]*?)`/)?.[1]?.trim() ?? null

  return { tagName, props: mainProps, subcomponents, description: desc }
}

// ─── Public loader ────────────────────────────────────────────────────────────

export async function loadDevKitComponent(slug: string): Promise<DevKitComponent | null> {
  const key = CACHE_KEYS.devKitStories(slug)
  const cached = cache.get<DevKitComponent>(key)
  if (cached) return cached

  const entry = await loadDevKitEntry(slug)
  if (!entry) return null

  const rawUrl = DEVKIT_STORIES_URL(entry.importPath)
  try {
    const source = await fetchText(rawUrl)
    const component = parseStories(source)
    if (component) cache.set(key, component, TTL.devKitStories)
    return component
  } catch (err) {
    console.warn(`Dev Kit stories parse failed for "${slug}": ${(err as Error).message}`)
    return null
  }
}