// Dev utility: extracts a zip into a directory. Usage: node scripts/unzip.mjs <file.zip> <outDir>
import JSZip from 'jszip'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const [zipPath, outDir] = process.argv.slice(2)
const zip = await JSZip.loadAsync(await readFile(zipPath))
await mkdir(outDir, { recursive: true })
for (const [name, entry] of Object.entries(zip.files)) {
  if (entry.dir) continue
  await writeFile(join(outDir, name), await entry.async('uint8array'))
  console.log(`extracted: ${name}`)
}
