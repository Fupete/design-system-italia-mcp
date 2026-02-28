import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '8080', 10)
const VERSION = '0.1.0'

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'design-system-italia-mcp',
  version: VERSION,
})

// ─── Tool: ping ──────────────────────────────────────────────────────────────

server.tool(
  'ping',
  'Verifica la connessione al server MCP. Restituisce stato, versione e timestamp.',
  {},
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
            message:
              'Server MCP non ufficiale per il Design System .italia. ' +
              'Usa list_components per iniziare.',
          },
          null,
          2
        ),
      },
    ],
  })
)

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')

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

  // MCP endpoint
  if (url.pathname === '/mcp') {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    await server.connect(transport)
    await transport.handleRequest(req, res)
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

httpServer.listen(PORT, () => {
  console.log(`✅ design-system-italia-mcp v${VERSION}`)
  console.log(`   MCP  → http://localhost:${PORT}/mcp`)
  console.log(`   Health → http://localhost:${PORT}/health`)
})
