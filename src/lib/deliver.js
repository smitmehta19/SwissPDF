import { assertValidOutput } from './pdfOps.js'
import { zipBlob, zipStream } from './zip.js'
import { downloadBytes, formatBytes } from './download.js'

// Above this total the zip streams straight to a file the user picks (Chrome,
// Edge), so not even the finished zip has to sit in memory. Below it, or
// without the picker, the zip is built as a Blob (kept on disk by browsers).
const STREAM_TO_DISK = 256 * 1024 * 1024

// Saves many files as one ZIP. entries: [{ name, bytes }] (see zip.js; bytes
// may be a Blob or a function). size: expected total, picks the sink. Call it
// straight from a click: the save picker needs the user gesture.
// Returns { name, size } or null when the user closed the picker.
export async function saveZip(entries, zipName, { size = 0 } = {}) {
  if (size > STREAM_TO_DISK && typeof window !== 'undefined' && window.showSaveFilePicker) {
    let handle
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: zipName,
        types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
      })
    } catch (err) {
      if (err?.name === 'AbortError') return null
      handle = null // picker blocked: fall back to a Blob download
    }
    if (handle) {
      const writable = await handle.createWritable()
      await (await zipStream(entries)).pipeTo(writable)
      const file = await handle.getFile().catch(() => null)
      return { name: handle.name, size: file?.size ?? null }
    }
  }
  const blob = await zipBlob(entries)
  downloadBytes(blob, zipName, 'application/zip')
  return { name: zipName, size: blob.size }
}

// Downloads outputs: one file directly, many as ZIP. kind 'pdf' re-validates
// every output PDF first; kind 'binary' (images etc.) skips PDF validation.
// outputs: [{ name, bytes, mime? }]. Returns a status-line summary.
export async function deliverOutputs(outputs, zipName, { kind = 'pdf' } = {}) {
  if (outputs.length === 0) throw new Error('Nothing to download.')
  let totalPages = 0
  if (kind === 'pdf') {
    for (const out of outputs) {
      const { pageCount } = await assertValidOutput(out.bytes)
      totalPages += pageCount
    }
  }
  if (outputs.length === 1) {
    const out = outputs[0]
    downloadBytes(out.bytes, out.name, out.mime ?? 'application/pdf')
    const detail = kind === 'pdf' ? `${totalPages} page${totalPages === 1 ? '' : 's'}, ` : ''
    return `Created ${out.name} (${detail}${formatBytes(out.bytes.length)}) — download started.`
  }
  const { size } = await saveZip(outputs, zipName)
  const what = kind === 'pdf' ? `PDFs (${totalPages} pages total)` : 'files'
  return `Created ${outputs.length} ${what} in ${zipName} (${formatBytes(size)}) — download started.`
}
