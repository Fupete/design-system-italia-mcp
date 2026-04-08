import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { loadAllStatuses } from '../loaders/bsi.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BSI_STATUS_URL } from '../constants.js'

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
      const [allStatuses, dsMeta] = await Promise.all([
        loadAllStatuses(),
        loadDsMeta(),
      ])

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
                meta: buildMeta({
                  dsMeta,
                  sourceUrls: [BSI_STATUS_URL],
                  warnings: [],
                  stability: 'stable',
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