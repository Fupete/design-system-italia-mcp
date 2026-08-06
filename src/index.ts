#!/usr/bin/env node

import { timingSafeEqual } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'

// ─── Tools ───────────────────────────────────────────────────────────────────
import { registerDsiListComponents } from './tools/dsi-list-components.js'
import { registerDsiSearchComponents } from './tools/dsi-search-components.js'
import { registerTokensListComponentVars } from './tools/tokens-list-component-vars.js'
import { registerTokensListGlobals } from './tools/tokens-list-globals.js'
import { registerTokensResolve } from './tools/tokens-resolve.js'
import { registerTokensFindComponents } from './tools/tokens-find-components.js'
import { registerTokensSearch } from './tools/tokens-search.js'
import { registerDocsGetComponentGuide } from './tools/docs-get-component-guide.js'
import { registerGithubGetComponentIssues } from './tools/github-get-component-issues.js'
import { registerGithubGetProjectRepoLinks } from './tools/github-get-project-repo-links.js'
import { registerBsiListComponentVariants } from './tools/bsi-list-component-variants.js'
import { registerBsiGetComponentMarkup } from './tools/bsi-get-component-markup.js'
import { registerDevkitListComponentVariants } from './tools/devkit-list-component-variants.js'
import { registerDevkitGetComponentMarkup } from './tools/devkit-get-component-markup.js'
import { registerDevkitListComponentProps } from './tools/devkit-list-component-props.js'
import { registerBsiListComponentsByStatus } from './tools/bsi-list-components-by-status.js'
import { cache } from './cache.js'
import { getHealth } from './health.js'
import { BETA_WARNING } from './constants.js'

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '8080', 10)

const require = createRequire(import.meta.url)
const VERSION: string = require('../package.json').version

const CACHE_TOKEN = process.env.CACHE_INVALIDATION_TOKEN ?? ''
const START_TIME = Date.now()

// ─── MCP Server factory ───────────────────────────────────────────────────────
//
// A new instance per HTTP request — McpServer cannot be connected
// to more than one transport at a time.

function createMcpServer(): McpServer {
  const s = new McpServer({
    name: 'design-system-italia-mcp',
    version: VERSION,
  })

  // ping — first tool executed by any client, includes beta warning
  s.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Checks connection to the MCP server. Returns status, version, timestamp and source state warnings.',
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
              message: 'Filo – unofficial MCP server for Design System .italia. Use dsi_list_components to get started.',
              warnings: BETA_WARNING,
              tools: [
                'ping',
                'tokens_list_component_vars',
                'tokens_list_globals',
                'tokens_resolve',
                'tokens_find_components',
                'tokens_search',
                'bsi_list_component_variants',
                'bsi_get_component_markup',
                'devkit_list_component_variants',
                'devkit_get_component_markup',
                'devkit_list_component_props',
                'bsi_list_components_by_status',
                'docs_get_component_guide',
                'github_get_component_issues',
                'github_get_project_repo_links',
                'dsi_list_components',
                'dsi_search_components',
              ],
            },
            null,
            2
          ),
        },
      ],
    })
  )

  registerTokensListComponentVars(s)
  registerTokensListGlobals(s)
  registerTokensResolve(s)
  registerTokensFindComponents(s)
  registerTokensSearch(s)

  registerDocsGetComponentGuide(s)

  registerGithubGetComponentIssues(s)
  registerGithubGetProjectRepoLinks(s)

  registerBsiListComponentVariants(s)
  registerBsiGetComponentMarkup(s)

  registerDevkitListComponentVariants(s)
  registerDevkitGetComponentMarkup(s)
  registerDevkitListComponentProps(s)
  registerBsiListComponentsByStatus(s)
  
  registerDsiListComponents(s)
  registerDsiSearchComponents(s)

  return s
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  // CORS — restrict /cache/invalidate to same origin
  if (url.pathname === '/cache/invalidate') {
    res.setHeader('Access-Control-Allow-Origin', 'null')
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization')


  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check
  if (url.pathname === '/health') {
    const uptimeSec = Math.floor((Date.now() - START_TIME) / 1000)
    const health = await getHealth(uptimeSec)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ version: VERSION, ...health }, null, 2))
    return
  }

  // Cache invalidation
  if (url.pathname === '/cache/invalidate' && req.method === 'POST') {
    const auth = req.headers.authorization ?? ''
    const expected = `Bearer ${CACHE_TOKEN}`
    const authOk = auth.length === expected.length &&
      timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
    if (!CACHE_TOKEN || !authOk) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
    let body = ''
    let bodySize = 0
    for await (const chunk of req) {
      bodySize += chunk.length
      if (bodySize > 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
        return
      }
      body += chunk
    }

    let source: string | undefined
    try {
      source = JSON.parse(body || '{}').source
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      return
    }

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

const TRANSPORT = process.env.TRANSPORT ?? 'http'

if (TRANSPORT === 'stdio') {
  const s = createMcpServer()
  const transport = new StdioServerTransport()
  s.connect(transport).catch(console.error)
} else {
  httpServer.listen(PORT, () => {
    console.log(`✅ design-system-italia-mcp v${VERSION}`)
    console.log(`   MCP    → http://localhost:${PORT}/mcp`)
    console.log(`   Health → http://localhost:${PORT}/health`)
    console.log(`   Cache  → POST http://localhost:${PORT}/cache/invalidate`)
    console.log(`   Auth   → ${CACHE_TOKEN ? '✓ token configured' : '⚠️  CACHE_INVALIDATION_TOKEN not set'}`)
    console.log(`   ⚠️  Token layer beta: BSI 3.x and Dev Kit Italia in beta`)
  })

  process.on('SIGTERM', () => {
    httpServer.close(() => process.exit(0))
  })
  process.on('SIGINT', () => {
    httpServer.close(() => process.exit(0))
  })
}