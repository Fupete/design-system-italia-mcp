import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { searchTokens } from '../loaders/bsi.js'
import { resolveTokenValues, searchDesignTokens } from '../loaders/tokens.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BETA_WARNING, BSI_CUSTOM_PROPERTIES_URL, DTI_VARIABLES_SCSS_URL } from '../constants.js'

// ─── Tool: tokens_search ───────────────────────────────────────────────────────

export function registerTokensSearch(server: McpServer): void {
  server.registerTool(
    'tokens_search',
    {
      title: 'Search Tokens',
      description: 'Search for a Design Tokens Italia or BSI token by substring match on variable name. ' +
        'Searches all BSI CSS custom properties (--bsi-*) and global Design Tokens Italia tokens (--it-*). ' +
        'Examples: \'primary\', \'spacing-m\', \'blue-40\', \'radius\'. ' +
        'Note: only substring on variable names, queries like \'primary color\' return no results.',
      inputSchema: { query: z.string().describe('Search term (e.g. "spacing", "border-radius", "padding")') },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      query = query.trim()
      const warnings: string[] = [BETA_WARNING]
      const dsMeta = await loadDsMeta()

      const bsiResults = await searchTokens(query)

      let resolvedBsi = bsiResults
      try {
        resolvedBsi = await resolveTokenValues(bsiResults) as typeof bsiResults
      } catch {
        warnings.push('Design Tokens Italia value resolution not available')
      }

      let globalResults: Array<{ name: string; value: string }> = []
      try {
        globalResults = await searchDesignTokens(query)
      } catch {
        warnings.push('Global Design Tokens Italia search not available')
      }

      const output = {
        query,
        bsiTokens: { total: resolvedBsi.length, results: resolvedBsi },
        globalTokens: { total: globalResults.length, results: globalResults },
        meta: buildMeta({
          dsMeta,
          sourceUrls: [BSI_CUSTOM_PROPERTIES_URL, DTI_VARIABLES_SCSS_URL],
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