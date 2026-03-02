import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadTokens, searchTokens } from '../loaders/bsi.js'
import { resolveTokenValues, searchDesignTokens } from '../loaders/tokens.js'
import { slugify } from '../slugify.js'
import { ALPHA_WARNING } from '../constants.js'

function formatTimestamp(): string {
  return new Date().toISOString()
}

// ─── Tool: get_component_tokens ───────────────────────────────────────────────

export function registerGetComponentTokens(server: McpServer): void {
  server.tool(
    'get_component_tokens',
    'Restituisce le variabili CSS --bsi-* personalizzabili per un componente, ' +
    'con descrizione semantica e valore risolto (es. var(--bsi-spacing-m) → 1.5rem). ' +
    'Utile per designer che vogliono conoscere i valori concreti dei token.',
    { name: z.string().describe('Nome o slug del componente (es. "accordion", "Alert")') },
    async ({ name }) => {
      name = name.trim()
      const slug = slugify(name)
      const warnings: string[] = []

      // Carica token BSI
      const rawTokens = await loadTokens(slug)

      if (rawTokens.length === 0) {
        warnings.push(`Nessun token CSS trovato per "${slug}"`)
      }

      warnings.push(ALPHA_WARNING)

      // Risolvi valori tramite Design Tokens Italia
      let tokens = rawTokens
      try {
        tokens = await resolveTokenValues(rawTokens)
      } catch {
        warnings.push('Risoluzione valori Design Tokens Italia non disponibile')
      }

      // Raggruppa per tipo per leggibilità
      const byType = {
        tokenReference: tokens.filter((t) => t.valueType === 'token-reference'),
        literal: tokens.filter((t) => t.valueType === 'literal'),
        scssExpression: tokens.filter((t) => t.valueType === 'scss-expression'),
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                component: slug,
                total: tokens.length,
                tokens,
                summary: {
                  tokenReference: byType.tokenReference.length,
                  literal: byType.literal.length,
                  scssExpression: byType.scssExpression.length,
                },
                meta: {
                  fetchedAt: formatTimestamp(),
                  sourceUrls: [
                    'https://raw.githubusercontent.com/italia/bootstrap-italia/3.x/api/custom_properties.json',
                    'https://raw.githubusercontent.com/italia/design-tokens-italia/main/dist/scss/_variables.scss',
                    'https://raw.githubusercontent.com/italia/bootstrap-italia/3.x/src/scss/base/_root.scss',
                  ],
                  note: 'valueResolved: valore concreto risolto tramite Design Tokens Italia. ' +
                    'null = risoluzione non disponibile o valore già letterale.',
                  warnings,
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

// ─── Tool: find_token ─────────────────────────────────────────────────────────

export function registerFindToken(server: McpServer): void {
  server.tool(
    'find_token',
    'Cerca un token CSS per nome variabile o descrizione semantica. ' +
    'Ricerca su tutti i componenti BSI (--bsi-*) e sui token globali Design Tokens Italia (--it-*). ' +
    'Utile per trovare quale variabile controlla un certo aspetto visivo.',
    { query: z.string().describe('Termine da cercare (es. "spacing", "border-radius", "padding")') },
    async ({ query }) => {
      query = query.trim()
      const warnings: string[] = []
      
      warnings.push(ALPHA_WARNING)

      // Ricerca su token per-componente BSI
      const bsiResults = await searchTokens(query)

      // Risolvi valori
      let resolvedBsi = bsiResults
      try {
        resolvedBsi = await resolveTokenValues(bsiResults) as typeof bsiResults
      } catch {
        warnings.push('Risoluzione valori Design Tokens Italia non disponibile')
      }

      // Ricerca su token globali --it-*
      let globalResults: Array<{ name: string; value: string }> = []
      try {
        globalResults = await searchDesignTokens(query)
      } catch {
        warnings.push('Ricerca token globali Design Tokens Italia non disponibile')
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                bsiTokens: {
                  total: resolvedBsi.length,
                  results: resolvedBsi,
                },
                globalTokens: {
                  total: globalResults.length,
                  results: globalResults,
                },
                meta: {
                  fetchedAt: formatTimestamp(),
                  sourceUrls: [
                    'https://raw.githubusercontent.com/italia/bootstrap-italia/3.x/api/custom_properties.json',
                    'https://raw.githubusercontent.com/italia/design-tokens-italia/main/dist/scss/_variables.scss',
                  ],
                  warnings,
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