import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { buildComponentUnion, buildMeta } from './helpers.js'
import { BETA_WARNING, BSI_STATUS_URL, DEVKIT_INDEX_URL } from '../constants.js'

// ─── Tool: dsi_list_components ────────────────────────────────────────────────
// True union of components_status.json (BSI) ∪ index.json (Dev Kit).
// One row per component, bsi:{}|null + devkit:{}|null — see buildComponentUnion
// in helpers.ts for the shared union logic (also used by dsi_search_components).

export function registerDsiListComponents(server: McpServer): void {
  server.registerTool(
    'dsi_list_components',
    {
      title: 'List Components',
      description: 'Lists all Design System .italia components as a single unified inventory: ' +
        'one row per component with bsi:{status, accessibility} (null if not in Bootstrap Italia) ' +
        'and devkit:{tags, storybookUrl, componentType} (null if not in Dev Kit). ' +
        'A component is one entity with two possible implementations — filter by which field is null ' +
        'to get BSI-only or DevKit-only. Call before fetching markup, tokens or props.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { rows, dsMeta } = await buildComponentUnion()

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total: rows.length,
                components: rows,
                meta: buildMeta({
                  dsMeta,
                  sourceUrls: [BSI_STATUS_URL, DEVKIT_INDEX_URL],
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