import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { formatTimestamp } from '../utils.js'
import { loadAllStatuses, loadStatus, loadVariants } from '../loaders/bsi.js'
import { loadDevKitIndex, loadDevKitEntry } from '../loaders/devkit.js'
import { slugify, slugsToTry } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { BSI_STATUS_URL, BSI_COMPONENT_URL, DEVKIT_INDEX_URL, BSI_DOC_BASE, BSI_COMPONENT_DEFAULT_SUBFOLDER, subfolderFromDocUrl } from '../constants.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bsiDocUrl(slug: string): string {
  return `${BSI_DOC_BASE}/${slug}/`
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
      const [statuses, devKitIndex, dsMeta] = await Promise.all([
        loadAllStatuses(),
        loadDevKitIndex(),
        loadDsMeta(),
      ])

      const components = [...statuses.values()].map((s) => {
        const devKitSlug = slugsToTry(s.slug).find(a => devKitIndex.has(a)) ?? null
        return {
          name: s.name,
          slug: s.slug,
          status: {
            bootstrapItalia: s.libraryStatus.bootstrapItalia,
            uiKitItalia: s.libraryStatus.uiKitItalia,
          },
          accessibility: {
            checkCompleted: s.accessibility.checkCompleted,
          },
          devKit: devKitSlug
            ? {
              tags: devKitIndex.get(devKitSlug)!.tags,
              storybookUrl: devKitIndex.get(devKitSlug)!.storybookUrl,
              pattern: devKitIndex.get(devKitSlug)!.pattern,
            }
            : null,
          bsiDocUrl: s.sourceUrls.bsiDoc ?? bsiDocUrl(s.slug),
        }
      })

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
                  versions: dsMeta.versions,
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
      inputSchema: {
        name: z.string().describe('Component name or slug (e.g. "accordion", "Accordion")'),
        maxVariants: z.number().optional().default(3).describe('Maximum number of variants with full markup (default 3). Use get_component_variant to fetch others by name.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ name, maxVariants }) => {
      name = name.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      const [status, devKitIndex] = await Promise.all([
        loadStatus(slug),
        loadDevKitIndex(),
      ])

      const allVariants = await loadVariants(slug, status?.sourceUrls.bsiDoc)

      if (allVariants.length === 0) {
        warnings.push(`No BSI variants found for "${slug}"`)
      }

      const devKitEntry = await loadDevKitEntry(slug)
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
                variantsCount: allVariants.length,
                variantsAvailable: allVariants.map(v => v.name),
                variants: allVariants.slice(0, maxVariants),
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
                  sourceUrls: [
                    BSI_COMPONENT_URL(
                      status?.sourceUrls.bsiDoc
                        ? subfolderFromDocUrl(status.sourceUrls.bsiDoc)
                        : BSI_COMPONENT_DEFAULT_SUBFOLDER,
                      slug
                    ),
                    DEVKIT_INDEX_URL,
                  ],
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
      const [statuses, devKitIndex, dsMeta] = await Promise.all([
        loadAllStatuses(),
        loadDevKitIndex(),
        loadDsMeta(),
      ])

      const results = [...statuses.values()]
        .filter((s) => {
          const devKitSlug = slugsToTry(s.slug).find(a => devKitIndex.has(a)) ?? null
          const devKit = devKitSlug ? devKitIndex.get(devKitSlug) : null
          return (
            s.slug.includes(q) ||
            s.name.toLowerCase().includes(q) ||
            devKit?.tags.some((t) => t.includes(q))
          )
        })
        .map((s) => {
          const devKitSlug = slugsToTry(s.slug).find(a => devKitIndex.has(a)) ?? null
          const devKit = devKitSlug ? devKitIndex.get(devKitSlug) : null
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
                  versions: dsMeta.versions,
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