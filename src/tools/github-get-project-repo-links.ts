import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { formatTimestamp } from '../utils.js'
import { getProjectBoardStatus } from '../loaders/github.js'
import { buildMeta } from './helpers.js'
import { ZGithubGetProjectRepoLinksOutput } from '../schemas.js'

// ─── Tool: github_get_project_repo_links ──────────────────────────────────────
// Repo issue links, not live board card data — GitHub Projects v2 board
// (project #17) is not integrated (requires read:project scope).

export function registerGithubGetProjectRepoLinks(server: McpServer): void {
  server.registerTool(
    'github_get_project_repo_links',
    {
      title: 'Get Project Repo Links',
      description: 'Returns links to open issues for each Design System .italia repository. ' +
        'Does not include live GitHub Projects v2 board card data (not integrated). ' +
        'Use github_get_component_issues for component-specific issues.',
      inputSchema: {},
      outputSchema: ZGithubGetProjectRepoLinksOutput,
      annotations: { readOnlyHint: true },
    },
    async () => {
      const board = getProjectBoardStatus()

      const output = {
        board,
        projectBoard: {
          url: 'https://github.com/orgs/italia/projects/17',
          note: board.note,
        },
        meta: buildMeta({
          dsMeta: null,
          sourceUrls: ['https://github.com/orgs/italia/projects/17'],
          warnings: [],
          stability: 'stable',
          extra: { dataFetchedAt: formatTimestamp() },
        }),
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      }
    }
  )
}