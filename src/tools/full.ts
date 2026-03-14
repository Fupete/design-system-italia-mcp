import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ZGetComponentFullOutput } from '../schemas.js'
import { formatTimestamp } from '../utils.js'
import { loadStatus, loadVariants, loadTokens } from '../loaders/bsi.js'
import { loadGuidelines } from '../loaders/designers.js'
import { resolveTokenValues } from '../loaders/tokens.js'
import { loadDevKitEntry, loadDevKitComponent, loadStoryVariants } from '../loaders/devkit.js'
import { loadComponentIssues } from '../loaders/github.js'
import { slugify } from '../slugify.js'
import type { ComponentFull } from '../types.js'
import { loadDsMeta } from '../loaders/meta.js'
import {
  ALPHA_WARNING,
  BSI_STATUS_URL,
  BSI_COMPONENT_URL,
  BSI_CUSTOM_PROPERTIES_URL,
  DESIGNERS_COMPONENT_URL,
  DTI_VARIABLES_SCSS_URL,
  DEVKIT_INDEX_URL,
  DEVKIT_STORIES_URL,
  GITHUB_SEARCH_ISSUES_URL,
  GITHUB_WATCHED_REPOS,
  BSI_COMPONENT_DEFAULT_SUBFOLDER,
  subfolderFromDocUrl
} from '../constants.js'

// ─── Tool: get_component_full ⭐ ──────────────────────────────────────────────

