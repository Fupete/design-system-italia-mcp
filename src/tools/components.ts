import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadAllStatuses, loadVariants } from '../loaders/bsi.js'
import { loadDevKitIndex } from '../loaders/devkit.js'
import { slugify } from '../slugify.js'
import { BSI_STATUS_URL, BSI_COMPONENT_URL, DEVKIT_INDEX_URL, BSI_DOC_BASE } from '../constants.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bsiDocUrl(slug: string): string {
  return `${BSI_DOC_BASE}/${slug}/`
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

// ─── Tool: list_components ────────────────────────────────────────────────────

export function registerListComponents(server: McpServer): void {
  server.registerTool(
    'list_components',
    {
      title: 'List Components',
      description: 'Lists all Design System .italia components with library status ' +
        '(Bootstrap Italia, UI Kit, ...) and accessibility status.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const statuses = await loadAllStatuses()
      const devKitIndex = await loadDevKitIndex()

      const components = [...statuses.values()].map((s) => ({
        name: s.name,
        slug: s.slug,
        status: {
          bootstrapItalia: s.libraryStatus.bootstrapItalia,
          uiKitItalia: s.libraryStatus.uiKitItalia,
        },
        accessibility: {
          checkCompleted: s.accessibility.checkCompleted,
        },
        devKit: devKitIndex.has(s.slug)
          ? {
            tags: devKitIndex.get(s.slug)!.tags,
            storybookUrl: devKitIndex.get(s.slug)!.storybookUrl,
            pattern: devKitIndex.get(s.slug)!.pattern,
          }
          : null,
        bsiDocUrl: s.sourceUrls.bsiDoc ?? bsiDocUrl(s.slug),
      }))

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total: components.length,
                components,
                meta: {
                  fetchedAt: formatTimestamp(),
                  sourceUrls: [BSI_STATUS_URL, DEVKIT_INDEX_URL],
                  stability: 'alpha' as const,
                },
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )
}

// ─── Tool: get_component ──────────────────────────────────────────────────────

export function registerGetComponent(server: McpServer): void {
  server.registerTool(
    'get_component',
    {
      title: 'Get Component',
      description: 'Returns HTML markup for all variants of a Bootstrap Italia component ' +
        'and web component it-* props from Dev Kit Italia.',
      inputSchema: { name: z.string().describe('Component name or slug (e.g. "accordion", "Accordion")') },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      name = name.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      const [variants, devKitIndex] = await Promise.all([
        loadVariants(slug),
        loadDevKitIndex(),
      ])

      if (variants.length === 0) {
        warnings.push(`No BSI variants found for "${slug}"`)
      }

      const devKitEntry = devKitIndex.get(slug) ?? null
      if (!devKitEntry) {
        warnings.push(`Component not found in Dev Kit Italia for "${slug}"`)
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: slug,
                slug,
                variants,
                devKit: devKitEntry
                  ? {
                    tags: devKitEntry.tags,
                    storybookUrl: devKitEntry.storybookUrl,
                    variants: devKitEntry.variants,
                    pattern: devKitEntry.pattern,
                  }
                  : null,
                meta: {
                  fetchedAt: formatTimestamp(),
                  sourceUrls: [BSI_COMPONENT_URL(slug), DEVKIT_INDEX_URL],
                  warnings,
                  stability: 'alpha' as const,
                },
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )
}

// ─── Tool: search_components ──────────────────────────────────────────────────

export function registerSearchComponents(server: McpServer): void {
  server.registerTool(
    'search_components',
    {
      title: 'Search Components',
      description: 'Search components by name or feature. ' +
        'Component names are generally in English (e.g. "modal" not "modale", "button" not "bottone"). ' +
        'Searches name, slug and Dev Kit tags (e.g. "a11y-ok", "alpha", "web-component").',
      inputSchema: { query: z.string().describe('Search text (e.g. "button", "alpha", "accordion")') },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      query = query.trim()
      const q = query.toLowerCase().trim()
      const [statuses, devKitIndex] = await Promise.all([
        loadAllStatuses(),
        loadDevKitIndex(),
      ])

      const results = [...statuses.values()]
        .filter((s) => {
          const devKit = devKitIndex.get(s.slug)
          return (
            s.slug.includes(q) ||
            s.name.toLowerCase().includes(q) ||
            devKit?.tags.some((t) => t.includes(q))
          )
        })
        .map((s) => {
          const devKit = devKitIndex.get(s.slug)
          return {
            name: s.name,
            slug: s.slug,
            status: s.libraryStatus.bootstrapItalia,
            tags: devKit?.tags ?? [],
            bsiDocUrl: s.sourceUrls.bsiDoc ?? bsiDocUrl(s.slug),
            storybookUrl: devKit?.storybookUrl ?? null,
          }
        })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                total: results.length,
                results,
                meta: {
                  fetchedAt: formatTimestamp(),
                  sourceUrls: [BSI_STATUS_URL, DEVKIT_INDEX_URL],
                  stability: 'alpha' as const,
                },
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )
}