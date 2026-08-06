import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadStatus } from '../loaders/bsi.js'
import { loadDevKitEntry, loadStoryVariants } from '../loaders/devkit.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { DEVKIT_STORIES_URL, DEVKIT_INDEX_URL } from '../constants.js'

// ─── Tool: devkit_list_component_variants ─────────────────────────────────────
// Names only, no markup — see devkit_get_component_markup for markup.

export function registerDevkitListComponentVariants(server: McpServer): void {
  server.registerTool(
    'devkit_list_component_variants',
    {
      title: 'List Dev Kit Component Variants',
      description: 'Lists all available variant names for a Dev Kit Italia web component. ' +
        'Returns names only. Use devkit_get_component_markup to fetch a specific variant.',
      inputSchema: {
        component: z.string().describe('Component name or slug (e.g. "accordion", "icon")'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ component }) => {
      component = component.trim()
      const slug = slugify(component)
      const warnings: string[] = []

      // loadStatus resolves aliases via BSI status; falls back to raw slug for
      // Dev Kit-only components (e.g. "icon") that have no BSI status entry.
      const [status, dsMeta] = await Promise.all([
        loadStatus(slug),
        loadDsMeta(),
      ])
      const canonicalSlug = status?.slug ?? slug

      const devKitEntry = await loadDevKitEntry(canonicalSlug)
      if (!devKitEntry) warnings.push(`"${canonicalSlug}" not found in Dev Kit Italia`)

      const storyVariants = await loadStoryVariants(canonicalSlug)
      const names = storyVariants?.map((v) => v.name) ?? []

      if (storyVariants?.some((v) => /-\d+$/.test(v.name))) {
        warnings.push('Some variant names have numeric suffixes (-2, -3): multiple examples of the same variant.')
      }

      const output = {
        component: canonicalSlug,
        total: names.length,
        variantsAvailable: names,
        meta: buildMeta({
          dsMeta,
          sourceUrls: [devKitEntry ? DEVKIT_STORIES_URL(devKitEntry.importPath) : DEVKIT_INDEX_URL],
          warnings,
          stability: 'beta',
        }),
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      }
    }
  )
}