export function registerGetComponentFull(server: McpServer): void {
  server.registerTool(
    'get_component_full',
    {
      title: 'Get Component Full',
      description: 'Aggregated response for a Design System .italia component: ' +
        'HTML markup + CSS tokens with resolved values + usage guidelines + ' +
        'library status + it-* web component props + open GitHub issues. ' +
        'Use only when you need data from multiple sources in a single response. ' +
        'For specific queries, prefer get_component, get_component_guidelines, get_component_tokens, or get_component_issues.',
      inputSchema: { name: z.string().describe('Component name or slug (e.g. "accordion", "Alert")') },
      annotations: { readOnlyHint: true },
      outputSchema: ZGetComponentFullOutput,
    },
    async ({ name }) => {
      name = name.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      // Load status first — needed for correct variants subfolder
      const statusData = await loadStatus(slug).catch(() => null)

      // Resolve to canonical slug (e.g. "fisarmonica" → "accordion")
      const canonicalSlug = statusData?.slug ?? slug

      // ── Parallel fetch from all sources ──────────────────────────────────────
      const [variants, rawTokens, guidelines, devKitEntry, devKitComponent, openIssues, dsMeta] =
        await Promise.allSettled([
          loadVariants(canonicalSlug),
          loadTokens(canonicalSlug),
          loadGuidelines(canonicalSlug),
          loadDevKitEntry(canonicalSlug),
          loadDevKitComponent(canonicalSlug),
          loadComponentIssues(canonicalSlug),
          loadDsMeta(),
        ])

      // ── Unwrap results with warnings on failure ───────────────────────────────
      function unwrap<T>(result: PromiseSettledResult<T>, label: string, fallback: T): T {
        if (result.status === 'fulfilled') return result.value
        warnings.push(`${label}: ${result.reason?.message ?? 'unknown error'}`)
        return fallback
      }

      const variantsData = unwrap(variants, 'BSI markup', [])
      const rawTokensData = unwrap(rawTokens, 'BSI tokens', [])
      const guidelinesData = unwrap(guidelines, 'Designers Italia', null)
      const devKitEntryData = unwrap(devKitEntry, 'Dev Kit index', null)
      const devKitComponentData = unwrap(devKitComponent, 'Dev Kit stories', null)
      const issuesResult = unwrap(openIssues, 'GitHub Issues', { issues: [] })
      const dsMetaData = unwrap(dsMeta, 'DS meta', null)

      // ── Story variants (all components — depends on devKitEntry) ───────────
      let storyVariantsData: import('../types.js').ComponentVariant[] | null = null
      if (devKitEntryData) {
        try {
          storyVariantsData = await loadStoryVariants(canonicalSlug)
        } catch (err) {
          warnings.push(`Dev Kit story variants: ${(err as Error).message}`)
        }
      }

      if (issuesResult.error) {
        warnings.push(`GitHub issues unavailable: ${issuesResult.error}`)
      }
      const issuesData = issuesResult.issues

      // ── Resolve token values ──────────────────────────────────────────────────
      let tokens = rawTokensData
      try {
        tokens = await resolveTokenValues(rawTokensData)
      } catch (err) {
        console.warn(`Design Tokens Italia: value resolution failed: ${(err as Error).message}`)
        warnings.push('Design Tokens Italia: value resolution not available')
      }

      // ── Warnings for missing data ─────────────────────────────────────────────
      if (!statusData) warnings.push(`Status not found for "${canonicalSlug}" in components_status.json`)
      if (variantsData.length === 0) warnings.push(`No HTML variants found for "${canonicalSlug}"`)
      if (!guidelinesData) warnings.push(`Component guidelines not found for "${canonicalSlug}" in Designers Italia`)
      if (!devKitEntryData) warnings.push(`"${canonicalSlug}" not found in Dev Kit Italia`)
      if (tokens.length === 0) warnings.push(`No CSS tokens found for "${canonicalSlug}"`)

      // ── Alpha layer warning ───────────────────────────────────────────────────
      warnings.push(ALPHA_WARNING)

      // ── Sources used ──────────────────────────────────────────────────────────
      const repoFilter = GITHUB_WATCHED_REPOS.map((r) => `repo:${r}`).join('+')
      const sourceUrls = [
        BSI_STATUS_URL,
        BSI_COMPONENT_URL(
          statusData?.sourceUrls.bsiDoc
            ? subfolderFromDocUrl(statusData.sourceUrls.bsiDoc)
            : BSI_COMPONENT_DEFAULT_SUBFOLDER,
          canonicalSlug
        ),
        BSI_CUSTOM_PROPERTIES_URL,
        DESIGNERS_COMPONENT_URL(canonicalSlug),
        DTI_VARIABLES_SCSS_URL,
        DEVKIT_INDEX_URL,
        ...(devKitEntryData ? [DEVKIT_STORIES_URL(devKitEntryData.importPath)] : []),
        `${GITHUB_SEARCH_ISSUES_URL}?q=${canonicalSlug}+${repoFilter}+is:open`,
      ]

      // ── Assemble ComponentFull response ──────────────────────────────────────
      const full: ComponentFull = {
        name: statusData?.name ?? canonicalSlug,
        slug: canonicalSlug,
        status: statusData,
        variantsCount: variantsData.length,
        variantsAvailable: variantsData.map(v => v.name),
        variants: variantsData.slice(0, 3),
        guidelines: guidelinesData,
        tokens,
        devKit: {
          entry: devKitEntryData,
          component: devKitComponentData,
          storyVariants: storyVariantsData
            ? {
              count: storyVariantsData.length,
              available: storyVariantsData.map(v => v.name),
              variants: storyVariantsData.slice(0, 3),
            }
            : null,
        },
        openIssues: issuesData,
        meta: {
          fetchedAt: formatTimestamp(),
          sourceUrls,
          warnings,
          versions: dsMetaData?.versions ?? undefined,
          designersUrl: dsMetaData?.components.get(canonicalSlug)?.absoluteUrl ?? null,
          stability: 'alpha' as const,
        },
      }

      // ── Available sources for transparency ───────────────────────────────────
      const sourcesAvailable = [
        statusData && 'bsi:status',
        variantsData.length > 0 && 'bsi:markup',
        tokens.length > 0 && 'bsi:tokens',
        guidelinesData && 'designers:yaml',
        devKitEntryData && 'devkit:index',
        devKitComponentData && 'devkit:stories',
        storyVariantsData && storyVariantsData.length > 0 && 'devkit:story-variants',
        issuesData.length > 0 && 'github:issues',
      ].filter(Boolean) as string[]

      const output = {
        ...full,
        sources_available: sourcesAvailable,
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      }
    }
  )
}