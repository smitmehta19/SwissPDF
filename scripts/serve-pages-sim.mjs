// Serves dist/ under /SwissPDF/ with NO COOP/COEP headers, to simulate GitHub
// Pages and verify the coi-serviceworker establishes isolation on its own.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const DIST = new URL('../dist/', import.meta.url)
const BASE = '/SwissPDF/'
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.map': 'application/json',
}

createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0])
  if (path.startsWith(BASE)) path = path.slice(BASE.length)
  else if (path === '/' || path === BASE.slice(0, -1)) path = ''
  if (path === '' || path.endsWith('/')) path += 'index.html'
  const rel = normalize(path).replace(/^(\.\.[/\\])+/, '')
  try {
    const buf = await readFile(new URL(rel, DIST))
    res.setHeader('Content-Type', MIME[extname(rel)] ?? 'application/octet-stream')
    // Deliberately NO Cross-Origin-* headers — the service worker must add them.
    res.end(buf)
  } catch {
    res.statusCode = 404
    res.end('not found: ' + rel)
  }
}).listen(4180, () => console.log('pages-sim on http://localhost:4180' + BASE))
