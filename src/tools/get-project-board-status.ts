import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { formatTimestamp } from '../utils.js'
import { getProjectBoardStatus } from '../loaders/github.js'

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