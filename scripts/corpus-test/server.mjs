// Starts the app's own Vite dev server (COOP/COEP from vite.config.js) on a
// free port, plus a small upload endpoint the page uses to hand outputs back.
import { createServer } from 'vite'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import { acquireRunLock } from './runlock.mjs'

export const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '')
// CORPUS_OUT=<name> gives a run its own folder (outputs-<name>), so parallel runs do not collide
const outName = (process.env.CORPUS_OUT ?? '').replace(/[^\w-]/g, '')
export const OUT_DIR = join(ROOT, 'test-corpus', 'derived', outName ? `outputs-${outName}` : 'outputs')

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

// POST /__corpus/out/<caseId>/<file> writes the body to OUT_DIR.
function uploadPlugin() {
  return {
    name: 'corpus-upload',
    configureServer(server) {
      server.middlewares.use('/__corpus/out/', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '')
        const append = !/[?&]part=0/.test(req.url) && /[?&]part=\d+/.test(req.url)
        // keep writes inside OUT_DIR
        if (!rel || rel.includes('..')) {
          res.statusCode = 400
          return res.end()
        }
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          const dest = join(OUT_DIR, rel)
          mkdirSync(dirname(dest), { recursive: true })
          ;(append ? appendFileSync : writeFileSync)(dest, Buffer.concat(chunks))
          res.statusCode = 200
          res.end('ok')
        })
      })
    },
  }
}

export async function startServer() {
  await acquireRunLock(`${process.argv[1]?.split(/[\\/]/).pop() ?? 'test'} (dev server)`)
  const port = await freePort()
  const server = await createServer({
    root: ROOT,
    configFile: join(ROOT, 'vite.config.js'),
    logLevel: 'error',
    clearScreen: false,
    plugins: [uploadPlugin()],
    server: {
      port,
      strictPort: true,
      host: '127.0.0.1',
      // outputs land under test-corpus/; never let them trigger reloads
      watch: { ignored: ['**/test-corpus/**', '**/docs/**'] },
      hmr: false,
    },
  })
  await server.listen()
  return { server, url: `http://127.0.0.1:${port}` }
}
