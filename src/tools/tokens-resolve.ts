import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveToken } from '../loaders/tokens.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BETA_WARNING, BSI_CUSTOM_PROPERTIES_URL, BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL, EXAMPLE_CHAIN } from '../constants.js'
import { ZTokensResolveOutput } from '../schemas.js'

// ─── Tool: tokens_resolve ──────────────────────────────────────────────────────
// Accepts any point in the resolution chain: --bsi-*, --it-*, or the Sass
// source form $it-* (as written in design-tokens-italia, before compilation
// to a CSS custom property) — normalized internally before lookup.

export function registerTokensResolve(server: McpServer): void {
  server.registerTool(
    'tokens_resolve',
    {
      title: 'Resolve Token',
      description: 'Resolves any --bsi-, --it-, or $it- variable to its concrete value, ' +
        `following the full chain to a literal (e.g. ${EXAMPLE_CHAIN}). Each hop in resolvedVia carries role ` +
        'and overridable: --bsi- hops (role bsi-component/bsi-global) are safe to override ' +
        'in project CSS at runtime; $it-/--it- hops (role dti) are central Design Tokens ' +
        'defined upstream, do not suggest overriding them directly; override the --bsi-* ' +
        'variable that consumes them instead.',
      inputSchema: { variable: z.string().describe('Token name in any form: --bsi-*, --it-*, or $it-*') },
      annotations: { readOnlyHint: true },
      outputSchema: ZTokensResolveOutput,
    },
    async ({ variable }) => {
      variable = variable.trim()
      const warnings: string[] = [BETA_WARNING]
      const dsMeta = await loadDsMeta()

      const result = await resolveToken(variable)
      if (result.value === null && !result.ambiguous && !result.note) {
        warnings.push(`Could not resolve "${variable}" — not found in the --bsi-*/--it-* resolution chain`)
      } else if (result.ambiguous) {
        warnings.push(result.note ?? `"${variable}" has different values across occurrences.`)
      } else if (result.note) {
        warnings.push(result.note)
      }

      const output = {
        input: variable,
        normalizedName: result.name,
        value: result.value,
        resolvedVia: result.resolvedVia,
        ...(result.ambiguous ? { ambiguousValues: result.ambiguous } : {}),
        ...(result.composedOf ? { composedOf: result.composedOf } : {}),
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
        structuredContent: output
      }
    }
  )
}