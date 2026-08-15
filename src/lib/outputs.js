import { downloadBytes } from './download.js'

// Delivers one or many processed files: a single PDF downloads directly,
// multiple files are bundled into a ZIP (built locally, like everything else).
export async function deliverOutputs(outputs, zipName) {
  if (outputs.length === 1) {
    downloadBytes(outputs[0].bytes, outputs[0].name)
    return `${outputs[0].name} — download started.`
  }
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const out of outputs) zip.file(out.name, out.bytes)
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBytes(blob, zipName, 'application/zip')
  return `${outputs.length} files zipped into ${zipName} — download started.`
}
