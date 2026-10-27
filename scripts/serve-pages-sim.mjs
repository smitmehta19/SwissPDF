// Serves dist/ under /SwissPDF/ with NO COOP/COEP headers, to simulate GitHub
// Pages and verify the coi-serviceworker establishes isolation on its own.
// PORT=<n> (default 4180; 0 = any free port). DIST=<dir> serves another build
// folder. Takes the test-run lock and stops by itself after 10 idle minutes
// (IDLE_MIN), so a forgotten server does not hold the machine.
// Lines on stdin (for test scripts): "offline" drops every connection like a
// dead network, "online" serves again, "dist <dir>" switches the build (a
// redeploy).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, normalize, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { acquireRunLock } from './corpus-test/runlock.mjs'

const dirUrl = (d) => pathToFileURL(resolve(d) + '/')
let DIST = process.env.DIST ? dirUrl(process.env.DIST) : new URL('../dist/', import.meta.url)
let offline = false
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
  if (offline) return req.socket.destroy()
  let path = decodeURIComponent(req.url.split('?')[0])
  if (path.startsWith(BASE)) path = path.slice(BASE.length)
  else if (path === '/' || path === BASE.slice(0, -1)) path = ''
  if (path === '' || path.endsWith('/')) path += 'index.html'
  // never outside DIST ("/SwissPDF//Windows/win.ini", "..")
  const file = resolve(fileURLToPath(DIST), normalize(path).replace(/^[/\\]+/, ''))
  const rel = relative(fileURLToPath(DIST), file)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    res.statusCode = 404
    return res.end('not found')
  }
  try {
    const buf = await readFile(file)
    res.setHeader('Content-Type', MIME[extname(rel)] ?? 'application/octet-stream')
    // Deliberately NO Cross-Origin-* headers: the service worker must add them.
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
// loopback only: this serves files from disk
server.listen(Number(process.env.PORT ?? 4180), '127.0.0.1', () => console.log(`pages-sim on http://localhost:${server.address().port}${BASE}`))
process.stdin.setEncoding('utf8')
let pending = ''
process.stdin.on('data', (chunk) => {
  // not a command stream (a device, a long paste): never let it pile up
  pending = (pending + chunk).slice(-4096)
  for (let i; (i = pending.indexOf('\n')) >= 0; ) {
    const [cmd, ...rest] = pending.slice(0, i).trim().split(' ')
    pending = pending.slice(i + 1)
    if (cmd === 'offline' || cmd === 'online') offline = cmd === 'offline'
    else if (cmd === 'dist') DIST = dirUrl(rest.join(' '))
    else continue
    console.log(`pages-sim: ${cmd}${rest.length ? ' ' + rest.join(' ') : ''}`)
  }
})
// stdin closed by a terminal or a parent that does not use it: keep serving
process.stdin.on('error', () => {})
setInterval(() => {
  if (Date.now() - last > IDLE_MS) {
    console.log('pages-sim: idle, stopping')
    process.exit(0)
  }
}, 30_000).unref()
