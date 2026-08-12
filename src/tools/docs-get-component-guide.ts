import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadStatus } from '../loaders/bsi.js'
import { loadGuidelines, designersUrl } from '../loaders/designers.js'
import { loadDevKitEntry } from '../loaders/devkit.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta, devKitUrlMismatch, resolveDesignersUrl } from './helpers.js'
import { BETA_WARNING, BSI_STATUS_URL, DESIGNERS_COMPONENT_URL, DEVKIT_INDEX_URL } from '../constants.js'

// ─── Tool: docs_get_component_guide ───────────────────────────────────────────

export function registerDocsGetComponentGuide(server: McpServer): void {
  server.registerTool(
    'docs_get_component_guide',
    {
      title: 'Get Component Guide',
      description: 'Returns usage guidelines for a component from Designers Italia website: ' +
        'when to use it (whenToUse, includes recommended alternatives where Designers Italia ' +
        'lists them), how to use it (howToUse), accessibility notes, library status ' +
        '(Bootstrap Italia, Dev Kit Italia) and, when available, the Dev Kit Storybook entry ' +
        '(tags, markup URL). Flags devKitUrlMismatch in warnings when the Dev Kit doc URL in ' +
        'components-status.json diverges from the live Storybook entry.',
      inputSchema: { component: z.string().describe('Component name or slug (e.g. "accordion", "Alert")') },
      annotations: { readOnlyHint: true },
    },
    async ({ component }) => {
      component = component.trim()
      const slug = slugify(component)
      const warnings: string[] = []

      const [guidelinesResult, status, devKitEntry, dsMeta] = await Promise.all([
        loadGuidelines(slug),
        loadStatus(slug),
        loadDevKitEntry(slug),
        loadDsMeta(),
      ])

      const canonicalSlug = status?.slug ?? slug

      if (!guidelinesResult) {
        warnings.push(`Designers Italia component guidelines not found for "${canonicalSlug}"`)
      } else if (guidelinesResult.tabWarning) {
        warnings.push(guidelinesResult.tabWarning)
      }
      if (!status) {
        warnings.push(`Component status not found for "${canonicalSlug}"`)
      }

      const mismatch = devKitUrlMismatch(canonicalSlug, status?.sourceUrls.devKitDoc, devKitEntry?.storybookUrl)
      if (mismatch) warnings.push(mismatch)

      warnings.push('Guidelines content © Designers Italia — CC-BY-SA 4.0. Derivatives inherit ShareAlike requirement. See https://designers.italia.it')

      warnings.push(BETA_WARNING)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: status?.name ?? canonicalSlug,
                slug: canonicalSlug,
                description: guidelinesResult?.guidelines.description ?? null,
                categories: guidelinesResult?.guidelines.categories ?? [],
                status: status
                  ? {
                    libraryStatus: status.libraryStatus,
                    accessibility: status.accessibility,
                    notes: status.notes ?? null,
                    knownIssueUrls: status.knownIssueUrls,
                  }
                  : null,
                guidelines: guidelinesResult
                  ? {
                    whenToUse: guidelinesResult.guidelines.whenToUse,
                    howToUse: guidelinesResult.guidelines.howToUse,
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
                  designersItalia: resolveDesignersUrl(dsMeta, canonicalSlug),
                  bsiDoc: status?.sourceUrls.bsiDoc ?? null,
                  figma: status?.sourceUrls.figma ?? null,
                  devKitDoc: status?.sourceUrls.devKitDoc ?? null,
                },
                meta: buildMeta({
                  dsMeta,
                  sourceUrls: [DESIGNERS_COMPONENT_URL(canonicalSlug), BSI_STATUS_URL, DEVKIT_INDEX_URL],
                  warnings,
                  stability: 'beta',
                  extra: { versions: dsMeta?.versions ?? undefined, designersUrl: resolveDesignersUrl(dsMeta, canonicalSlug) },
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