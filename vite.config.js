import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// COOP/COEP make the page cross-origin isolated: required for SharedArrayBuffer,
// which the LibreOffice WASM engine (zetajs) needs. Locally the dev/preview
// servers set these headers directly; on GitHub Pages (no header control) the
// coi-serviceworker shim in public/ establishes isolation client-side instead.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// pdf.js fetches CMaps (CJK text), standard fonts, JPX/JBIG2 decoder WASM and
// ICC profiles at runtime. Copy them from pdfjs-dist into public/pdfjs/ (not
// committed) so dev, preview and build all serve them under the base path.
function pdfjsAssets() {
  const src = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url))
  const dest = fileURLToPath(new URL('./public/pdfjs/', import.meta.url))
  return {
    name: 'pdfjs-assets',
    configResolved() {
      const version = JSON.parse(readFileSync(src + 'package.json', 'utf8')).version
      const stamp = dest + 'VERSION'
      if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) return
      for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
        rmSync(dest + dir, { recursive: true, force: true })
        cpSync(src + dir, dest + dir, { recursive: true })
      }
      mkdirSync(dest, { recursive: true })
      writeFileSync(stamp, version)
    },
  }
}

// Tesseract worker and WASM cores, copied from node_modules into
// public/tesseract/ (not committed) so OCR loads from our own origin, never a
// CDN. Language data lives in public/tessdata/ (committed).
function tesseractAssets() {
  const files = {
    'tesseract.js/dist/worker.min.js': 'worker.min.js',
    'tesseract.js-core/tesseract-core.wasm.js': 'tesseract-core.wasm.js',
    'tesseract.js-core/tesseract-core-simd.wasm.js': 'tesseract-core-simd.wasm.js',
    'tesseract.js-core/LICENSE': 'LICENSE-tesseract-core.txt',
  }
  const mods = fileURLToPath(new URL('./node_modules/', import.meta.url))
  const dest = fileURLToPath(new URL('./public/tesseract/', import.meta.url))
  return {
    name: 'tesseract-assets',
    configResolved() {
      const version = ['tesseract.js', 'tesseract.js-core'].map((m) => JSON.parse(readFileSync(`${mods}${m}/package.json`, 'utf8')).version).join(' ')
      const stamp = dest + 'VERSION'
      if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) return
      mkdirSync(dest, { recursive: true })
      for (const [from, to] of Object.entries(files)) cpSync(mods + from, dest + to)
      writeFileSync(stamp, version)
    },
  }
}

// Offline cache: writes the build id and the precache list into
// dist/coi-serviceworker.js. A new id per build makes the browser install the
// new worker, which then drops the old build's cache. Precached: every chunk,
// the pdf.js decoders and the LibreOffice glue (small), so a tool never opened
// online still opens offline. Language data, fonts and CMaps are cached when
// first used, in a cache keyed by their content hash that outlives builds.
function swBuildPlugin() {
  let outDir
  const PRECACHE = /^(assets\/(?!.*\.map$)|pdfjs\/(wasm|iccs|standard_fonts)\/|vendor\/)/
  const DATA = /^(tessdata|fonts|pdfjs\/cmaps)\//
  const walk = (dir, rel = '') =>
    readdirSync(dir + rel, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(dir, `${rel}${e.name}/`) : [`${rel}${e.name}`]))
  return {
    name: 'sw-build',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir) + '/'
    },
    closeBundle() {
      const swFile = outDir + 'coi-serviceworker.js'
      const files = walk(outDir).sort()
      const list = ['', 'index.html', 'coi-serviceworker.js', ...files.filter((f) => PRECACHE.test(f))]
      // every file counts: fixed names (tessdata, fonts) are cached too
      const hash = createHash('sha256')
      for (const f of files) hash.update(f + '\n').update(readFileSync(outDir + f))
      const build = hash.digest('hex').slice(0, 12)
      // data cached on use that should survive deploys: keyed by content
      const data = Object.fromEntries(
        files.filter((f) => DATA.test(f)).map((f) => [f, createHash('sha256').update(readFileSync(outDir + f)).digest('hex').slice(0, 12)]),
      )
      const src = readFileSync(swFile, 'utf8')
      const out = src
        .replace("'__SWISS_BUILD__'", `'${build}'`)
        .replace('[] /* __SWISS_PRECACHE__ */', JSON.stringify(list))
        .replace('{} /* __SWISS_DATA__ */', JSON.stringify(data))
      if (out === src || out.includes('__SWISS_')) throw new Error('sw-build: placeholders not found in coi-serviceworker.js')
      writeFileSync(swFile, out)
    },
  }
}

export default defineConfig(({ command }) => ({
  // Project page lives at https://<user>.github.io/SwissPDF/ on build; '/' locally.
  base: command === 'build' ? '/SwissPDF/' : '/',
  plugins: [react(), pdfjsAssets(), tesseractAssets(), swBuildPlugin()],
  server: {
    port: 5173,
    headers: isolationHeaders,
  },
  preview: {
    port: 4173,
    headers: isolationHeaders,
  },
  build: {
    target: 'esnext',
  },
  // The ops worker (src/app/opsWorker.js) lazy-loads pdf-lib and MuPDF, which
  // needs ES module workers with code splitting.
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // mupdf ships its own WASM loader; esbuild pre-bundling breaks it.
    exclude: ['mupdf'],
  },
}))
