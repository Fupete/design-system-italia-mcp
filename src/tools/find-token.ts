import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { searchTokens } from '../loaders/bsi.js'
import { resolveTokenValues, searchDesignTokens } from '../loaders/tokens.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { ALPHA_WARNING, BSI_CUSTOM_PROPERTIES_URL, DTI_VARIABLES_SCSS_URL } from '../constants.js'

// ─── Tool: find_token ─────────────────────────────────────────────────────────

export function registerFindToken(server: McpServer): void {
  server.registerTool(
    'find_token',
    {
      title: 'Find Token',
      description: 'Search for a Design Tokens Italia or BSI token by substring match on variable name. ' +
        'Searches all BSI components (--bsi-*) and global Design Tokens Italia tokens (--it-*). ' +
        'Examples: \'primary\', \'spacing-m\', \'blue-40\', \'radius\'. ' +
        'Note: only substring on variable names — queries like \'primary color\' return no results.',
      inputSchema: { query: z.string().describe('Search term (e.g. "spacing", "border-radius", "padding")') },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      query = query.trim()
      const warnings: string[] = []
      const dsMeta = await loadDsMeta()

      warnings.push(ALPHA_WARNING)

      // Search per-component BSI tokens
      const bsiResults = await searchTokens(query)

      // Risolve values
      let resolvedBsi = bsiResults
      try {
        resolvedBsi = await resolveTokenValues(bsiResults) as typeof bsiResults
      } catch {
        warnings.push('Design Tokens Italia value resolution not available')
      }

      // Search global --it-* tokens
      let globalResults: Array<{ name: string; value: string }> = []
      try {
        globalResults = await searchDesignTokens(query)
      } catch {
        warnings.push('Global Design Tokens Italia search not available')
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                bsiTokens: {
                  total: resolvedBsi.length,
                  results: resolvedBsi,
                },
                globalTokens: {
                  total: globalResults.length,
                  results: globalResults,
                },
                meta: buildMeta({
                  dsMeta,
                  sourceUrls: [BSI_CUSTOM_PROPERTIES_URL, DTI_VARIABLES_SCSS_URL],
                  warnings,
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