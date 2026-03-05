#!/usr/bin/env node

import { timingSafeEqual } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
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

// ─── MCP Server factory ───────────────────────────────────────────────────────
//
// A new instance per HTTP request — McpServer cannot be connected
// to more than one transport at a time.

function createMcpServer(): McpServer {
  const s = new McpServer({
    name: 'design-system-italia-mcp',
    version: VERSION,
  })

  // ping — first tool executed by any client, includes alpha warning
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
              message: 'Unofficial MCP server for Design System .italia. Use list_components to get started.',
              warnings: [
                'Unofficial experimental project — data provided as-is.',
                'Token layer alpha: Bootstrap Italia 3.x and Dev Kit Italia are in alpha. ' +
                'HTML markup and component status are almost stable (APIs also present in BSI 2.x). ' +
                'CSS tokens (--bsi-*) and Dev Kit web components may have breaking changes before stable release. ' +
                'Do not use the token layer in production without checking upstream status.',
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
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', version: VERSION }))
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
    console.log(`   ⚠️  Token layer alpha: BSI 3.x and Dev Kit Italia in alpha`)
  })

  process.on('SIGTERM', () => {
    httpServer.close(() => process.exit(0))
  })
  process.on('SIGINT', () => {
    httpServer.close(() => process.exit(0))
  })
}