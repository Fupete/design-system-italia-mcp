import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ZGetComponentOutput, ZGetComponentVariantOutput } from '../schemas.js'
import { loadAllStatuses, loadStatus, loadVariants, loadVariantsResolvedSlug } from '../loaders/bsi.js'
import { loadDevKitIndex, loadDevKitEntry, loadStoryVariants, loadStoryDescription } from '../loaders/devkit.js'
import { slugify, slugsToTry } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BSI_STATUS_URL, BSI_COMPONENT_URL, DEVKIT_INDEX_URL, BSI_DOC_BASE, BSI_COMPONENT_DEFAULT_SUBFOLDER, subfolderFromDocUrl } from '../constants.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bsiDocUrl(slug: string): string {
  return `${BSI_DOC_BASE}/${slug}/`
}

// ─── Tool: list_components ────────────────────────────────────────────────────

export function registerListComponents(server: McpServer): void {
  server.registerTool(
    'list_components',
    {
      title: 'List Components',
      description: 'Lists all Design System .italia components with library status ' +
        '(Bootstrap Italia, UI Kit, ...) and accessibility status. ' +
        'Start here for a broad overview before drilling into specific components.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const [statuses, devKitIndex, dsMeta] = await Promise.all([
        loadAllStatuses(),
        loadDevKitIndex(),
        loadDsMeta(),
      ])

      const components = [...statuses.values()].map((s) => {
        const devKitSlug = slugsToTry(s.slug).find(a => devKitIndex.has(a)) ?? null
        return {
          name: s.name,
          slug: s.slug,
          status: {
            bootstrapItalia: s.libraryStatus.bootstrapItalia,
            uiKitItalia: s.libraryStatus.uiKitItalia,
          },
          accessibility: {
            checkCompleted: s.accessibility.checkCompleted,
          },
          devKit: devKitSlug
            ? {
              slug: devKitIndex.get(devKitSlug)!.slug,
              tags: devKitIndex.get(devKitSlug)!.tags,
              storybookUrl: devKitIndex.get(devKitSlug)!.storybookUrl,
              pattern: devKitIndex.get(devKitSlug)!.pattern,
              componentType: devKitIndex.get(devKitSlug)!.componentType,
            }
            : null,
          bsiDocUrl: s.sourceUrls.bsiDoc ?? bsiDocUrl(s.slug),
        }
      })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total: components.length,
                components,
                meta: buildMeta({
                  dsMeta,
                  sourceUrls: [BSI_STATUS_URL, DEVKIT_INDEX_URL],
                  warnings: [],
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

// ─── Tool: search_components ──────────────────────────────────────────────────

export function registerSearchComponents(server: McpServer): void {
  server.registerTool(
    'search_components',
    {
      title: 'Search Components',
      description: 'Search components by name or feature. ' +
        'Component names are generally in English (e.g. "modal" not "modale", "button" not "bottone"), with support for some Italian aliases. ' +
        'Searches name, slug and Dev Kit tags (e.g. "a11y-ok", "alpha", "web-component").',
      inputSchema: { query: z.string().describe('Search text (e.g. "button", "alpha", "accordion")') },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      query = query.trim()
      const q = query.toLowerCase().trim()
      const [statuses, devKitIndex, dsMeta] = await Promise.all([
        loadAllStatuses(),
        loadDevKitIndex(),
        loadDsMeta(),
      ])

      const results = [...statuses.values()]
        .filter((s) => {
          const devKitSlug = slugsToTry(s.slug).find(a => devKitIndex.has(a)) ?? null
          const devKit = devKitSlug ? devKitIndex.get(devKitSlug) : null
          const allSlugs = slugsToTry(s.slug)
          return (
            allSlugs.some(a => a.includes(q)) ||
            s.name.toLowerCase().includes(q) ||
            devKit?.tags.some((t) => t.includes(q))
          )
        })
        .map((s) => {
          const devKitSlug = slugsToTry(s.slug).find(a => devKitIndex.has(a)) ?? null
          const devKit = devKitSlug ? devKitIndex.get(devKitSlug) : null
          return {
            name: s.name,
            slug: s.slug,
            status: s.libraryStatus.bootstrapItalia,
            tags: devKit?.tags ?? [],
            bsiDocUrl: s.sourceUrls.bsiDoc ?? bsiDocUrl(s.slug),
            devKit: devKit
              ? {
                slug: devKit.slug,
                tags: devKit.tags,
                storybookUrl: devKit.storybookUrl,
                pattern: devKit.pattern,
                componentType: devKit.componentType,
              }
              : null,

          }
        })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                total: results.length,
                results,
                meta: buildMeta({
                  dsMeta,
                  sourceUrls: [BSI_STATUS_URL, DEVKIT_INDEX_URL],
                  warnings: [],
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