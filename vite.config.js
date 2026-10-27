import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

export default defineConfig(({ command }) => ({
  // Project page lives at https://<user>.github.io/SwissPDF/ on build; '/' locally.
  base: command === 'build' ? '/SwissPDF/' : '/',
  plugins: [react(), pdfjsAssets(), tesseractAssets()],
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
