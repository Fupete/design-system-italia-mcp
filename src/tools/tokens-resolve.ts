import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveToken } from '../loaders/tokens.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { ALPHA_WARNING, BSI_CUSTOM_PROPERTIES_URL, BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL } from '../constants.js'

// ─── Tool: tokens_resolve ──────────────────────────────────────────────────────
// Accepts any point in the resolution chain: --bsi-*, --it-*, or the Sass
// source form $it-* (as written in design-tokens-italia, before compilation
// to a CSS custom property) — normalized internally before lookup.

export function registerTokensResolve(server: McpServer): void {
  server.registerTool(
    'tokens_resolve',
    {
      title: 'Resolve Token',
      description: 'Resolves a CSS custom property or design token to its concrete value, ' +
        'following the full chain (--bsi-* → --it-* → value). ' +
        'Accepts --bsi-*, --it-*, or the Sass source form $it-*. ' +
        'Examples: "--bsi-accordion-padding", "--it-spacing-m", "$it-spacing-m".',
      inputSchema: { name: z.string().describe('Token name in any form: --bsi-*, --it-*, or $it-*') },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      name = name.trim()
      const warnings: string[] = [ALPHA_WARNING]
      const dsMeta = await loadDsMeta()

      const result = await resolveToken(name)
      if (result.value === null) {
        warnings.push(`Could not resolve "${name}" — not found in the --bsi-*/--it-* resolution chain`)
      }

      const output = {
        input: name,
        resolved: result.name,
        value: result.value,
        resolvedVia: result.resolvedVia,
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