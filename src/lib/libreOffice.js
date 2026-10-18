// High-fidelity Office → PDF via LibreOffice compiled to WebAssembly (zetajs).
// The engine code (about 55 MB compressed) downloads once on first use from the
// ZetaOffice CDN, is checked against pinned SHA-256 hashes and kept in Cache
// Storage. Documents themselves never leave the machine: the CDN only ever sees
// GET requests for the four engine files.
//
// The engine runs in a hidden same-origin frame (public/vendor/lo_frame.html).
// Removing the frame kills it with all its threads, which is how a hung engine
// is restarted. There is only ever one engine per page (two deadlock).

// ZetaOffice has no versioned CDN path (only zetaoffice_latest), so the build
// is pinned by content: any other build fails the hash check and is not run.
// ZetaOffice 24.2, buildid efaf0670b4d0, published 2025-05-13.
export const ENGINE_BUILD = {
  name: 'ZetaOffice 24.2 (efaf0670b4d0, 2025-05-13)',
  base: 'https://cdn.zetaoffice.net/zetaoffice_latest/',
  downloadMB: 55,
  files: {
    'soffice.js': { size: 858124, sha256: '5143e5354f470b87f86ba272bcfef857bd13e6f07b59666e48a7ccb89643cd77' },
    'soffice.data.js.metadata': { size: 215180, sha256: '5d9d909d0b9b38443c0f19704032d0fc12d654f6c9c24c2c3b237739c4848ae3' },
    'soffice.wasm': { size: 161667499, sha256: '9ebd9a487e849a24b9c69f843ebdb451709c27b7722c010e36846433474a5bd4' },
    'soffice.data': { size: 99520604, sha256: '3dab0a5448e599dccc1b1e69f4f86ea9eb30777c3f1ed7b9c386a5f4163e361c' },
  },
}
const CACHE_NAME = 'swisspdf-libreoffice-efaf0670b4d0'

