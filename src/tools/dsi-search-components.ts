import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { slugsToTry } from '../slugify.js'
import { buildComponentUnion, buildMeta } from './helpers.js'
import { BSI_STATUS_URL, DEVKIT_INDEX_URL } from '../constants.js'

// ─── Tool: dsi_search_components ──────────────────────────────────────────────
// Search over the same union as dsi_list_components. See buildComponentUnion
// in helpers.ts for the shared union logic.

export function registerDsiSearchComponents(server: McpServer): void {
  server.registerTool(
    'dsi_search_components',
    {
      title: 'Search Components',
      description: 'Search the unified Design System component inventory by name, slug, ' +
        'Italian/English alias or Dev Kit tag. Searches the union of Bootstrap Italia and Dev Kit ' +
        'components — same unified rows as dsi_list_components (bsi:{}|null, devkit:{}|null). ' +
        'Alias examples: fisarmonica->accordion, toast->notifications.',
      inputSchema: { query: z.string().describe('Search text (e.g. "button", "accordion", "toast")') },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      query = query.trim()
      const q = query.toLowerCase()
      const { rows, dsMeta } = await buildComponentUnion()

      // Match on any known alias of the slug (not just the canonical slug itself),
      // name, or Dev Kit tags — same coverage as before, now over the full union.
      const results = rows.filter((r) =>
        slugsToTry(r.slug).some((a) => a.includes(q)) ||
        r.name.toLowerCase().includes(q) ||
        (r.devkit?.tags.some((t) => t.includes(q)) ?? false)
      )

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