import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { formatTimestamp } from '../utils.js'
import { loadComponentIssues, getProjectBoardStatus } from '../loaders/github.js'
import { loadStatus } from '../loaders/bsi.js'
import { slugify } from '../slugify.js'
import { GITHUB_SEARCH_ISSUES_URL, GITHUB_WATCHED_REPOS, BSI_STATUS_URL } from '../constants.js'
import { buildMeta } from './helpers.js'

// ─── Tool: get_component_issues ───────────────────────────────────────────────

export function registerGetComponentIssues(server: McpServer): void {
  server.registerTool(
    'get_component_issues',
    {
      title: 'Get Component Issues',
      description: 'Returns open GitHub issues for a component ' +
        'across the 4 Design System .italia repositories: bootstrap-italia, ' +
        'design-ui-kit, dev-kit-italia, design-tokens-italia. ' +
        'Also includes known issues already present in components_status.json.',
      inputSchema: { name: z.string().describe('Component name or slug (e.g. "accordion", "Alert")') },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      name = name.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      const [{ issues: liveIssues, error: issuesError }, status] = await Promise.all([
        loadComponentIssues(slug),
        loadStatus(slug),
      ])

      const canonicalSlug = status?.slug ?? slug

      if (issuesError) {
        warnings.push(`GitHub issues unavailable: ${issuesError}`)
      } else if (liveIssues.length === 0) {
        warnings.push(`No open issues found for "${canonicalSlug}"`)
      }

      // Static known issues from components_status.json
      const knownIssues = status?.knownIssueUrls ?? []

      // Deduplicate: remove from live those already known by URL
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
                component: canonicalSlug,
                name: status?.name ?? canonicalSlug,
                issues: {
                  live: {
                    total: liveUnique.length,
                    results: liveUnique,
                  },
                  known: {
                    total: knownIssues.length,
                    urls: knownIssues,
                    note: 'Known issues from components_status.json — manually updated, may not be live',
                  },
                },
                meta: buildMeta({
                  dsMeta: null,
                  sourceUrls: [
                    `${GITHUB_SEARCH_ISSUES_URL}?q=${canonicalSlug}+${repoFilter}+is:open`,
                    BSI_STATUS_URL,
                  ],
                  warnings,
                  stability: 'stable',
                  extra: { dataFetchedAt: formatTimestamp() },
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

// ─── Tool: get_project_board_status ───────────────────────────────────────────

export function registerGetProjectBoardStatus(server: McpServer): void {
  server.registerTool(
    'get_project_board_status',
    {
      title: 'Get Project Board Status',
      description: 'Returns the aggregated status of Design System .italia GitHub boards. ' +
        'Includes links to open issues for each repository.' +
        'use get_component_issues for component-specific issues.',
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
                  dataFetchedAt: formatTimestamp(),
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