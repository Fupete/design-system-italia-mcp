import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ZGetComponentOutput } from '../schemas.js'
import { loadStatus, loadVariants, loadVariantsResolvedSlug } from '../loaders/bsi.js'
import { loadDevKitIndex, loadDevKitEntry, loadStoryVariants, loadStoryDescription } from '../loaders/devkit.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BSI_COMPONENT_URL, DEVKIT_INDEX_URL, BSI_COMPONENT_DEFAULT_SUBFOLDER, subfolderFromDocUrl } from '../constants.js'

// ─── Tool: get_component ──────────────────────────────────────────────────────

export function registerGetComponent(server: McpServer): void {
  server.registerTool(
    'get_component',
    {
      title: 'Get Component',
      description: 'Returns HTML markup for all variants of a Bootstrap Italia component ' +
        'and web component it-* props from Dev Kit Italia. ' +
        'Start here for markup and variants. Dev Kit props (it-*) apply to web components only, not BSI HTML.',
      inputSchema: {
        name: z.string().describe('Component name or slug (e.g. "accordion", "Accordion")'),
        maxVariants: z.number().optional().default(3).describe('Maximum number of variants with full markup (default 3). Use get_component_variant to fetch others by name.'),
      },
      annotations: { readOnlyHint: true },
      outputSchema: ZGetComponentOutput,
    },
    async ({ name, maxVariants }) => {
      name = name.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      const [status, devKitIndex, dsMeta, bsiResolvedSlug] = await Promise.all([
        loadStatus(slug),
        loadDevKitIndex(),
        loadDsMeta(),
        loadVariantsResolvedSlug(slug),
      ])

      // Resolve to canonical slug (e.g. "fisarmonica" → "accordion")
      const canonicalSlug = status?.slug ?? slug

      const allVariants = await loadVariants(canonicalSlug)

      const storyDescription = await loadStoryDescription(canonicalSlug)

      if (allVariants.length === 0) {
        warnings.push(`No BSI variants found for "${canonicalSlug}"`)
      }

      const devKitEntry = await loadDevKitEntry(canonicalSlug)
      if (!devKitEntry) {
        warnings.push(`Component not found in Dev Kit Italia for "${canonicalSlug}"`)
      }

      const storyVariants = await loadStoryVariants(canonicalSlug)

      if (storyVariants?.some(v => /-\d+$/.test(v.name))) {
        warnings.push('Some Dev Kit variants have numeric suffixes (-2, -3): multiple examples of the same variant.')
      }

      const output = {
        name: status?.name ?? canonicalSlug,
        slug: canonicalSlug,
        variantsCount: allVariants.length,
        variantsAvailable: allVariants.map(v => v.name),
        variants: allVariants.slice(0, maxVariants),
        devKit: devKitEntry
          ? {
            slug: devKitEntry.slug,
            tags: devKitEntry.tags,
            storybookUrl: devKitEntry.storybookUrl,
            pattern: devKitEntry.pattern,
            componentType: devKitEntry.componentType,
            description: storyDescription,
            storyVariants: storyVariants
              ? {
                count: storyVariants.length,
                available: storyVariants.map(v => v.name),
                variants: storyVariants.slice(0, maxVariants),
              }
              : null,
          }
          : null,
        meta: buildMeta({
          dsMeta,
          sourceUrls: [
            BSI_COMPONENT_URL(
              status?.sourceUrls.bsiDoc
                ? subfolderFromDocUrl(status.sourceUrls.bsiDoc)
                : BSI_COMPONENT_DEFAULT_SUBFOLDER,
              bsiResolvedSlug
            ),
            DEVKIT_INDEX_URL,
          ],
          warnings,
          stability: 'alpha',
          extra: { versions: dsMeta?.versions ?? undefined },
        }),
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      }
    }
  )
}