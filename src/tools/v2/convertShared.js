// Helpers shared by the convert tools (group G4).
import { useEffect, useState } from 'react'
import { getBytes } from '../../app/fileStore.js'

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

// "report.final.docx" -> "report.final"
export const stem = (name) => name.replace(/\.[^.]+$/, '')

export const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
}

// Progress for page-based work: lib ops report "page 3 of 10" style text.
// before = pages finished in earlier files, total = all pages of the run.
// Also the cancel point: ctx.check() throws inside the op once cancelled.
export function pageProgress(ctx, before, total, name) {
  return (msg = '') => {
    ctx.check()
    const m = /(\d+) of (\d+)/.exec(msg)
    const inFile = m ? Math.max(0, Number(m[1]) - 1) : 0
    ctx.progress(Math.min(total, before + inFile), total, `${name}: ${msg}`)
  }
}

// Boots the LibreOffice engine with a real download bar. Returns the module.
// Throws when the page cannot run it (not cross-origin isolated).
export async function loadOfficeEngine(ctx) {
  const lo = await import('../../lib/libreOffice.js')
  if (!lo.engineAvailable()) throw new Error('This browser tab cannot run the Office engine (it needs a cross-origin isolated page).')
  if (lo.engineLoaded()) return lo
  const mb = lo.ENGINE_BUILD.downloadMB
  ctx.progress(0, mb, 'Loading the Office engine')
  await lo.loadEngine((msg, info) => {
    if (info?.phase === 'download') ctx.progress(Math.round((info.percent / 100) * mb), mb, 'MB of the Office engine, cached after the first time')
    else if (info?.phase === 'start') ctx.progress(mb, mb, 'Starting the Office engine')
  }, { signal: ctx.signal })
  ctx.check()
  return lo
}

// True when the next run needs no engine download (running or cached).
export async function officeEngineCached() {
  const lo = await import('../../lib/libreOffice.js')
  return lo.engineCached()
}

// Scanned PDFs (no text layer on the first pages) need OCR before a text
// conversion. Checked once per file and kept for the session.
const scanCache = new Map() // file id -> Promise<boolean>
function looksScanned(file) {
  if (!scanCache.has(file.id)) {
    scanCache.set(
      file.id,
      (async () => {
        const { openPdfDocument, serializedPdfOp } = await import('../../lib/pdfText.js')
        const bytes = await getBytes(file.id)
        return serializedPdfOp(async () => {
          const doc = await openPdfDocument(bytes)
          const n = Math.min(3, doc.numPages)
          let chars = 0
          for (let i = 1; i <= n; i++) {
            const page = await doc.getPage(i)
            const text = await page.getTextContent()
            chars += text.items.reduce((s, it) => s + (it.str?.trim().length ?? 0), 0)
          }
          return chars < 20 * n
        })
      })().catch(() => false),
    )
  }
  return scanCache.get(file.id)
}

// Names of the selected files that look scanned.
export function useScannedNames(files) {
  const [names, setNames] = useState([])
  const key = files.map((f) => f.id).join('|')
  useEffect(() => {
    let active = true
    Promise.all(files.map(async (f) => ((await looksScanned(f)) ? f.name : null))).then((list) => active && setNames(list.filter(Boolean)))
    return () => {
      active = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return names
}
