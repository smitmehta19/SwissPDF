import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// COOP/COEP make the page cross-origin isolated: required for SharedArrayBuffer,
// which the LibreOffice WASM engine (zetajs) needs. On static hosting without
// header control (e.g. GitHub Pages), use coi-serviceworker instead.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    // mupdf ships its own WASM loader; esbuild pre-bundling breaks it.
    exclude: ['mupdf'],
  },
})
