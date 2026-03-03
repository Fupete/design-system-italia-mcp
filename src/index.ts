import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'

// ─── Tools ───────────────────────────────────────────────────────────────────
import { registerListComponents, registerGetComponent, registerSearchComponents } from './tools/components.js'
import { registerGetComponentTokens, registerFindToken } from './tools/tokens.js'
import { registerGetComponentGuidelines, registerListByStatus, registerListAccessibilityIssues } from './tools/guidelines.js'
import { registerGetComponentIssues, registerGetProjectBoardStatus } from './tools/issues.js'
import { registerGetComponentFull } from './tools/full.js'
import { cache } from './cache.js'
import { ALPHA_WARNING } from './constants.js'

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '8080', 10)

const require = createRequire(import.meta.url)
const VERSION: string = require('../package.json').version

const CACHE_TOKEN = process.env.CACHE_INVALIDATION_TOKEN ?? ''

// ─── Warning alpha — incluso in ping e in meta.warnings di tutte le risposte ──
//
// BSI 2.x è stabile e ha le API markup e stato componenti.
// BSI 3.x aggiunge i token CSS strutturati (custom_properties.json, _root.scss)
// necessari per valueResolved. Dev Kit Italia è costruito su BSI 3.x.
// Il layer token e i web component sono soggetti a breaking changes prima della
// release stabile — non usare in produzione senza verificare upstream.

export { ALPHA_WARNING }

// ─── Factory MCP Server ───────────────────────────────────────────────────────
//
// Una nuova istanza per ogni richiesta HTTP — il McpServer non può essere
// connesso a più di un transport contemporaneamente.

function createMcpServer(): McpServer {
  const s = new McpServer({
    name: 'design-system-italia-mcp',
    version: VERSION,
  })

  // ping — primo tool eseguito da qualsiasi client, include warning alpha
  s.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Verifica la connessione al server MCP. Restituisce stato, versione, timestamp e avvisi sullo stato delle sorgenti.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'ok',
              server: 'design-system-italia-mcp',
              version: VERSION,
              timestamp: new Date().toISOString(),
              message: 'Server MCP non ufficiale per il Design System .italia. Usa list_components per iniziare.',
              warnings: [
                'Progetto sperimentale non ufficiale — dati forniti così come sono.',
                'Layer token alpha: Bootstrap Italia 3.x e Dev Kit Italia sono in fase alpha. ' +
                'Markup HTML e stato componenti sono stabili (API presenti anche in BSI 2.x). ' +
                'Token CSS (--bsi-*) e web component Dev Kit possono avere breaking changes prima della release stabile. ' +
                'Non usare il layer token in produzione senza verificare lo stato upstream.',
              ],
              tools: [
                'ping',
                'list_components',
                'get_component',
                'search_components',
                'get_component_tokens',
                'find_token',
                'get_component_guidelines',
                'list_by_status',
                'list_accessibility_issues',
                'get_component_issues',
                'get_project_board_status',
                'get_component_full',
              ],
            },
            null,
            2
          ),
        },
      ],
    })
  )

  registerListComponents(s)
  registerGetComponent(s)
  registerSearchComponents(s)

  registerGetComponentTokens(s)
  registerFindToken(s)

  registerGetComponentGuidelines(s)
  registerListByStatus(s)
  registerListAccessibilityIssues(s)

  registerGetComponentIssues(s)
  registerGetProjectBoardStatus(s)

  registerGetComponentFull(s)

  return s
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', version: VERSION }))
    return
  }

  // Cache invalidation
  if (url.pathname === '/cache/invalidate' && req.method === 'POST') {
    const auth = req.headers.authorization ?? ''
    if (!CACHE_TOKEN || auth !== `Bearer ${CACHE_TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
    let body = ''
    for await (const chunk of req) body += chunk
    const { source } = JSON.parse(body || '{}')

    if (!source || source === 'all') {
      cache.invalidateAll()
    } else {
      cache.invalidate(source)
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ invalidated: source ?? 'all', timestamp: new Date().toISOString() }))
    return
  }

  // MCP endpoint
  if (url.pathname === '/mcp') {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    const s = createMcpServer()
    await s.connect(transport)
    await transport.handleRequest(req, res)
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

httpServer.listen(PORT, () => {
  console.log(`✅ design-system-italia-mcp v${VERSION}`)
  console.log(`   MCP    → http://localhost:${PORT}/mcp`)
  console.log(`   Health → http://localhost:${PORT}/health`)
  console.log(`   Cache  → POST http://localhost:${PORT}/cache/invalidate`)
  console.log(`   Auth   → ${CACHE_TOKEN ? '✓ token configurato' : '⚠️  CACHE_INVALIDATION_TOKEN non impostato'}`)
  console.log(`   ⚠️  Layer token alpha: BSI 3.x e Dev Kit Italia in fase alpha`)
})