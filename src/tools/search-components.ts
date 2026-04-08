import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadAllStatuses } from '../loaders/bsi.js'
import { loadDevKitIndex } from '../loaders/devkit.js'
import { slugsToTry } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BSI_STATUS_URL, DEVKIT_INDEX_URL, BSI_DOC_BASE } from '../constants.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bsiDocUrl(slug: string): string {
  return `${BSI_DOC_BASE}/${slug}/`
}

// ─── Tool: search_components ──────────────────────────────────────────────────

export function registerSearchComponents(server: McpServer): void {
  server.registerTool(
    'search_components',
    {
      title: 'Search Components',
      description: 'Search components by name or feature. ' +
        'Component names are generally in English (e.g. "modal" not "modale", "button" not "bottone"), with support for some Italian aliases. ' +
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
          const allSlugs = slugsToTry(s.slug)
          return (
            allSlugs.some(a => a.includes(q)) ||
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
            devKit: devKit
              ? {
                slug: devKit.slug,
                tags: devKit.tags,
                storybookUrl: devKit.storybookUrl,
                pattern: devKit.pattern,
                componentType: devKit.componentType,
              }
              : null,

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
                meta: buildMeta({
                  dsMeta,
                  sourceUrls: [BSI_STATUS_URL, DEVKIT_INDEX_URL],
                  warnings: [],
                  stability: 'alpha',
                  extra: { versions: dsMeta?.versions ?? undefined },
                }),
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