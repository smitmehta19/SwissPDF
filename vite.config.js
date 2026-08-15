import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// COOP/COEP make the page cross-origin isolated: required for SharedArrayBuffer,
// which the LibreOffice WASM engine (zetajs) needs. Locally the dev/preview
// servers set these headers directly; on GitHub Pages (no header control) the
// coi-serviceworker shim in public/ establishes isolation client-side instead.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig(({ command }) => ({
  // Project page lives at https://<user>.github.io/SwissPDF/ on build; '/' locally.
  base: command === 'build' ? '/SwissPDF/' : '/',
  plugins: [react()],
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
  optimizeDeps: {
    // mupdf ships its own WASM loader; esbuild pre-bundling breaks it.
    exclude: ['mupdf'],
  },
}))
