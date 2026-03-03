import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { slugFromStorybookId, slugFromImportPath } from '../slugify.js'
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

// ─── Sorgente #6 — index.json ─────────────────────────────────────────────────

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
    // Prendi solo le entry di tipo docs per i componenti
    if (entry.type !== 'docs') continue
    if (!entry.id.startsWith('componenti-')) continue

    const slug = slugFromStorybookId(entry.id)
    if (!slug) continue

    // Determina importPath della story (da storiesImports se presente)
    const importPath = entry.storiesImports?.[0] ?? entry.importPath

    // Determina pattern: dedicated (package it-*) o bundle
    const pattern = importPath.includes('/dev-kit-italia/stories/components/')
      ? 'bundle'
      : 'dedicated'

    // Varianti: le story di tipo 'story' con stesso titolo
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

// ─── Sorgente #7 — stories.ts ─────────────────────────────────────────────────
//
// Parsing statico del TypeScript as text — solo regex, nessun transpiler.
// Estrae argTypes per ogni componente e sottocomponente.

// Estrae il blocco argTypes da una story export
function extractArgTypesBlock(source: string, exportName?: string): string | null {
  // Fix: usa [\s\S]*? invece di [^}]* per attraversare oggetti annidati
  // prima di raggiungere argTypes nel meta o nell'export
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

// Estrae singola prop dal blocco argTypes
function parseProp(name: string, block: string): WebComponentProp | null {
  // Cerca il blocco della prop: propName: { ... }
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

  // description
  const desc = propBlock.match(/description:\s*['"`]([\s\S]*?)['"`]/)?.[1]?.trim() ?? null

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

  // nome HTML dell'attributo (può differire dalla chiave TS)
  const htmlName = propBlock.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? name

  return {
    name: htmlName,
    type: control,
    description: desc,
    default: defaultVal,
    options,
  }
}

// Estrae tutte le prop keys da un blocco argTypes
function extractPropKeys(argTypesBlock: string): string[] {
  const keys: string[] = []
  // Cerca pattern: "  propName: {" all'inizio di riga (dentro il blocco)
  const matches = argTypesBlock.matchAll(/^\s{2,4}(\w+):\s*\{/gm)
  for (const m of matches) {
    keys.push(m[1])
  }
  return keys
}

// Cerca export const con argTypes che riguarda un sottocomponente
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

// Estrae tag name del componente principale dal meta
// Fix: ancora su singola riga con $ per evitare match su descrizioni multiriga
function extractTagName(source: string): string | null {
  return source.match(/^\s*component:\s*['"`](it-[a-z0-9-]+)['"`]\s*,?$/m)?.[1] ?? null
}

// Estrae tag name dai sottocomponenti (decorator o render)
function extractSubTagNames(source: string, exportName: string): string[] {
  const exportPattern = new RegExp(
    `export const ${exportName}[\\s\\S]*?(?=export const |$)`, 'm'
  )
  const block = source.match(exportPattern)?.[0] ?? ''
  const tags = new Set<string>()
  const matches = block.matchAll(/<(it-[a-z0-9-]+)/g)
  for (const m of matches) tags.add(m[1])
  return [...tags]
}

function parseStories(source: string): DevKitComponent | null {
  const tagName = extractTagName(source)
  if (!tagName) return null

  // Props del componente principale dal meta.argTypes
  const metaArgTypes = extractArgTypesBlock(source)
  const mainProps: WebComponentProp[] = []

  if (metaArgTypes) {
    const keys = extractPropKeys(metaArgTypes)
    for (const key of keys) {
      const prop = parseProp(key, metaArgTypes)
      if (prop) mainProps.push(prop)
    }
  }

  // Sottocomponenti dagli export secondari
  const subExports = extractSubcomponentExports(source)
  const subcomponents: DevKitComponent['subcomponents'] = []

  for (const exportName of subExports) {
    const argTypesBlock = extractArgTypesBlock(source, exportName)
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

  // Descrizione dal docs.description.component
  const desc = source.match(/component:\s*`([\s\S]*?)`/)?.[1]?.trim() ?? null

  return { tagName, props: mainProps, subcomponents, description: desc }
}

// ─── Loader pubblico ──────────────────────────────────────────────────────────

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
  } catch {
    return null
  }
}