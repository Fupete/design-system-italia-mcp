import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadAllStatuses } from '../loaders/bsi.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BSI_STATUS_URL } from '../constants.js'

// ─── Tool: bsi_list_components_by_status ──────────────────────────────────────
// Only Bootstrap Italia is filterable here — uiKitItalia status lives in Figma, not this API.

export function registerBsiListComponentsByStatus(server: McpServer): void {
  server.registerTool(
    'bsi_list_components_by_status',
    {
      title: 'List Components By Status',
      description: 'Lists Bootstrap Italia components filtered by implementation status. ' +
        'Valid values: PRONTO, DA RIVEDERE A11Y, DA RIVEDERE, IN REVIEW, ' +
        'DA COMPLETARE VARIANTI, NON PRESENTE, DA FARE, N/D. ' +
        'Use dsi_list_components for full status overview.',
      inputSchema: {
        status: z.string().describe('Status to filter (e.g. "PRONTO", "DA FARE", "NON PRESENTE")'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status }) => {
      status = status.trim()
      const [allStatuses, dsMeta] = await Promise.all([
        loadAllStatuses(),
        loadDsMeta(),
      ])
      const statusUpper = status.toUpperCase()

      const results = [...allStatuses.values()]
        .filter((s) => s.libraryStatus.bootstrapItalia.toUpperCase() === statusUpper)
        .map((s) => ({
          name: s.name,
          slug: s.slug,
          status: s.libraryStatus.bootstrapItalia,
          bsiDoc: s.sourceUrls.bsiDoc ?? null,
        }))

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: statusUpper,
                total: results.length,
                results,
                meta: buildMeta({
                  dsMeta,
                  sourceUrls: [BSI_STATUS_URL],
                  warnings: [],
                  stability: 'stable',
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