import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listGlobalBridgePairs } from '../loaders/tokens.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { ALPHA_WARNING, BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL } from '../constants.js'

// ─── Tool: tokens_list_globals ─────────────────────────────────────────────────
// Bridge-pair view: only components with a --bsi-* -> --it-* entry in root.scss
// are included. List grows automatically as BSI adds bridge entries.

export function registerTokensListGlobals(server: McpServer): void {
  server.registerTool(
    'tokens_list_globals',
    {
      title: 'List Global Tokens',
      description: 'Lists global design tokens bridged between Bootstrap Italia (--bsi-*) and ' +
        'Design Tokens Italia (--it-*), with resolved concrete values. ' +
        'Only tokens with a bridge entry in root.scss are included.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const warnings: string[] = [ALPHA_WARNING]
      const [pairs, dsMeta] = await Promise.all([
        listGlobalBridgePairs(),
        loadDsMeta(),
      ])

      const output = {
        total: pairs.length,
        tokens: pairs,
        meta: buildMeta({
          dsMeta,
          sourceUrls: [BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL],
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