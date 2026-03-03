import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadAllStatuses, loadStatus } from '../loaders/bsi.js'
import { loadGuidelines, designersUrl } from '../loaders/designers.js'
import { loadDevKitEntry } from '../loaders/devkit.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { ALPHA_WARNING, BSI_STATUS_URL, DESIGNERS_COMPONENT_URL, DEVKIT_INDEX_URL } from '../constants.js'

function formatTimestamp(): string {
  return new Date().toISOString()
}

// ─── Tool: get_component_guidelines ──────────────────────────────────────────

export function registerGetComponentGuidelines(server: McpServer): void {
  server.registerTool(
    'get_component_guidelines',
    {
      title: 'Get Component Guidelines',
      description: 'Returns usage guidelines for a component from Designers Italia: ' +
        'when to use it, how to use it, recommended alternatives, accessibility notes ' +
        'and library status (Bootstrap Italia, UI Kit, ...).',
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

      if (!guidelines) {
        warnings.push(`Designers Italia component guidelines not found for "${slug}"`)
      }
      if (!status) {
        warnings.push(`Component status not found for "${slug}"`)
      }

      warnings.push(ALPHA_WARNING)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: status?.name ?? slug,
                slug,
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
                    accessibilityNotes: guidelines.accessibilityNotes,
                  }
                  : null,
                devKit: devKitEntry
                  ? {
                    tags: devKitEntry.tags,
                    storybookUrl: devKitEntry.storybookUrl,
                  }
                  : null,
                sourceUrls: {
                  designersItalia: dsMeta.components.get(slug)?.absoluteUrl ?? designersUrl(slug),
                  bsiDoc: status?.sourceUrls.bsiDoc ?? null,
                  figma: status?.sourceUrls.figma ?? null,
                },
                meta: {
                  fetchedAt: formatTimestamp(),
                  sourceUrls: [DESIGNERS_COMPONENT_URL(slug), BSI_STATUS_URL, DEVKIT_INDEX_URL],
                  warnings,
                  stability: 'alpha' as const,
                  versions: dsMeta.versions,
                },
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

// ─── Tool: list_by_status ─────────────────────────────────────────────────────

export function registerListByStatus(server: McpServer): void {
  server.registerTool(
    'list_by_status',
    {
      title: 'List By Status',
      description: 'Lists components filtered by status in a specific library. ' +
        'Available libraries: bootstrapItalia, uiKitItalia, ... ' +
        'Possible statuses: PRONTO, DA RIVEDERE A11Y, DA RIVEDERE, IN REVIEW, ' +
        'DA COMPLETARE VARIANTI, NON PRESENTE, DA FARE, N/D.',
      inputSchema: {
        library: z.enum(['bootstrapItalia', 'uiKitItalia']).describe('Library to filter'),
        status: z.string().describe('Status to filter (e.g. "PRONTO", "DA FARE", "NON PRESENTE")'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ library, status }) => {
      status = status.trim()
      const allStatuses = await loadAllStatuses()
      const statusUpper = status.toUpperCase().trim()

      const results = [...allStatuses.values()]
        .filter((s) => s.libraryStatus[library].toUpperCase() === statusUpper)
        .map((s) => ({
          name: s.name,
          slug: s.slug,
          status: s.libraryStatus[library],
          bsiDoc: s.sourceUrls.bsiDoc ?? null,
        }))

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                library,
                status: statusUpper,
                total: results.length,
                results,
                meta: {
                  fetchedAt: formatTimestamp(),
                  sourceUrls: [BSI_STATUS_URL],
                  stability: 'stable' as const,
                },
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

// ─── Tool: list_accessibility_issues ─────────────────────────────────────────

export function registerListAccessibilityIssues(server: McpServer): void {
  server.registerTool(
    'list_accessibility_issues',
    {
      title: 'List Accessibility Issues',
      description: 'Lists components with open accessibility notes or issues, ' +
        'including those with incomplete accessibility checks.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const allStatuses = await loadAllStatuses()

      const results = [...allStatuses.values()]
        .filter((s) => {
          const a = s.accessibility
          return (
            !a.checkCompleted ||
            a.visivamenteAccessibile === 'DA RIVEDERE A11Y' ||
            a.amichevoleConLettoriDiSchermo === 'DA RIVEDERE A11Y' ||
            a.navigabile === 'DA RIVEDERE A11Y' ||
            a.comprensibile === 'DA RIVEDERE A11Y' ||
            s.knownIssueUrls.length > 0
          )
        })
        .map((s) => ({
          name: s.name,
          slug: s.slug,
          accessibility: s.accessibility,
          knownIssueUrls: s.knownIssueUrls,
          notes: s.notes ?? null,
        }))

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total: results.length,
                results,
                meta: {
                  fetchedAt: formatTimestamp(),
                  sourceUrls: [BSI_STATUS_URL],
                  stability: 'stable' as const,
                },
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