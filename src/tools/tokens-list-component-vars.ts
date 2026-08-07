import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ZTokensListComponentVarsOutput } from '../schemas.js'
import { loadStatus, loadTokens } from '../loaders/bsi.js'
import { resolveTokenValues } from '../loaders/tokens.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BETA_WARNING, BSI_CUSTOM_PROPERTIES_URL, DTI_VARIABLES_SCSS_URL, BSI_ROOT_SCSS_URL } from '../constants.js'

// ─── Tool: tokens_list_component_vars ─────────────────────────────────────────

export function registerTokensListComponentVars(server: McpServer): void {
  server.registerTool(
    'tokens_list_component_vars',
    {
      title: 'List Component Tokens',
      description: 'Lists the CSS custom properties (--bsi-) you can override in your own ' + 
        'CSS to customize a Bootstrap Italia component, each with a semantic description, ' +
        'resolution chain (resolvedVia), and concrete resolved value (e.g. ' + 
        'var(--bsi-spacing-m) → 1.5rem). These --bsi- variables are always safe to override ' +
        'at runtime; the central Design Tokens they resolve through (--it-/$it-, visible in ' +
        'resolvedVia) are not meant to be overridden per-project, override the --bsi- ' +
        'variable itself instead.',
      inputSchema: { component: z.string().describe('Component name or slug (e.g. "accordion", "Alert")') },
      annotations: { readOnlyHint: true },
      outputSchema: ZTokensListComponentVarsOutput,
    },
    async ({ component }) => {
      component = component.trim()
      const slug = slugify(component)
      const warnings: string[] = []

      const [status, dsMeta] = await Promise.all([
        loadStatus(slug),
        loadDsMeta(),
      ])
      const canonicalSlug = status?.slug ?? slug

      const rawTokens = await loadTokens(canonicalSlug)

      if (rawTokens.length === 0) {
        warnings.push(`No CSS tokens found for "${canonicalSlug}"`)
      }

      warnings.push(BETA_WARNING)

      let tokens = rawTokens
      try {
        tokens = await resolveTokenValues(rawTokens)
      } catch {
        warnings.push('Design Tokens Italia value resolution not available')
      }

      tokens = tokens.map(t =>
        t.valueType === 'scss-expression'
          ? { ...t, valueResolvedNote: 'scss-expression tokens cannot be resolved to a concrete value yet — value requires SCSS compilation context' }
          : t
      )

      const byType = {
        tokenReference: tokens.filter((t) => t.valueType === 'token-reference'),
        literal: tokens.filter((t) => t.valueType === 'literal'),
        scssExpression: tokens.filter((t) => t.valueType === 'scss-expression'),
      }

      const output = {
        component: canonicalSlug,
        total: tokens.length,
        tokens,
        summary: {
          tokenReference: byType.tokenReference.length,
          literal: byType.literal.length,
          scssExpression: byType.scssExpression.length,
        },
        meta: buildMeta({
          dsMeta,
          sourceUrls: [BSI_CUSTOM_PROPERTIES_URL, DTI_VARIABLES_SCSS_URL, BSI_ROOT_SCSS_URL],
          warnings,
          stability: 'beta',
          extra: {
            versions: dsMeta?.versions ?? undefined,
            note: 'valueResolved: concrete value resolved via Design Tokens Italia. ' +
              'resolvedVia: intermediate --it-* token in the resolution chain (--bsi-* → --it-* → value). ' +
              'null = resolution not available, value is already literal or another --bsi-* variable.',
          },
        }),
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      }
    }
  )
}