// The engine already has Carlito (Calibri), Caladea (Cambria), Liberation
// (Arial/Times/Courier), DejaVu, Noto Sans/Serif (incl. Devanagari), Arabic
// and Hebrew. Missing: CJK, which came out as empty boxes. These are our
// self-hosted Noto subsets (OFL, public/fonts), only fetched with the engine.
const EXTRA_FONTS = ['NotoSansSC-Regular.ttf', 'NotoSansJP-Regular.ttf', 'NotoSansKR-Regular.ttf']
const FONT_DIR = '/usr/share/fonts/swisspdf/'
// Fontconfig aliases for families the engine has no metric match for.
// Calibri Light has the same advance widths as Calibri within 1%; without the
// alias it falls back to a much wider face and lines reflow.
const FONT_ALIASES = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <alias binding="same"><family>Calibri Light</family><accept><family>Carlito</family></accept></alias>
</fontconfig>
`

const BOOT_TIMEOUT = 3 * 60 * 1000 // after the download, until the office thread is ready
const STALL_TIMEOUT = 60 * 1000 // no bytes received for this long = download stalled
const CONVERT_TIMEOUT = 5 * 60 * 1000

const FILTERS = [
  [/\.(docx?|odt|rtf|txt)$/i, 'writer_pdf_Export'],
  [/\.(xlsx?|ods|csv)$/i, 'calc_pdf_Export'],
  [/\.(pptx?|odp)$/i, 'impress_pdf_Export'],
  // HTML goes through the Writer HTML import for real, selectable text.
  [/\.html?$/i, 'writer_pdf_Export'],
  // A PDF re-export (e.g. PDF/A conversion) is handled by Draw, which is the
  // module LibreOffice uses to import PDF files.
  [/\.pdf$/i, 'draw_pdf_Export'],
]
const IMPORT_FILTERS = [
  [/\.pdf$/i, 'draw_pdf_import'],
  [/\.html?$/i, 'HTML (StarWriter)'],
]

export function filterForName(filename) {
  const hit = FILTERS.find(([re]) => re.test(filename))
  return hit ? hit[1] : null
}

// Shared on globalThis so two copies of this module (dev HMR, test harness plus
// app chunk) still see one engine.
const st = (globalThis.__swisspdfLibreOffice ??= {
  boot: null, // promise of the running engine
  engine: null, // { frame, thrPort, FS, jobs }
  listeners: new Set(),
  queue: Promise.resolve(),
  nextJobId: 1,
  stats: {},
  bootAbort: null, // AbortController of the boot in progress
})

// Same shape as the shell's CancelledError (app/jobs.js): the shell treats it
// as a cancel, not a failure.
export function cancelledError() {
  const err = new Error('Cancelled')
  err.name = 'AbortError'
  err.cancelled = true
  return err
}

// Settles with the promise, or rejects with a cancel once the signal fires.
function untilAbort(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(cancelledError())
  let onAbort
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      onAbort = () => reject(cancelledError())
      signal.addEventListener('abort', onAbort, { once: true })
    }),
  ]).finally(() => signal.removeEventListener('abort', onAbort))
}

export function engineAvailable() {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
}

export function engineLoaded() {
  return !!st.engine
}

// Timing and cache facts of the last boot, for tests and the UI.
export function engineStats() {
  return { ...st.stats }
}

function emit(msg, info) {
  for (const fn of st.listeners) {
    try {
      fn(msg, info)
    } catch {
      /* a listener's own problem */
    }
  }
}

// Kills the engine (removes its frame) and fails every pending job. Also
// stops a boot in progress (download or start). The next job boots again,
// from the cached files.
export function resetEngine(reason = 'The LibreOffice engine was restarted.', makeError = () => new Error(reason)) {
  const eng = st.engine
  st.bootAbort?.abort()
  st.bootAbort = null
  st.engine = null
  st.boot = null
  if (!eng) return
  for (const job of eng.jobs.values()) job.reject(makeError())
  eng.jobs.clear()
  try {
    eng.thrPort.onmessage = null
  } catch {
    /* frame already gone */
  }
  eng.frame.remove()
}

async function sha256Hex(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function openCache() {
  try {
    return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null
  } catch {
    return null // storage blocked (private mode etc.): plain download each time
  }
}

// Reads a response body, counting bytes; aborts if the stream stalls.
async function readBody(res, onBytes, controller) {
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  let stall = setTimeout(() => controller.abort(), STALL_TIMEOUT)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      clearTimeout(stall)
      stall = setTimeout(() => controller.abort(), STALL_TIMEOUT)
      chunks.push(value)
      size += value.length
      onBytes(value.length)
    }
  } finally {
    clearTimeout(stall)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out.buffer
}

// Fetches the four engine files (cache first), checks each hash, reports
// progress as bytes of the unpacked files.
async function fetchEngineFiles(progress, signal) {
  const cache = await openCache()
  const names = Object.keys(ENGINE_BUILD.files)
  const total = names.reduce((s, n) => s + ENGINE_BUILD.files[n].size, 0)
  let loaded = 0
  let fromCache = 0
  const onBytes = (n) => {
    loaded += n
    progress(loaded, total)
  }
  const controller = new AbortController()
  const stopped = () => !!signal?.aborted
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  const fetchOne = async (name) => {
    const url = ENGINE_BUILD.base + name
    const pin = ENGINE_BUILD.files[name]
    const hit = cache && (await cache.match(url).catch(() => null))
    if (hit) {
      const buf = await hit.arrayBuffer()
      // checked before it was stored; size guards against a truncated entry
      if (buf.byteLength === pin.size) {
        fromCache++
        onBytes(buf.byteLength)
        return buf
      }
    }
    let res
    try {
      res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: controller.signal })
    } catch (err) {
      if (stopped()) throw cancelledError()
      throw new Error(
        controller.signal.aborted
          ? 'The LibreOffice engine download stalled. Check the connection and try again.'
          : `Could not download the LibreOffice engine (${err.message}). Check the connection and try again.`,
      )
    }
    if (!res.ok) throw new Error(`Could not download the LibreOffice engine: ${name} returned HTTP ${res.status}.`)
    let buf
    try {
      buf = await readBody(res, onBytes, controller)
    } catch {
      if (stopped()) throw cancelledError()
      throw new Error('The LibreOffice engine download stalled or was cut off. Check the connection and try again.')
    }
    const hash = await sha256Hex(buf)
    if (buf.byteLength !== pin.size || hash !== pin.sha256) {
      throw new Error(
        `The LibreOffice engine on the ZetaOffice CDN has changed (${name} does not match the pinned build), so SwissPDF will not run it. Use Quick mode until SwissPDF is updated.`,
      )
    }
    if (cache) {
      try {
        await cache.put(url, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } }))
      } catch {
        /* quota: fine, download again next time */
      }
    }
    return buf
  }
  try {
    const bufs = await Promise.all(names.map(fetchOne))
    return { files: Object.fromEntries(names.map((n, i) => [n, bufs[i]])), fromCache: fromCache === names.length }
  } catch (err) {
    controller.abort()
    throw stopped() ? cancelledError() : err
  }
}

async function fetchFonts(base) {
  const fonts = await Promise.all(
    EXTRA_FONTS.map(async (file) => {
      try {
        const res = await fetch(new URL(`fonts/${file}`, base))
        if (!res.ok) return null
        return { path: FONT_DIR + file, bytes: new Uint8Array(await res.arrayBuffer()) }
      } catch {
        return null // a missing extra font only costs that script's glyphs
      }
    }),
  )
  fonts.push({ path: '/instdir/share/fontconfig/conf.d/31-swisspdf-aliases.conf', bytes: new TextEncoder().encode(FONT_ALIASES) })
  return fonts.filter(Boolean)
}

function withTimeout(promise, ms, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function bootEngine(signal) {
  if (!engineAvailable()) {
    // The isolation service worker takes control on a one-time reload; if it
    // hasn't yet, do that reload now instead of failing.
    if ('serviceWorker' in navigator && !sessionStorage.getItem('coiForcedReload')) {
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) {
          sessionStorage.setItem('coiForcedReload', '1')
          location.reload()
          // give the reload a moment; the thrown error below is a fallback
          await new Promise((r) => setTimeout(r, 4000))
        }
      } catch {
        /* fall through to the error */
      }
    }
    throw new Error(
      'High-fidelity mode needs the page to be cross-origin isolated. Reload this page once and try again: the isolation service worker takes effect after one reload. If it persists, use Quick mode.',
    )
  }
  const t0 = performance.now()
  const base = new URL(import.meta.env.BASE_URL, location.href)
  let lastPct = -1
  const mb = ENGINE_BUILD.downloadMB
  emit(`downloading LibreOffice engine (one-time, about ${mb} MB, cached after)`, { phase: 'download', loaded: 0, total: 0, percent: 0 })
  const [{ files, fromCache }, fonts] = await Promise.all([
    fetchEngineFiles((loaded, total) => {
      const percent = Math.floor((loaded / total) * 100)
      if (percent === lastPct) return
      lastPct = percent
      emit(`downloading LibreOffice engine ${percent}% (one-time, about ${mb} MB, cached after)`, { phase: 'download', loaded, total, percent })
    }, signal),
    fetchFonts(base),
  ])
  if (signal.aborted) throw cancelledError()
  const tDownloaded = performance.now()
  emit('starting LibreOffice', { phase: 'start' })

  // Engine frame, offscreen but not display:none (hidden frames get throttled).
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:4px;height:4px;border:0;'
  const urls = {}
  const engine = { frame, thrPort: null, FS: null, jobs: new Map(), urls }
  st.engine = engine
  try {
    await untilAbort(withTimeout(
      new Promise((resolve, reject) => {
        frame.onload = resolve
        frame.onerror = () => reject(new Error('The LibreOffice engine frame did not load.'))
        frame.src = new URL('vendor/lo_frame.html', base).toString()
        document.body.appendChild(frame)
      }),
      30_000,
      'The LibreOffice engine frame did not load.',
    ), signal)
    const win = frame.contentWindow
    if (!win?.loBoot) throw new Error('The LibreOffice engine frame did not load.')
    if (!win.crossOriginIsolated) throw new Error('The LibreOffice engine frame is not cross-origin isolated. Reload the page and try again.')
    const blob = (name, type) => new win.Blob([files[name]], { type })
    urls['soffice.data.js.metadata'] = win.URL.createObjectURL(blob('soffice.data.js.metadata', 'application/json'))
    const { thrPort, FS } = await untilAbort(withTimeout(
      win.loBoot({
        threadJs: new URL('vendor/lo_thread.js', base).toString(),
        base: ENGINE_BUILD.base,
        sofficeJs: blob('soffice.js', 'text/javascript'),
        urls,
        wasm: files['soffice.wasm'],
        data: files['soffice.data'],
        fonts,
      }),
      BOOT_TIMEOUT,
      'The LibreOffice engine took too long to start. Try again, or use Quick mode.',
    ), signal)
    engine.thrPort = thrPort
    engine.FS = FS
    await untilAbort(withTimeout(
      new Promise((resolve) => {
        thrPort.onmessage = (e) => {
          const msg = e.data
          if (msg.cmd === 'lo-ready') {
            resolve()
          } else if (msg.cmd === 'converted') {
            engine.jobs.get(msg.id)?.resolve(msg.to)
            engine.jobs.delete(msg.id)
          } else if (msg.cmd === 'convert-error') {
            engine.jobs.get(msg.id)?.reject(new Error(msg.message))
            engine.jobs.delete(msg.id)
          }
        }
      }),
      BOOT_TIMEOUT,
      'The LibreOffice engine took too long to start. Try again, or use Quick mode.',
    ), signal)
  } catch (err) {
    if (st.engine === engine) resetEngine(err.message)
    else frame.remove()
    throw err
  }
  st.stats = {
    build: ENGINE_BUILD.name,
    fromCache,
    downloadMs: Math.round(tDownloaded - t0),
    startMs: Math.round(performance.now() - tDownloaded),
    bootMs: Math.round(performance.now() - t0),
    fonts: fonts.map((f) => f.path.split('/').pop()),
  }
  emit('LibreOffice ready', { phase: 'ready' })
  return engine
}

// Boots the engine once. onProgress(message, info) gets every step; while
// downloading, info = { phase: 'download', loaded, total, percent }.
// opts.signal: aborting it stops the download or start and kills the frame
// (one engine, one job at a time, so nobody else is waiting on it).
export function loadEngine(onProgress = () => {}, { signal } = {}) {
  if (signal?.aborted) return Promise.reject(cancelledError())
  st.listeners.add(onProgress)
  if (!st.boot) {
    const ctrl = new AbortController()
    const boot = bootEngine(ctrl.signal)
    st.boot = boot
    st.bootAbort = ctrl
    const done = () => {
      if (st.bootAbort === ctrl) st.bootAbort = null
    }
    boot.then(done, () => {
      if (st.boot === boot) st.boot = null // allow retry after a failed boot
      done()
    })
  }
  const boot = st.boot
  // only a boot still in progress is stopped; a ready engine stays up
  const onAbort = () => {
    if (st.boot === boot && st.bootAbort) resetEngine('Cancelled', cancelledError)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  return untilAbort(boot, signal).finally(() => {
    st.listeners.delete(onProgress)
    signal?.removeEventListener('abort', onAbort)
  })
}

// True when the engine is running or all four files are in Cache Storage, so
// the next run needs no download.
export async function engineCached() {
  if (st.engine) return true
  const cache = await openCache()
  if (!cache) return false
  try {
    for (const name of Object.keys(ENGINE_BUILD.files)) if (!(await cache.match(ENGINE_BUILD.base + name))) return false
    return true
  } catch {
    return false
  }
}

async function runJob(bytes, filename, onProgress, opts) {
  const filter = filterForName(filename)
  if (!filter) throw new Error(`Unsupported file type: ${filename}`)
  const { signal } = opts
  const engine = await loadEngine(onProgress, { signal })
  if (signal?.aborted) throw cancelledError()
  onProgress('converting')
  const id = st.nextJobId++
  const ext = filename.split('.').pop().toLowerCase()
  const from = `/tmp/swiss_in_${id}.${ext}`
  const to = `/tmp/swiss_out_${id}.pdf`
  const src = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // copy into the frame's realm so Emscripten sees its own typed array
  engine.FS.writeFile(from, new engine.frame.contentWindow.Uint8Array(src))
  const timeoutMs = opts.timeoutMs ?? CONVERT_TIMEOUT
  // a running WASM call cannot be stopped: cancel kills the engine frame
  const onAbort = () => {
    if (st.engine === engine) resetEngine('Cancelled', cancelledError)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        engine.jobs.delete(id)
        reject(
          new Error(
            `LibreOffice stopped responding on ${filename} (no result after ${Math.round(timeoutMs / 1000)} s). The engine was restarted: try again, or use Quick mode.`,
          ),
        )
        resetEngine('The LibreOffice engine was restarted after a hang.')
      }, timeoutMs)
      engine.jobs.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      const importFilter = IMPORT_FILTERS.find(([re]) => re.test(filename))?.[1]
      engine.thrPort.postMessage({ cmd: 'convert', id, from, to, filter, pdfA: !!opts.pdfA, importFilter, page: opts.page })
    })
    return new Uint8Array(engine.FS.readFile(to))
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (st.engine === engine) {
      for (const path of [from, to]) {
        try {
          engine.FS.unlink(path)
        } catch {
          /* never written */
        }
      }
    }
  }
}

// Converts any LibreOffice-supported document to PDF. Returns PDF bytes.
// opts.pdfA writes ISO-standard PDF/A-2b for archiving. opts.page =
// { width, height, margin } in 1/100 mm sets every page style (HTML input).
// opts.timeoutMs (default 5 min): past it the engine is killed and restarted.
// opts.signal: Cancel. Stops the download, the start or the conversion (the
// engine frame is killed; the next job starts it again from the cache).
// Jobs run one at a time, so the timeout only counts a job's own work.
export function convertToPdfHiFi(bytes, filename, onProgress = () => {}, opts = {}) {
  const job = st.queue.then(() => {
    if (opts.signal?.aborted) throw cancelledError()
    return runJob(bytes, filename, onProgress, opts)
  })
  st.queue = job.catch(() => {})
  return job
}
