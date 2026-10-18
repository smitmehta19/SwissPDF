// ZIP output, streamed: client-zip (MIT) builds the archive one entry at a
// time, so a 1000-file split never holds every file plus the zip in memory.
// Entries: [{ name, bytes }] where bytes is a Uint8Array, a Blob, or a
// function returning one (read only when the zip reaches that entry).

async function* inputs(entries) {
  const taken = new Set()
  for (const e of entries) {
    const data = typeof e.bytes === 'function' ? await e.bytes() : e.bytes
    yield { name: uniqueName(e.name, taken), input: data, lastModified: new Date() }
  }
}

// Same name twice in one zip would overwrite on extract: add " (2)".
function uniqueName(name, taken) {
  let out = name
  for (let i = 2; taken.has(out.toLowerCase()); i++) out = name.replace(/(\.[^.]*)?$/, ` (${i})$1`)
  taken.add(out.toLowerCase())
  return out
}

// ReadableStream of the zip bytes.
export async function zipStream(entries) {
  const { downloadZip } = await import('client-zip')
  return downloadZip(inputs(entries)).body
}

// Zip as a Blob. Chrome and Firefox keep large Blobs on disk, not in the heap.
export async function zipBlob(entries) {
  const { downloadZip } = await import('client-zip')
  const blob = await downloadZip(inputs(entries)).blob()
  return new Blob([blob], { type: 'application/zip' })
}

// files: [{ name, bytes }] -> zip file bytes (small zips: tests, self-check)
export async function makeZip(files) {
  return new Uint8Array(await (await zipBlob(files)).arrayBuffer())
}
