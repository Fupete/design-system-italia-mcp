import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { loadAllStatuses } from '../loaders/bsi.js'
import { loadDevKitIndex } from '../loaders/devkit.js'
import { slugsToTry } from '../slugify.js'
import { loadDsMeta } from '../loaders/meta.js'
import { buildMeta } from './helpers.js'
import { BSI_STATUS_URL, DEVKIT_INDEX_URL, BSI_DOC_BASE } from '../constants.js'

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