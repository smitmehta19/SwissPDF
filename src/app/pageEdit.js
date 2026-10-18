// Page editor output: one new PDF from a plan of tiles.
// plan: [{ src: 0-based source page | null for a blank page, rotate: 0|90|180|270 }]
// Source pages go through extractPages (keeps links, forms, outlines that
// still point at kept pages); blanks take the size of the page before them.
import { PDFDocument, degrees } from 'pdf-lib'
import { extractPages } from '../lib/pdfOps.js'

export async function applyPageEdits(bytes, plan) {
  const kept = plan.filter((t) => t.src !== null)
  if (kept.length === 0) throw new Error('Every page was deleted, nothing would be left.')
  const doc = await PDFDocument.load(await extractPages(bytes, kept.map((t) => t.src + 1)), { updateMetadata: false })
  // rotate the copied pages first, while their indices still match `kept`
  doc.getPages().forEach((page, i) => {
    const turn = kept[i].rotate % 360
    if (turn) page.setRotation(degrees((page.getRotation().angle + turn) % 360))
  })
  let at = 0
  for (const tile of plan) {
    if (tile.src === null) {
      const near = doc.getPage(Math.max(0, Math.min(at - 1, doc.getPageCount() - 1)))
      const { width, height } = near.getSize()
      const sideways = near.getRotation().angle % 180 !== 0
      doc.insertPage(at, sideways ? [height, width] : [width, height])
    }
    at++
  }
  return doc.save()
}
