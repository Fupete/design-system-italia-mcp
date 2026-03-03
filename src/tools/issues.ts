import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadComponentIssues, getProjectBoardStatus } from '../loaders/github.js'
import { loadStatus } from '../loaders/bsi.js'
import { slugify } from '../slugify.js'
import { GITHUB_SEARCH_ISSUES_URL, GITHUB_WATCHED_REPOS, BSI_STATUS_URL } from '../constants.js'

function formatTimestamp(): string {
  return new Date().toISOString()
}

// ─── Tool: get_component_issues ───────────────────────────────────────────────

export function registerGetComponentIssues(server: McpServer): void {
  server.registerTool(
    'get_component_issues',
    {
      title: 'Get Component Issues',
      description: 'Restituisce le issue GitHub aperte relative a un componente ' +
        'sui 4 repository del Design System .italia: bootstrap-italia, ' +
        'design-ui-kit, design-react-kit, design-angular-kit. ' +
        'Include anche le issue note già presenti in components_status.json.',
      inputSchema: { name: z.string().describe('Nome o slug del componente (es. "accordion", "Alert")') },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      name = name.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      const [liveIssues, status] = await Promise.all([
        loadComponentIssues(slug),
        loadStatus(slug),
      ])

      if (liveIssues.length === 0) {
        warnings.push(`Nessuna issue live trovata per "${slug}" — potrebbe essere un problema di rate limit o nessuna issue aperta`)
      }

      // Issue note statiche da components_status.json
      const knownIssues = status?.knownIssueUrls ?? []

      // Deduplica: rimuovi dalle live quelle già note per URL
      const liveUnique = liveIssues.filter(
        (issue) => !knownIssues.includes(issue.url)
      )

      const repoFilter = GITHUB_WATCHED_REPOS.map((r) => `repo:${r}`).join('+')

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                component: slug,
                name: status?.name ?? slug,
                issues: {
                  live: {
                    total: liveUnique.length,
                    results: liveUnique,
                  },
                  known: {
                    total: knownIssues.length,
                    urls: knownIssues,
                    note: 'Issue note in components_status.json — aggiornamento manuale, potrebbero non essere live',
                  },
                },
                meta: {
                  fetchedAt: formatTimestamp(),
                  sourceUrls: [
                    `${GITHUB_SEARCH_ISSUES_URL}?q=${slug}+${repoFilter}+is:open`,
                    BSI_STATUS_URL,
                  ],
                  warnings,
                  stability: 'stable' as const,
                  rateLimitNote: process.env.GITHUB_TOKEN
                    ? 'Autenticato — limite 5000 req/ora'
                    : '⚠️ Non autenticato — limite 60 req/ora per IP. Imposta GITHUB_TOKEN.',
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

// ─── Tool: get_project_board_status ───────────────────────────────────────────

export function registerGetProjectBoardStatus(server: McpServer): void {
  server.registerTool(
    'get_project_board_status',
    {
      title: 'Get Project Board Status',
      description: 'Restituisce lo stato aggregato delle board GitHub del Design System .italia. ' +
        'Include link alle issue aperte per ciascun repository. ' +
        'Nota: GitHub Projects v2 (project #17) non è integrato — ' +
        'usa get_component_issues per issue specifiche.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const board = getProjectBoardStatus()

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                board,
                projectBoard: {
                  url: 'https://github.com/orgs/italia/projects/17',
                  note: board.note,
                },
                meta: {
                  fetchedAt: formatTimestamp(),
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