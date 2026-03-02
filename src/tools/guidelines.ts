import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadAllStatuses, loadStatus } from '../loaders/bsi.js'
import { loadGuidelines, designersUrl } from '../loaders/designers.js'
import { loadDevKitEntry } from '../loaders/devkit.js'
import { slugify } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { ALPHA_WARNING } from '../constants.js'

function formatTimestamp(): string {
  return new Date().toISOString()
}

// ─── Tool: get_component_guidelines ──────────────────────────────────────────

export function registerGetComponentGuidelines(server: McpServer): void {
  server.tool(
    'get_component_guidelines',
    'Restituisce linee guida d\'uso di un componente da Designers Italia: ' +
    'quando usarlo, come usarlo, alternative consigliate, note di accessibilità ' +
    'e stato per libreria (Bootstrap Italia, UI Kit, ...).',
    { name: z.string().describe('Nome o slug del componente (es. "accordion", "Alert")') },
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
        warnings.push(`Linee guida Designers Italia non trovate per "${slug}"`)
      }
      if (!status) {
        warnings.push(`Stato componente non trovato per "${slug}"`)
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
                  sourceUrls: [
                    `https://raw.githubusercontent.com/italia/designers.italia.it/main/src/data/content/design-system/componenti/${slug}.yaml`,
                    'https://raw.githubusercontent.com/italia/bootstrap-italia/3.x/api/components_status.json',
                    'https://italia.github.io/dev-kit-italia/index.json',
                  ],
                  warnings,
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
  server.tool(
    'list_by_status',
    'Elenca componenti filtrati per stato in una libreria specifica. ' +
    'Librerie disponibili: bootstrapItalia, uiKitItalia, ... ' +
    'Stati possibili: PRONTO, DA RIVEDERE A11Y, DA RIVEDERE, IN REVIEW, ' +
    'DA COMPLETARE VARIANTI, NON PRESENTE, DA FARE, N/D.',
    {
      library: z.enum(['bootstrapItalia', 'uiKitItalia'])
        .describe('Libreria da filtrare'),
      status: z.string()
        .describe('Stato da filtrare (es. "PRONTO", "DA FARE", "NON PRESENTE")'),
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
                  sourceUrls: [
                    'https://raw.githubusercontent.com/italia/bootstrap-italia/3.x/api/components_status.json',
                  ],
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
  server.tool(
    'list_accessibility_issues',
    'Elenca i componenti con note o problemi di accessibilità aperti, ' +
    'inclusi quelli con check di accessibilità non completato.',
    {},
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
                  sourceUrls: [
                    'https://raw.githubusercontent.com/italia/bootstrap-italia/3.x/api/components_status.json',
                  ],
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