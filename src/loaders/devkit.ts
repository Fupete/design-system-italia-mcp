import { fetchJson, fetchText } from '../fetch.js'
import { cache, CACHE_KEYS, TTL } from '../cache.js'
import { slugFromStorybookTitle, slugsToTry, slugify } from '../slugify.js'
import type { DevKitEntry, DevKitComponent, WebComponentProp, ComponentVariant, DevKitStorySnapshot, DevKitPropsSnapshot } from '../types.js'
import { SNAPSHOT_DEVKIT_INDEX_URL, SNAPSHOT_DEVKIT_STORY_URL, SNAPSHOT_DEVKIT_PROPS_URL, DEVKIT_STORYBOOK_BASE, DEVKIT_STORIES_URL } from '../constants.js'
import { parseStories } from './devkit-parser.js'

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
  for (const s of slugsToTry(slugify(slug))) {
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
  const normalized = slugify(slug)
  const key = CACHE_KEYS.devKitStories(normalized)
  const cached = cache.get<ComponentVariant[]>(key)
  if (cached) return cached
  for (const s of slugsToTry(normalized)) {
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

export async function loadDevKitComponent(slug: string): Promise<DevKitComponent | null> {
  const key = CACHE_KEYS.devKitProps(slugify(slug))
  const cached = cache.get<DevKitComponent>(key)
  if (cached) return cached

  const entry = await loadDevKitEntry(slug)
  if (!entry) return null
  if (entry.pattern === 'bundle') return null

  // Read from snapshot instead of upstream stories.ts
  for (const s of slugsToTry(slugify(slug))) {
    const url = SNAPSHOT_DEVKIT_PROPS_URL(s)
    try {
      const snapshot = await fetchJson<DevKitPropsSnapshot>(url)
      const component: DevKitComponent = {
        tagName: snapshot.tagName,
        props: snapshot.props,
        subcomponents: snapshot.subcomponents,
        description: snapshot.description,
      }
      cache.set(key, component, TTL.snapshot)
      return component
    } catch {
      continue
    }
  }

  // Fallback to upstream stories.ts if snapshot not available
  console.warn(`Dev Kit props snapshot not found for "${slug}" — falling back to upstream`)
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