import JSZip from 'jszip'

// files: [{ name, bytes }] -> zip file bytes
export async function makeZip(files) {
  const zip = new JSZip()
  for (const { name, bytes } of files) {
    zip.file(name, bytes)
  }
  return zip.generateAsync({ type: 'uint8array' })
}
