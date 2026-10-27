// Serves dist/ under /SwissPDF/ with NO COOP/COEP headers, to simulate GitHub
// Pages and verify the coi-serviceworker establishes isolation on its own.
// PORT=<n> (default 4180; 0 = any free port). Takes the test-run lock and
// stops by itself after 10 idle minutes (IDLE_MIN), so a forgotten server
// does not hold the machine.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, normalize } from 'node:path'
import { acquireRunLock } from './corpus-test/runlock.mjs'

const DIST = new URL('../dist/', import.meta.url)
const BASE = '/SwissPDF/'
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.map': 'application/json',
}
const IDLE_MS = Number(process.env.IDLE_MIN ?? 10) * 60_000

await acquireRunLock('serve-pages-sim (built app)')
let last = Date.now()
const server = createServer(async (req, res) => {
  last = Date.now()
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
})
server.on('error', (err) => {
  console.error(`pages-sim: ${err.code === 'EADDRINUSE' ? `port ${err.port} is taken; set PORT=0 or another port` : err.message}`)
  process.exit(1)
})
server.listen(Number(process.env.PORT ?? 4180), () => console.log(`pages-sim on http://localhost:${server.address().port}${BASE}`))
setInterval(() => {
  if (Date.now() - last > IDLE_MS) {
    console.log('pages-sim: idle, stopping')
    process.exit(0)
  }
}, 30_000).unref()
