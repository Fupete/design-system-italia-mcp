import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ZBsiGetComponentMarkupOutput } from '../schemas.js'
import { loadStatus, loadVariants, loadVariantsResolvedSlug } from '../loaders/bsi.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BSI_COMPONENT_URL, BSI_COMPONENT_DEFAULT_SUBFOLDER, subfolderFromDocUrl } from '../constants.js'

// ─── Tool: bsi_get_component_markup ───────────────────────────────────────────
// BSI markup only — Dev Kit story markup lives in devkit_get_component_markup.

export function registerBsiGetComponentMarkup(server: McpServer): void {
  server.registerTool(
    'bsi_get_component_markup',
    {
      title: 'Get Component Markup',
      description: 'Returns the HTML markup for one specific variant of a Bootstrap Italia component. ' +
        'If variant is omitted returns the default (first) variant. ' +
        'Use bsi_list_component_variants to discover available names.',
      inputSchema: {
        component: z.string().describe('Component name or slug (e.g. "accordion", "card")'),
        variant: z.string().optional().describe('Variant name (e.g. "Base", "Tabella base"). Omit for the default (first) variant.'),
      },
      annotations: { readOnlyHint: true },
      outputSchema: ZBsiGetComponentMarkupOutput,
    },
    async ({ component, variant }) => {
      component = component.trim()
      variant = variant?.trim()
      const slug = slugify(component)
      const warnings: string[] = []

      const [status, dsMeta] = await Promise.all([
        loadStatus(slug),
        loadDsMeta(),
      ])
      const canonicalSlug = status?.slug ?? slug

      const bsiResolvedSlug = await loadVariantsResolvedSlug(canonicalSlug)
      const allVariants = await loadVariants(canonicalSlug)

      const sourceUrl = BSI_COMPONENT_URL(
        status?.sourceUrls.bsiDoc
          ? subfolderFromDocUrl(status.sourceUrls.bsiDoc)
          : BSI_COMPONENT_DEFAULT_SUBFOLDER,
        bsiResolvedSlug
      )

      const match = variant
        ? allVariants.find((v) => v.name.trim().toLowerCase() === variant!.toLowerCase())
        : allVariants[0]

      if (!match) {
        warnings.push(
          variant
            ? `Variant "${variant}" not found for "${canonicalSlug}". Available: ${allVariants.map((v) => v.name).join(', ') || 'none'}`
            : `No BSI variants found for "${canonicalSlug}"`
        )
      }

      const output = {
        component: canonicalSlug,
        variant: match?.name ?? variant ?? null,
        result: match ? { name: match.name, html: match.html } : null,
        meta: buildMeta({
          dsMeta,
          sourceUrls: [sourceUrl],
          warnings,
          stability: 'alpha',
        }),
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      }
    }
  )
}