import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadStatus } from '../loaders/bsi.js'
import { loadDevKitEntry, loadDevKitComponent } from '../loaders/devkit.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta, resolveDesignersUrl } from './helpers.js'
import { BETA_WARNING, DEVKIT_INDEX_URL } from '../constants.js'
import { ZDevkitListComponentPropsOutput } from '../schemas.js'

// ─── Tool: devkit_list_component_props ────────────────────────────────────────
// Lists the it-* HTML attributes (props) of a Dev Kit Italia web component.

export function registerDevkitListComponentProps(server: McpServer): void {
  server.registerTool(
    'devkit_list_component_props',
    {
      title: 'List Dev Kit Component Props',
      description: 'Lists all HTML attributes (props) for a Dev Kit Italia web component (it-*): ' +
        'name, type, description, default value, accepted options. ' +
        'Includes subcomponent props (e.g. it-accordion-item).',
      inputSchema: {
        component: z.string().describe('Component name or slug (e.g. "accordion", "icon")'),
      },
      annotations: { readOnlyHint: true },
      outputSchema: ZDevkitListComponentPropsOutput,
    },
    async ({ component }) => {
      component = component.trim()
      const slug = slugify(component)
      const warnings: string[] = [BETA_WARNING]

      const [status, dsMeta] = await Promise.all([
        loadStatus(slug),
        loadDsMeta(),
      ])
      const canonicalSlug = status?.slug ?? slug

      const devKitEntry = await loadDevKitEntry(canonicalSlug)
      if (!devKitEntry) {
        warnings.push(`"${canonicalSlug}" not found in Dev Kit Italia`)
      } else if (devKitEntry.pattern === 'bundle') {
        warnings.push(`"${canonicalSlug}" is an HTML/CSS-only Dev Kit pattern (bundle), no configurable props`)
      }

      const devKitComponent = await loadDevKitComponent(canonicalSlug)
      if (devKitEntry?.pattern === 'dedicated' && !devKitComponent) {
        warnings.push(`Props not found for "${canonicalSlug}"`)
      }

      const output = {
        component: canonicalSlug,
        tagName: devKitComponent?.tagName ?? null,
        props: devKitComponent?.props ?? [],
        subcomponents: devKitComponent?.subcomponents ?? [],
        meta: buildMeta({
          dsMeta,
          // storybookUrl, not the internal CI snapshot URL — this is what a
          // person can actually open to see the same props documented.
          sourceUrls: [devKitEntry?.storybookUrl ?? DEVKIT_INDEX_URL],
          warnings,
          stability: 'beta',
          extra: { designersUrl: resolveDesignersUrl(dsMeta, canonicalSlug) },
        }),
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      }
    }
  )
}