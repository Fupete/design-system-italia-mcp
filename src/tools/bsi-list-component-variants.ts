import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadStatus, loadVariants, loadVariantsResolvedSlug } from '../loaders/bsi.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BSI_COMPONENT_URL, BSI_COMPONENT_DEFAULT_SUBFOLDER, subfolderFromDocUrl, BETA_WARNING } from '../constants.js'

// ─── Tool: bsi_list_component_variants ────────────────────────────────────────
// Names only, no markup — see bsi_get_component_markup for markup.
// Dev Kit variant names live in devkit_list_component_variants: bsi_/devkit_
// mirror each other only for distinct artifacts (markup, variants, props);
// list/search stay unified under the dsi_ namespace instead.

export function registerBsiListComponentVariants(server: McpServer): void {
  server.registerTool(
    'bsi_list_component_variants',
    {
      title: 'List Component Variants',
      description: 'Lists all available variant names for a Bootstrap Italia component. ' +
        'Returns names only — no markup. Use bsi_get_component_markup to fetch a specific variant.',
      inputSchema: {
        component: z.string().describe('Component name or slug (e.g. "accordion", "Accordion")'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ component }) => {
      component = component.trim()
      const slug = slugify(component)
      const warnings: string[] = [BETA_WARNING]

      const [status, dsMeta, bsiResolvedSlug] = await Promise.all([
        loadStatus(slug),
        loadDsMeta(),
        loadVariantsResolvedSlug(slug),
      ])

      // Resolve to canonical slug (e.g. "fisarmonica" → "accordion")
      const canonicalSlug = status?.slug ?? slug

      const allVariants = await loadVariants(canonicalSlug)
      if (allVariants.length === 0) {
        warnings.push(`No BSI variants found for "${canonicalSlug}"`)
      }

      const output = {
        component: canonicalSlug,
        total: allVariants.length,
        variantsAvailable: allVariants.map((v) => v.name),
        meta: buildMeta({
          dsMeta,
          sourceUrls: [
            BSI_COMPONENT_URL(
              status?.sourceUrls.bsiDoc
                ? subfolderFromDocUrl(status.sourceUrls.bsiDoc)
                : BSI_COMPONENT_DEFAULT_SUBFOLDER,
              bsiResolvedSlug
            ),
          ],
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