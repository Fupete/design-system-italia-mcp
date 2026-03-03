import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadStatus, loadVariants, loadTokens } from '../loaders/bsi.js'
import { loadGuidelines, designersUrl } from '../loaders/designers.js'
import { resolveTokenValues } from '../loaders/tokens.js'
import { loadDevKitEntry, loadDevKitComponent } from '../loaders/devkit.js'
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
} from '../constants.js'

function formatTimestamp(): string {
  return new Date().toISOString()
}

// ─── Tool: get_component_full ⭐ ──────────────────────────────────────────────

export function registerGetComponentFull(server: McpServer): void {
  server.tool(
    'get_component_full',
    'Risposta aggregata su un componente del Design System .italia: ' +
    'markup HTML + token CSS con valori risolti + linee guida d\'uso + ' +
    'stato per libreria + props web component it-* + issue GitHub aperte. ' +
    'Killer feature del server — una sola chiamata per tutto.',
    { name: z.string().describe('Nome o slug del componente (es. "accordion", "Alert")') },
    async ({ name }) => {
      name = name.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      // ── Fetch parallelo di tutte le sorgenti ────────────────────────────────
      const [
        status,
        variants,
        rawTokens,
        guidelines,
        devKitEntry,
        devKitComponent,
        openIssues,
        dsMeta,
      ] = await Promise.allSettled([
        loadStatus(slug),
        loadVariants(slug),
        loadTokens(slug),
        loadGuidelines(slug),
        loadDevKitEntry(slug),
        loadDevKitComponent(slug),
        loadComponentIssues(slug),
        loadDsMeta(),
      ])

      // ── Unwrap results con warnings su failure ───────────────────────────────
      function unwrap<T>(result: PromiseSettledResult<T>, label: string, fallback: T): T {
        if (result.status === 'fulfilled') return result.value
        warnings.push(`${label}: ${result.reason?.message ?? 'errore sconosciuto'}`)
        return fallback
      }

      const statusData = unwrap(status, 'BSI status', null)
      const variantsData = unwrap(variants, 'BSI markup', [])
      const rawTokensData = unwrap(rawTokens, 'BSI tokens', [])
      const guidelinesData = unwrap(guidelines, 'Designers Italia', null)
      const devKitEntryData = unwrap(devKitEntry, 'Dev Kit index', null)
      const devKitComponentData = unwrap(devKitComponent, 'Dev Kit stories', null)
      const issuesData = unwrap(openIssues, 'GitHub Issues', [])
      const dsMetaData = unwrap(dsMeta, 'DS meta', null)

      // ── Risolvi token values ─────────────────────────────────────────────────
      let tokens = rawTokensData
      try {
        tokens = await resolveTokenValues(rawTokensData)
      } catch {
        warnings.push('Design Tokens Italia: risoluzione valori non disponibile')
      }

      // ── Warnings su dati mancanti ────────────────────────────────────────────
      if (!statusData) warnings.push(`Stato non trovato per "${slug}" in components_status.json`)
      if (variantsData.length === 0) warnings.push(`Nessuna variante HTML trovata per "${slug}"`)
      if (!guidelinesData) warnings.push(`Linee guida non trovate per "${slug}" in Designers Italia`)
      if (!devKitEntryData) warnings.push(`"${slug}" non presente nel Dev Kit Italia`)
      if (tokens.length === 0) warnings.push(`Nessun token CSS trovato per "${slug}"`)

      // ── Alpha layer warning ──────────────────────────────────────────────────────
      warnings.push(ALPHA_WARNING)

      // ── Sorgenti usate ───────────────────────────────────────────────────────
      const repoFilter = GITHUB_WATCHED_REPOS.map((r) => `repo:${r}`).join('+')
      const sourceUrls = [
        BSI_STATUS_URL,
        BSI_COMPONENT_URL(slug),
        BSI_CUSTOM_PROPERTIES_URL,
        DESIGNERS_COMPONENT_URL(slug),
        DTI_VARIABLES_SCSS_URL,
        DEVKIT_INDEX_URL,
        ...(devKitEntryData ? [DEVKIT_STORIES_URL(devKitEntryData.importPath)] : []),
        `${GITHUB_SEARCH_ISSUES_URL}?q=${slug}+${repoFilter}+is:open`,
      ]

      // ── Assembla risposta ComponentFull ──────────────────────────────────────
      const full: ComponentFull = {
        name: statusData?.name ?? slug,
        slug,
        status: statusData,
        variants: variantsData,
        guidelines: guidelinesData,
        tokens,
        devKit: {
          entry: devKitEntryData,
          component: devKitComponentData,
        },
        openIssues: issuesData,
        meta: {
          fetchedAt: formatTimestamp(),
          sourceUrls,
          warnings,
          versions: dsMetaData?.versions ?? undefined,
          designersUrl: dsMetaData?.components.get(slug)?.absoluteUrl ?? null,

        },
      }

      // ── Fonti disponibili per trasparenza ────────────────────────────────────
      const sourcesAvailable = [
        statusData && 'bsi:status',
        variantsData.length > 0 && 'bsi:markup',
        tokens.length > 0 && 'bsi:tokens',
        guidelinesData && 'designers:yaml',
        devKitEntryData && 'devkit:index',
        devKitComponentData && 'devkit:stories',
        issuesData.length > 0 && 'github:issues',
      ].filter(Boolean) as string[]

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...full,
                sources_available: sourcesAvailable,
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