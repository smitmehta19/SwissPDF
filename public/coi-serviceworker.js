/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
// Establishes cross-origin isolation (COOP/COEP) on static hosts that cannot
// set headers themselves (e.g. GitHub Pages). Uses COEP "credentialless" so
// cross-origin CDN resources (LibreOffice, OCR engines) still load.
// SwissPDF addition: an offline cache of the app itself (see below).
let coepCredentialless = true
if (typeof window === 'undefined') {
  // Filled in by the build (vite.config.js, swBuildPlugin). Left as is (dev
  // server, tests on the source) the worker only adds the isolation headers.
  const BUILD = '__SWISS_BUILD__'
  const PRECACHE = [] /* __SWISS_PRECACHE__ */
  // Language data, fonts and CMaps: path -> content hash. Cached on first use
  // in a cache that outlives builds, keyed by the hash, so a deploy keeps
  // them and a changed file is never served stale.
  const DATA = {} /* __SWISS_DATA__ */
  const caching = !BUILD.startsWith('__')
  // One cache per build: hashed chunks, the shell (index.html) and the other
  // same-origin static files (pdf.js, tesseract, glue). The LibreOffice engine
  // is cross-origin and has its own hash-checked cache (libreOffice.js), so it
  // never lands here.
  const PREFIX = 'swisspdf-app-'
  const CACHE = PREFIX + BUILD
  const DATA_CACHE = 'swisspdf-data'
  const scope = () => new URL(self.registration.scope)
  const SHELL_KEY = () => scope().href
  const relOf = (url) => new URL(url).pathname.slice(scope().pathname.length)
  // hashed file names never change content: safe to take from an older build
  const hashed = (url) => relOf(url).startsWith('assets/')
  const dataKey = (url) => (DATA[relOf(url)] ? `${scope().href}${relOf(url)}?v=${DATA[relOf(url)]}` : null)

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
    } else if (ev.data.type === 'precache' && caching) {
      ev.waitUntil(precache())
    }
  })

  // Adds the isolation headers to any response, from the network or the cache.
  function isolate(response) {
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
  }

  // Same-origin GETs inside the app's folder, never a range or a POST.
  function local(r) {
    if (!caching || r.method !== 'GET' || r.headers.has('range')) return false
    const url = new URL(r.url)
    return url.origin === self.location.origin && url.pathname.startsWith(scope().pathname)
  }

  // The app page itself (any path of the folder that is not a file).
  function isShell(url) {
    const rest = relOf(url)
    return rest === '' || rest === 'index.html'
  }

  async function put(key, response, name = CACHE) {
    if (!response.ok || response.redirected || response.status !== 200) return
    try {
      await (await caches.open(name)).put(key, response)
    } catch {
      /* quota or a closed cache: the app still works online */
    }
  }

  // Current build first; an older build still kept only for hashed chunks
  // (or anything when offline), never the LibreOffice cache.
  async function fromCache(key, { anyBuild = hashed(key) } = {}) {
    const own = await (await caches.open(CACHE)).match(key)
    if (own || !anyBuild) return own ?? null
    for (const name of await caches.keys()) {
      if (!name.startsWith(PREFIX) || name === CACHE) continue
      const hit = await (await caches.open(name)).match(key)
      if (hit) return hit
    }
    return null
  }

  // Navigation: network first, and always revalidated, so a new deploy is
  // picked up (a stale index.html would point at deleted chunks). Offline,
  // the last good copy.
  async function navigate(event, r, request) {
    try {
      const response = await fetch(request, { cache: 'no-cache' })
      if (local(r)) event.waitUntil(put(isShell(r.url) ? SHELL_KEY() : r.url, response.clone()))
      return isolate(response)
    } catch (err) {
      if (local(r)) {
        const app = isShell(r.url) || !/\.[a-z0-9]+$/i.test(new URL(r.url).pathname)
        const hit = (await fromCache(r.url, { anyBuild: true })) ?? (app ? await fromCache(SHELL_KEY(), { anyBuild: true }) : null)
        if (hit) return isolate(hit)
      }
      throw err
    }
  }

  // Everything else of our own: cache first, stored on first use (answered
  // at once, the copy is written in the background).
  async function cacheFirst(event, r, request) {
    const dk = dataKey(r.url)
    const hit = dk ? await (await caches.open(DATA_CACHE)).match(dk) : await fromCache(r.url)
    if (hit) return isolate(hit)
    const response = await fetch(request, dk || !hashed(r.url) ? { cache: 'no-cache' } : undefined)
    event.waitUntil(dk ? putData(dk, response.clone(), DATA[relOf(r.url)]) : put(r.url, response.clone()))
    return isolate(response)
  }

  // Stored under a content hash only when the body really has that hash (a
  // proxy, a half deploy or an old copy is served but never kept).
  async function putData(key, response, want) {
    if (!response.ok || response.redirected) return
    const buf = await response.arrayBuffer()
    const got = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('')
    if (!got.startsWith(want)) return
    await put(key, new Response(buf, { headers: response.headers }), DATA_CACHE)
  }

  // The whole app (chunks, pdf.js decoders) so a tool never used online still
  // opens offline. Starts when the page asks after load, or a few seconds
  // after the first request this worker sees; runs once per worker. Network
  // errors retry (up to 3 runs); a file the server no longer has is skipped.
  // Old builds go once this one is complete or out of tries.
  let precaching = null
  let tries = 0
  function precache() {
    precaching ??= (async () => {
      tries++
      const cache = await caches.open(CACHE)
      const base = scope().href
      const queue = PRECACHE.map((p) => new URL(p, base).href)
      let failed = 0
      const worker = async () => {
        for (let url; (url = queue.shift()); ) {
          try {
            if (await cache.match(url)) continue
            // fixed names may sit in the browser's HTTP cache from the last build
            const response = await fetch(url, { cache: hashed(url) ? 'default' : 'no-cache' })
            if (response.ok && !response.redirected) await cache.put(url, response)
            else if (response.status < 400 || response.status >= 500) failed++
          } catch {
            failed++
          }
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
      if (failed && tries < 3) {
        precaching = null // try again later
        return
      }
      for (const name of await caches.keys()) {
        if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name)
      }
      // data this build no longer ships (or ships changed)
      const data = await caches.open(DATA_CACHE)
      const keep = new Set(Object.keys(DATA).map((p) => dataKey(new URL(p, base).href)))
      for (const req of await data.keys()) if (!keep.has(req.url)) await data.delete(req)
    })()
    return precaching
  }

  self.addEventListener('fetch', function (event) {
    const r = event.request
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return

    const request =
      coepCredentialless && r.mode === 'no-cors'
        ? new Request(r, { credentials: 'omit' })
        : r
    const answer =
      r.mode === 'navigate'
        ? navigate(event, r, request)
        : local(r)
          ? cacheFirst(event, r, request)
          : fetch(request).then(isolate)
    event.respondWith(answer.catch((e) => console.error(e)))
    // a new worker fills its cache even if the page's request was missed
    if (caching && !precaching && tries < 3) event.waitUntil(new Promise((res) => setTimeout(res, 3000)).then(precache))
  })
} else {
  ;(() => {
    const swUrl = window.document.currentScript.src
    const n = navigator
    if (!('serviceWorker' in n) || !window.isSecureContext) return
    // Controlled by this worker already: fill the offline cache and look for
    // a newer build (the browser checks too, this makes it prompt).
    const askPrecache = () => n.serviceWorker.controller?.postMessage({ type: 'precache' })
    if (n.serviceWorker.controller) {
      n.serviceWorker.addEventListener('controllerchange', askPrecache)
      window.addEventListener('load', () => {
        askPrecache()
        n.serviceWorker.getRegistration().then((reg) => reg?.update().catch(() => {}))
      })
      // back online after an outage: look for a deploy missed meanwhile
      window.addEventListener('online', () => n.serviceWorker.getRegistration().then((reg) => reg?.update().catch(() => {})))
    }
    if (window.crossOriginIsolated) return // already isolated (real headers or this worker)

    // Tell an existing controller which COEP mode to use.
    if (n.serviceWorker.controller) {
      n.serviceWorker.controller.postMessage({ type: 'coepCredentialless', value: true })
    }

    n.serviceWorker.register(swUrl).then(
      async (registration) => {
        console.log('COOP/COEP Service Worker registered', registration.scope)
        // Guard against a reload loop: only reload once per session.
        const alreadyReloaded = window.sessionStorage.getItem('coiReloaded')
        // Wait until a worker is active, then take control by reloading. The
        // worker's clients.claim() can make it the controller before this
        // runs, but this page was loaded without the headers: reload anyway.
        await n.serviceWorker.ready
        if (!window.crossOriginIsolated && !alreadyReloaded) {
          window.sessionStorage.setItem('coiReloaded', '1')
          console.log('Reloading once so the COOP/COEP Service Worker can isolate the page.')
          window.location.reload()
        }
      },
      (err) => console.error('COOP/COEP Service Worker failed to register:', err),
    )
  })()
}
