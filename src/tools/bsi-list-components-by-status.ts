import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadAllStatuses } from '../loaders/bsi.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BETA_WARNING, BSI_STATUS_URL } from '../constants.js'

// ─── Tool: bsi_list_components_by_status ──────────────────────────────────
// bootstrapItalia (default) and devKitItalia are filterable here, both
// live in components_status.json - uiKitItalia status lives in Figma, not 
// this API.

export function registerBsiListComponentsByStatus(server: McpServer): void {
  server.registerTool(
    'bsi_list_components_by_status',
    {
      title: 'List Components By Status',
      description: 'Lists Design System .italia components filtered by implementation status, ' +
        'for Bootstrap Italia or Dev Kit Italia (library param, default bootstrapItalia). ' +
        'Valid values: PRONTO, DA RIVEDERE A11Y, DA RIVEDERE, IN REVIEW, ' +
        'DA COMPLETARE VARIANTI, NON PRESENTE, DA FARE, N/D. ' +
        'uiKitItalia not yet filterable here (Figma-only). ' +
        'Use dsi_list_components for full status overview.',
      inputSchema: {
        status: z.string().describe('Status to filter (e.g. "PRONTO", "DA FARE", "NON PRESENTE")'),
        library: z.enum(['bootstrapItalia', 'devKitItalia']).optional()
          .describe('Which library status to filter on. Defaults to "bootstrapItalia".'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, library }) => {
      status = status.trim()
      const lib = library ?? 'bootstrapItalia'
      const [allStatuses, dsMeta] = await Promise.all([loadAllStatuses(), loadDsMeta()])
      const statusUpper = status.toUpperCase()

      const results = [...allStatuses.values()]
        .filter((s) => s.libraryStatus[lib].toUpperCase() === statusUpper)
        .map((s) => ({
          name: s.name,
          slug: s.slug,
          status: s.libraryStatus[lib],
          docUrl: (lib === 'devKitItalia' ? s.sourceUrls.devKitDoc : s.sourceUrls.bsiDoc) ?? null,
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
                  warnings: [BETA_WARNING],
                  stability: 'beta',
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