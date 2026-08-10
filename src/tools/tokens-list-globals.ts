import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { listGlobalBridgePairs } from '../loaders/tokens.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BETA_WARNING, BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL } from '../constants.js'

// ─── Tool: tokens_list_globals ─────────────────────────────────────────────────
// Bridge-pair view: only components with a --bsi-* -> --it-* entry in root.scss
// are included. List grows automatically as BSI adds bridge entries.

export function registerTokensListGlobals(server: McpServer): void {
  server.registerTool(
    'tokens_list_globals',
    {
      title: 'List Global Tokens',
      description: 'Lists the global design tokens of the Design System that Bootstrap Italia actually uses. ' +
        'Each entry pairs the central Design Token (--it-*/$it-*, not overridable per-project) with the ' +
        'corresponding global --bsi-* CSS custom property (project-overridable), plus its resolved value. ' +
        'Without arguments returns all global tokens; pass match to filter (e.g. "spacing", "color"). ' +
        'Only tokens bridged into BSI are listed. For per-component variables use tokens_list_component_vars.',
      inputSchema: {
        match: z.string().optional().describe('Substring filter on token/variable name (e.g. "spacing", "blue"). Not a semantic category — matches literal text in the name only. Omit to list all.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ match }) => {
      const warnings: string[] = [BETA_WARNING]
      const [pairs, dsMeta] = await Promise.all([
        listGlobalBridgePairs(),
        loadDsMeta(),
      ])

      const q = match?.trim().toLowerCase()
      const filtered = q
        ? pairs.filter((p) => p.it.toLowerCase().includes(q) || p.bsiGlobal.toLowerCase().includes(q))
        : pairs

      if (q && filtered.length === 0) {
        warnings.push(`No global tokens found matching "${match}"`)
      }

      const output = {
        match: match ?? null,
        total: filtered.length,
        tokens: filtered,
        meta: buildMeta({
          dsMeta,
          sourceUrls: [BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL],
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