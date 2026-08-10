import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ZDevkitGetComponentMarkupOutput } from '../schemas.js'
import { loadStatus } from '../loaders/bsi.js'
import { loadDevKitEntry, loadStoryVariants } from '../loaders/devkit.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { DEVKIT_STORIES_URL, DEVKIT_INDEX_URL, BETA_WARNING } from '../constants.js'

// ─── Tool: devkit_get_component_markup ────────────────────────────────────────
// Markup extracted from Storybook via CI snapshot (snapshot-devkit.ts).

export function registerDevkitGetComponentMarkup(server: McpServer): void {
  server.registerTool(
    'devkit_get_component_markup',
    {
      title: 'Get Dev Kit Component Markup',
      description: 'Returns the HTML markup for one specific variant of a Dev Kit Italia web component. ' +
        'Markup extracted from Storybook via CI snapshot. ' +
        'If variant is omitted returns the default (first) variant.',
      inputSchema: {
        component: z.string().describe('Component name or slug (e.g. "accordion", "icon")'),
        variant: z.string().optional().describe('Variant name. Omit for the default (first) variant.'),
      },
      annotations: { readOnlyHint: true },
      outputSchema: ZDevkitGetComponentMarkupOutput,
    },
    async ({ component, variant }) => {
      component = component.trim()
      variant = variant?.trim()
      const slug = slugify(component)
      const warnings: string[] = [BETA_WARNING]

      const [status, dsMeta] = await Promise.all([
        loadStatus(slug),
        loadDsMeta(),
      ])
      const canonicalSlug = status?.slug ?? slug

      const devKitEntry = await loadDevKitEntry(canonicalSlug)
      if (!devKitEntry) warnings.push(`"${canonicalSlug}" not found in Dev Kit Italia`)

      const storyVariants = await loadStoryVariants(canonicalSlug)

      const match = variant
        ? storyVariants?.find((v) => v.name.trim().toLowerCase() === variant!.toLowerCase())
        : storyVariants?.[0]

      if (!match) {
        warnings.push(
          variant
            ? `Variant "${variant}" not found for "${canonicalSlug}". Available: ${storyVariants?.map((v) => v.name).join(', ') || 'none'}`
            : `No Dev Kit variants found for "${canonicalSlug}"`
        )
      }

      const output = {
        component: canonicalSlug,
        variant: match?.name ?? variant ?? null,
        result: match ? { name: match.name, html: match.html } : null,
        meta: buildMeta({
          dsMeta,
          sourceUrls: [devKitEntry ? DEVKIT_STORIES_URL(devKitEntry.importPath) : DEVKIT_INDEX_URL],
          warnings,
          stability: 'beta',
        }),
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      }
    }
  )
}