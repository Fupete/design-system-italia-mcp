import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadAllStatuses } from '../loaders/bsi.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BSI_STATUS_URL } from '../constants.js'

// ─── Tool: list_by_status ─────────────────────────────────────────────────────

export function registerListByStatus(server: McpServer): void {
  server.registerTool(
    'list_by_status',
    {
      title: 'List By Status',
      description: 'Lists components filtered by status in a specific library. ' +
        'Available libraries: bootstrapItalia, uiKitItalia, ... ' +
        'Possible statuses: PRONTO, DA RIVEDERE A11Y, DA RIVEDERE, IN REVIEW, ' +
        'DA COMPLETARE VARIANTI, NON PRESENTE, DA FARE, N/D.',
      inputSchema: {
        library: z.enum(['bootstrapItalia', 'uiKitItalia']).describe('Library to filter'),
        status: z.string().describe('Status to filter (e.g. "PRONTO", "DA FARE", "NON PRESENTE")'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ library, status }) => {
      status = status.trim()
      const [allStatuses, dsMeta] = await Promise.all([
        loadAllStatuses(),
        loadDsMeta(),
      ])
      const statusUpper = status.toUpperCase().trim()

      const results = [...allStatuses.values()]
        .filter((s) => s.libraryStatus[library].toUpperCase() === statusUpper)
        .map((s) => ({
          name: s.name,
          slug: s.slug,
          status: s.libraryStatus[library],
          bsiDoc: s.sourceUrls.bsiDoc ?? null,
        }))

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                library,
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