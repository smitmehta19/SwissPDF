import { assertValidOutput } from './pdfOps.js'
import { makeZip } from './zip.js'
import { downloadBytes, formatBytes } from './download.js'

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
  const zipBytes = await makeZip(outputs)
  downloadBytes(zipBytes, zipName, 'application/zip')
  const what = kind === 'pdf' ? `PDFs (${totalPages} pages total)` : 'files'
  return `Created ${outputs.length} ${what} in ${zipName} (${formatBytes(zipBytes.length)}) — download started.`
}
