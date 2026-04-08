import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadAllStatuses, loadStatus } from '../loaders/bsi.js'
import { loadGuidelines, designersUrl } from '../loaders/designers.js'
import { loadDevKitEntry } from '../loaders/devkit.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { ALPHA_WARNING, BSI_STATUS_URL, DESIGNERS_COMPONENT_URL, DEVKIT_INDEX_URL } from '../constants.js'

// ─── Tool: get_component_guidelines ──────────────────────────────────────────

export function registerGetComponentGuidelines(server: McpServer): void {
  server.registerTool(
    'get_component_guidelines',
    {
      title: 'Get Component Guidelines',
      description: 'Returns usage guidelines for a component from Designers Italia website: ' +
        'when to use it, how to use it, recommended alternatives, accessibility notes ' +
        'and library status (Bootstrap Italia, UI Kit Italia, ...).',
      inputSchema: { name: z.string().describe('Component name or slug (e.g. "accordion", "Alert")') },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      name = name.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      const [guidelines, status, devKitEntry, dsMeta] = await Promise.all([
        loadGuidelines(slug),
        loadStatus(slug),
        loadDevKitEntry(slug),
        loadDsMeta(),
      ])

      const canonicalSlug = status?.slug ?? slug

      if (!guidelines) {
        warnings.push(`Designers Italia component guidelines not found for "${canonicalSlug}"`)
      }
      if (!status) {
        warnings.push(`Component status not found for "${canonicalSlug}"`)
      }

      warnings.push('Guidelines content © Designers Italia — CC-BY-SA 4.0. Derivatives inherit ShareAlike requirement. See https://designers.italia.it')

      warnings.push(ALPHA_WARNING)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: status?.name ?? canonicalSlug,
                slug: canonicalSlug,
                description: guidelines?.description ?? null,
                categories: guidelines?.categories ?? [],
                status: status
                  ? {
                    libraryStatus: status.libraryStatus,
                    accessibility: status.accessibility,
                    notes: status.notes ?? null,
                    knownIssueUrls: status.knownIssueUrls,
                  }
                  : null,
                guidelines: guidelines
                  ? {
                    whenToUse: guidelines.whenToUse,
                    howToUse: guidelines.howToUse,
                  }
                  : null,
                devKit: devKitEntry
                  ? {
                    slug: devKitEntry.slug,
                    tags: devKitEntry.tags,
                    storybookUrl: devKitEntry.storybookUrl,
                  }
                  : null,
                sourceUrls: {
                  designersItalia: dsMeta.components.get(canonicalSlug)?.absoluteUrl ?? designersUrl(canonicalSlug),
                  bsiDoc: status?.sourceUrls.bsiDoc ?? null,
                  figma: status?.sourceUrls.figma ?? null,
                },
                meta: buildMeta({
                  dsMeta,
                  sourceUrls: [DESIGNERS_COMPONENT_URL(canonicalSlug), BSI_STATUS_URL, DEVKIT_INDEX_URL],
                  warnings,
                  stability: 'alpha',
                  extra: { versions: dsMeta?.versions ?? undefined },
                }),
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )
}