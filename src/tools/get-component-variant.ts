import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ZGetComponentVariantOutput } from '../schemas.js'
import { loadStatus, loadVariants, loadVariantsResolvedSlug } from '../loaders/bsi.js'
import { loadStoryVariants } from '../loaders/devkit.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BSI_COMPONENT_URL, BSI_COMPONENT_DEFAULT_SUBFOLDER, subfolderFromDocUrl } from '../constants.js'

// ─── Tool: get_component_variant ─────────────────────────────────────────────

export function registerGetComponentVariant(server: McpServer): void {
  server.registerTool(
    'get_component_variant',
    {
      title: 'Get Component Variant',
      description: 'Returns the full HTML markup of a specific variant by name. ' +
        'Use variantsAvailable from get_component to find variant names. ' +
        'Searches BSI markup variants and Dev Kit story variants transparently. ' +
        'Dev Kit variant names with numeric suffixes (-2, -3) are multiple examples of the same variant.',
      inputSchema: {
        name: z.string().describe('Component name or slug (e.g. "accordion", "card")'),
        variantName: z.string().describe('Variant name (e.g. "Base", "Tabella base")'),
      },
      annotations: { readOnlyHint: true },
      outputSchema: ZGetComponentVariantOutput,
    },
    async ({ name, variantName }) => {
      name = name.trim()
      variantName = variantName.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      const [status, dsMeta] = await Promise.all([
        loadStatus(slug),
        loadDsMeta(),
      ])

      // Resolve to canonical slug (e.g. "fisarmonica" → "accordion")
      const canonicalSlug = status?.slug ?? slug

      const bsiResolvedSlug = await loadVariantsResolvedSlug(canonicalSlug)

      const allVariants = await loadVariants(canonicalSlug)
      const storyVariants = await loadStoryVariants(canonicalSlug)

      const results: Array<{ name: string; html: string; source: string }> = []

      // Search BSI variants
      const bsiMatch = allVariants.find(
        v => v.name.trim().toLowerCase() === variantName.trim().toLowerCase()
      )
      if (bsiMatch) {
        results.push({ ...bsiMatch, source: 'bsi' })
      }

      // Search story variants
      if (storyVariants) {
        const storyMatch = storyVariants.find(
          v => v.name.trim().toLowerCase() === variantName.trim().toLowerCase()
        )
        if (storyMatch) {
          results.push({ ...storyMatch, source: 'devkit-story' })
        }
      }

      if (results.length > 0) {
        const output = {
          component: canonicalSlug,
          variantName,
          results,
          meta: buildMeta({
            dsMeta,
            sourceUrls: [BSI_COMPONENT_URL(
              status?.sourceUrls.bsiDoc
                ? subfolderFromDocUrl(status.sourceUrls.bsiDoc)
                : BSI_COMPONENT_DEFAULT_SUBFOLDER,
              bsiResolvedSlug
            )],
            warnings,
            stability: 'alpha',
          }),
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        }
      }

      // Not found
      const allNames = [
        ...allVariants.map(v => v.name),
        ...(storyVariants?.map(v => v.name) ?? []),
      ]
      warnings.push(
        `Variant "${variantName}" not found for "${canonicalSlug}". ` +
        `Available variants: ${allNames.join(', ') || 'none'}`
      )

      const output = {
        component: canonicalSlug,
        variantName,
        results: [],
        meta: buildMeta({
          dsMeta,
          sourceUrls: [BSI_COMPONENT_URL(
            status?.sourceUrls.bsiDoc
              ? subfolderFromDocUrl(status.sourceUrls.bsiDoc)
              : BSI_COMPONENT_DEFAULT_SUBFOLDER,
            canonicalSlug
          )],
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