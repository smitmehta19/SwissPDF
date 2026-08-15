/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
// Establishes cross-origin isolation (COOP/COEP) on static hosts that cannot
// set headers themselves (e.g. GitHub Pages). Uses COEP "credentialless" so
// cross-origin CDN resources (LibreOffice, OCR engines) still load.
let coepCredentialless = true
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting())
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

  self.addEventListener('message', (ev) => {
    if (!ev.data) return
    if (ev.data.type === 'deregister') {
      self.registration.unregister().then(() => self.clients.matchAll()).then((clients) => {
        clients.forEach((client) => client.navigate(client.url))
      })
    } else if (ev.data.type === 'coepCredentialless') {
      coepCredentialless = ev.data.value
    }
  })

  self.addEventListener('fetch', function (event) {
    const r = event.request
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return

    const request =
      coepCredentialless && r.mode === 'no-cors'
        ? new Request(r, { credentials: 'omit' })
        : r
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) return response
          const newHeaders = new Headers(response.headers)
          newHeaders.set('Cross-Origin-Embedder-Policy', coepCredentialless ? 'credentialless' : 'require-corp')
          if (!coepCredentialless) newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin')
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin')
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          })
        })
        .catch((e) => console.error(e)),
    )
  })
} else {
  ;(() => {
    const swUrl = window.document.currentScript.src
    const n = navigator
    if (!('serviceWorker' in n) || !window.isSecureContext) return
    if (window.crossOriginIsolated) return // already isolated (real headers)

    // Tell an existing controller which COEP mode to use.
    if (n.serviceWorker.controller) {
      n.serviceWorker.controller.postMessage({ type: 'coepCredentialless', value: true })
    }

    n.serviceWorker.register(swUrl).then(
      async (registration) => {
        console.log('COOP/COEP Service Worker registered', registration.scope)
        // Guard against a reload loop: only reload once per session.
        const alreadyReloaded = window.sessionStorage.getItem('coiReloaded')
        // Wait until a worker is active, then take control by reloading.
        await n.serviceWorker.ready
        if (!n.serviceWorker.controller && !alreadyReloaded) {
          window.sessionStorage.setItem('coiReloaded', '1')
          console.log('Reloading once so the COOP/COEP Service Worker can isolate the page.')
          window.location.reload()
        }
      },
      (err) => console.error('COOP/COEP Service Worker failed to register:', err),
    )
  })()
}
