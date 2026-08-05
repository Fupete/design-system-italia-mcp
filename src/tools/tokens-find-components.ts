import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { findComponentsByToken } from '../loaders/tokens.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { ALPHA_WARNING, BSI_CUSTOM_PROPERTIES_URL, BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL } from '../constants.js'

// ─── Tool: tokens_find_components ─────────────────────────────────────────────

export function registerTokensFindComponents(server: McpServer): void {
  server.registerTool(
    'tokens_find_components',
    {
      title: 'Find Components By Token',
      description: 'Finds all Bootstrap Italia components whose CSS custom properties resolve ' +
        'through a given token, directly or via the --bsi-* → --it-* chain. ' +
        'Accepts --bsi-*, --it-*, or the Sass source form $it-*. ' +
        'Example: "--it-spacing-m" → every --bsi-*-spacing-m across all components.',
      inputSchema: { name: z.string().describe('Token name in any form: --bsi-*, --it-*, or $it-*') },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      name = name.trim()
      const warnings: string[] = [ALPHA_WARNING]
      const [results, dsMeta] = await Promise.all([
        findComponentsByToken(name),
        loadDsMeta(),
      ])

      if (results.length === 0) {
        warnings.push(`No components found referencing "${name}"`)
      }

      const output = {
        query: name,
        total: results.length,
        results,
        meta: buildMeta({
          dsMeta,
          sourceUrls: [BSI_CUSTOM_PROPERTIES_URL, BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL],
          warnings,
          stability: 'alpha',
          extra: { versions: dsMeta?.versions ?? undefined },
        }),
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      }
    }
  )
}