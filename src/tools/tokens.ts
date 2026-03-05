import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ZGetComponentTokensOutput } from '../schemas.js'
import { loadTokens, searchTokens } from '../loaders/bsi.js'
import { resolveTokenValues, searchDesignTokens, debugTokenResolution } from '../loaders/tokens.js'
import { slugify } from '../slugify.js'
import { ALPHA_WARNING, BSI_CUSTOM_PROPERTIES_URL, DTI_VARIABLES_SCSS_URL, BSI_ROOT_SCSS_URL } from '../constants.js'

function formatTimestamp(): string {
  return new Date().toISOString()
}

// ─── Tool: get_component_tokens ───────────────────────────────────────────────

export function registerGetComponentTokens(server: McpServer): void {
  server.registerTool(
    'get_component_tokens',
    {
      title: 'Get Component Tokens',
      description: 'Returns customizable CSS --bsi-* variables for a component, ' +
        'with semantic description and resolved value (e.g. var(--bsi-spacing-m) → 1.5rem). ' +
        'Useful for designers who want to know the concrete token values.',
      inputSchema: { name: z.string().describe('Component name or slug (e.g. "accordion", "Alert")') },
      annotations: { readOnlyHint: true },
      outputSchema: ZGetComponentTokensOutput,
    },
    async ({ name }) => {
      name = name.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      // Load BSI tokens
      const rawTokens = await loadTokens(slug)

      if (rawTokens.length === 0) {
        warnings.push(`No CSS tokens found for "${slug}"`)
      }

      warnings.push(ALPHA_WARNING)

      // Resolve values via Design Tokens Italia
      let tokens = rawTokens
      try {
        tokens = await resolveTokenValues(rawTokens)
        // Debug: uncomment to diagnose token resolution (see also debugTokenResolution in loaders/tokens.ts)
        // const resolved = tokens.filter(t => t.valueResolved !== null).length
        // const refs = tokens.filter(t => t.valueType === 'token-reference').length
        // warnings.push(`[debug] ${refs} token-references, ${resolved} resolved`)
        // const debugLogs = await debugTokenResolution()
        // warnings.push(...debugLogs.map(l => `[debug] ${l}`))
      } catch {
        warnings.push('Design Tokens Italia value resolution not available')
      }

      // // Group by type for readability
      const byType = {
        tokenReference: tokens.filter((t) => t.valueType === 'token-reference'),
        literal: tokens.filter((t) => t.valueType === 'literal'),
        scssExpression: tokens.filter((t) => t.valueType === 'scss-expression'),
      }

      const output = {
        component: slug,
        total: tokens.length,
        tokens,
        summary: {
          tokenReference: byType.tokenReference.length,
          literal: byType.literal.length,
          scssExpression: byType.scssExpression.length,
        },
        meta: {
          fetchedAt: formatTimestamp(),
          sourceUrls: [BSI_CUSTOM_PROPERTIES_URL, DTI_VARIABLES_SCSS_URL, BSI_ROOT_SCSS_URL],
          note: 'valueResolved: concrete value resolved via Design Tokens Italia. ' +
            'null = resolution not available or value is already literal.',
          warnings,
          stability: 'alpha' as const,
        },
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      }
    }
  )
}

// ─── Tool: find_token ─────────────────────────────────────────────────────────

export function registerFindToken(server: McpServer): void {
  server.registerTool(
    'find_token',
    {
      title: 'Find Token',
      description: 'Search a CSS token by variable name or semantic description. ' +
        'Searches all BSI components (--bsi-*) and global Design Tokens Italia tokens (--it-*). ' +
        'Useful to find which variable controls a given visual aspect.',
      inputSchema: { query: z.string().describe('Search term (e.g. "spacing", "border-radius", "padding")') },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      query = query.trim()
      const warnings: string[] = []

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
                meta: {
                  fetchedAt: formatTimestamp(),
                  sourceUrls: [BSI_CUSTOM_PROPERTIES_URL, DTI_VARIABLES_SCSS_URL],
                  warnings,
                  stability: 'alpha' as const,
                },
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