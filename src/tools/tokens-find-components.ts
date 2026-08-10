import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { findComponentsByToken } from '../loaders/tokens.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BETA_WARNING, BSI_CUSTOM_PROPERTIES_URL, BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL } from '../constants.js'

// ─── Tool: tokens_find_components ─────────────────────────────────────────────

export function registerTokensFindComponents(server: McpServer): void {
  server.registerTool(
    'tokens_find_components',
    {
      title: 'Find Components By Token',
      description: 'Returns the Bootstrap Italia components impacted by a given design variable, ' +
        'including indirect impact via the resolution chain. Accepts --bsi-* (direct usage) or ' +
        '--it-*/$it-* (impact traced through the chain). Useful for theming: identifies what ' +
        'changes if you override a variable. Note: component reflects BSI\'s own internal ' +
        'grouping keys in custom_properties.json (e.g. "navbar", "tab"), not always the same ' +
        'as the canonical component name from dsi_list_components — some BSI groupings aren\'t ' +
        'tracked as standalone components.',
      inputSchema: { variable: z.string().describe('Token name in any form: --bsi-*, --it-*, or $it-*') },
      annotations: { readOnlyHint: true },
    },
    async ({ variable }) => {
      variable = variable.trim()
      const warnings: string[] = [BETA_WARNING]
      const [results, dsMeta] = await Promise.all([
        findComponentsByToken(variable),
        loadDsMeta(),
      ])

      if (results.length === 0) {
        warnings.push(`No components found referencing "${variable}"`)
      }

      const output = {
        query: variable,
        total: results.length,
        results,
        meta: buildMeta({
          dsMeta,
          sourceUrls: [BSI_CUSTOM_PROPERTIES_URL, BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL],
          warnings,
          stability: 'beta',
          extra: { versions: dsMeta?.versions ?? undefined },
        }),
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      }
    }
  )
}