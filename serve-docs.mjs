/**
 * serve-docs.mjs
 * Mini server locale per docs/ con MIME types corretti per ES modules.
 * Uso: node serve-docs.mjs  (dalla root del repo)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8080;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, 'docs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = join(ROOT, urlPath);

  // Sicurezza: impedisci path traversal fuori da ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error('dir');
    const ext  = extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  } catch {
    try {
      const data = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  }
}).listen(PORT, () => {
  console.log(`\n🧵 Filo docs — http://localhost:${PORT}`);
  console.log(`   serving: ${ROOT}\n`);
});