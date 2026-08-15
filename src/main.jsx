import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// After a redeploy, a browser holding a cached index.html can request a lazy
// chunk whose hash changed and now 404s. Vite fires this event; reload once
// (rate-limited so a genuine outage can't loop) to pick up the fresh build.
function reloadForStaleChunk() {
  const key = 'swiss:chunkReloadAt'
  const last = Number(sessionStorage.getItem(key)) || 0
  if (Date.now() - last > 8000) {
    sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
  }
}
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadForStaleChunk()
})
window.addEventListener('unhandledrejection', (e) => {
  if (/dynamically imported module|Importing a module script failed/i.test(String(e.reason?.message ?? e.reason))) {
    reloadForStaleChunk()
  }
})

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
