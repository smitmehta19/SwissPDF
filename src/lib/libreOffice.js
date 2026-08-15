// High-fidelity Office → PDF via LibreOffice compiled to WebAssembly (zetajs).
// The engine (~200MB) downloads once on first use from the ZetaOffice CDN and
// is cached by the browser. Documents themselves never leave the machine.

const FILTERS = [
  [/\.(docx?|odt|rtf|txt)$/i, 'writer_pdf_Export'],
  [/\.(xlsx?|ods|csv)$/i, 'calc_pdf_Export'],
  [/\.(pptx?|odp)$/i, 'impress_pdf_Export'],
  // A PDF re-export (e.g. PDF/A conversion) is handled by Draw, which is the
  // module LibreOffice uses to import PDF files.
  [/\.pdf$/i, 'draw_pdf_Export'],
]

export function filterForName(filename) {
  const hit = FILTERS.find(([re]) => re.test(filename))
  return hit ? hit[1] : null
}

let enginePromise = null
let nextJobId = 1
const jobs = new Map() // id -> { resolve, reject }

export function engineAvailable() {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
}

let engineReady = false
export function engineLoaded() {
  return engineReady
}

export function loadEngine(onProgress = () => {}) {
  if (!enginePromise) {
    enginePromise = (async () => {
      if (!engineAvailable()) {
        throw new Error(
          'The high-fidelity engine needs cross-origin isolation (COOP/COEP headers). Restart the dev server after the config change, or serve with the isolation service worker.',
        )
      }
      // zetaHelper expects a #qtcanvas element even for headless use.
      if (!document.getElementById('qtcanvas')) {
        const canvas = document.createElement('canvas')
        canvas.id = 'qtcanvas'
        canvas.style.cssText = 'position:fixed;left:-100000px;top:0;width:4px;height:4px;'
        canvas.width = 4
        canvas.height = 4
        document.body.appendChild(canvas)
      }
      onProgress('downloading LibreOffice engine (one-time, ~200 MB — cached after)')
      // Runtime URL import (outside Vite's module graph — the vendored helper
      // resolves its own zeta.js sibling via import.meta.url). BASE_URL makes
      // the paths work both locally ('/') and on GitHub Pages ('/SwissPDF/').
      const base = new URL(import.meta.env.BASE_URL, location.href)
      const helperUrl = new URL('vendor/zetajs/zetaHelper.js', base).toString()
      const { ZetaHelperMain } = await import(/* @vite-ignore */ helperUrl)
      const zHM = new ZetaHelperMain(new URL('vendor/lo_thread.js', base).toString(), {
        threadJsType: 'module',
        wasmPkg: 'free',
        blockPageScroll: false,
      })
      await new Promise((resolve, reject) => {
        const bootTimeout = setTimeout(
          () => reject(new Error('LibreOffice engine took too long to start.')),
          10 * 60 * 1000,
        )
        try {
          zHM.start(() => {
            onProgress('starting LibreOffice')
            zHM.thrPort.onmessage = (e) => {
              const msg = e.data
              if (msg.cmd === 'lo-ready') {
                clearTimeout(bootTimeout)
                resolve()
              } else if (msg.cmd === 'converted') {
                jobs.get(msg.id)?.resolve(msg.to)
                jobs.delete(msg.id)
              } else if (msg.cmd === 'convert-error') {
                jobs.get(msg.id)?.reject(new Error(msg.message))
                jobs.delete(msg.id)
              }
            }
          })
        } catch (err) {
          clearTimeout(bootTimeout)
          reject(err)
        }
      })
      engineReady = true
      return zHM
    })()
    enginePromise.catch(() => {
      enginePromise = null // allow retry after a failed boot
    })
  }
  return enginePromise
}

// Converts any LibreOffice-supported document to PDF. Returns PDF bytes.
// opts.pdfA writes ISO-standard PDF/A-2b for archiving.
export async function convertToPdfHiFi(bytes, filename, onProgress = () => {}, opts = {}) {
  const filter = filterForName(filename)
  if (!filter) throw new Error(`Unsupported file type: ${filename}`)
  const zHM = await loadEngine(onProgress)
  onProgress('converting')
  const id = nextJobId++
  const ext = filename.split('.').pop().toLowerCase()
  const from = `/tmp/swiss_in_${id}.${ext}`
  const to = `/tmp/swiss_out_${id}.pdf`
  zHM.FS.writeFile(from, new Uint8Array(bytes.slice(0)))
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        jobs.delete(id)
        reject(new Error('Conversion timed out.'))
      }, 5 * 60 * 1000)
      jobs.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      zHM.thrPort.postMessage({
        cmd: 'convert',
        id,
        from,
        to,
        filter,
        pdfA: !!opts.pdfA,
        importFilter: /\.pdf$/i.test(filename) ? 'draw_pdf_import' : undefined,
      })
    })
    const out = zHM.FS.readFile(to)
    return new Uint8Array(out)
  } finally {
    for (const path of [from, to]) {
      try {
        zHM.FS.unlink(path)
      } catch {
        /* never written */
      }
    }
  }
}
