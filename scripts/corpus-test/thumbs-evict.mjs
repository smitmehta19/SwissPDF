// Page preview cache: thumbnails of a removed file stop rendering and their
// object URLs are revoked; with 6 files rendering side by side the queue
// serves each file in blocks of pages, not page by page (each switch past the
// 4 open documents reopens a file). Runs on the dev server.
// Usage: node scripts/corpus-test/thumbs-evict.mjs
import { chromium } from 'playwright'
import { startServer } from './server.mjs'

const dev = await startServer()
const browser = await chromium.launch()
let fails = 0
try {
  const page = await browser.newPage()
  await page.goto(`${dev.url}/#/health`, { waitUntil: 'load', timeout: 120_000 })
  const res = await page.evaluate(async () => {
    const load = async (p) => new Uint8Array(await (await fetch(p)).arrayBuffer())
    const pv = await import('/src/components/PagePreview.jsx')
    const pt = await import('/src/lib/pdfText.js')
    const big = await load('/test-corpus/large/explorations-bible-lands-956pp-62MB.pdf')
    let last = null
    const unsub = pv.subscribeThumbs('big', big, 956, (s) => (last = s))
    while (!(last?.thumbs.filter(Boolean).length >= 3)) await new Promise((r) => setTimeout(r, 100))
    const urls = last.thumbs.filter(Boolean)
    const okBefore = (await fetch(urls[0])).ok
    pt.releasePdf(big)
    const countAt = last.thumbs.filter(Boolean).length
    await new Promise((r) => setTimeout(r, 4000))
    const countAfter = last.thumbs.filter(Boolean).length
    let revoked = false
    try {
      await fetch(urls[0])
    } catch {
      revoked = true
    }
    unsub()
    // six files at once: count how often the queue switches file
    const names = ['pdfjs-tracemonkey.pdf', 'arxiv-1810.04805-bert.pdf', 'arxiv-1512.03385-resnet.pdf', 'pdfjs-TAMReview.pdf', 'us-budget-2024.pdf', 'us-economic-report-president-2024.pdf']
    const files = await Promise.all(names.map((n) => load(`/test-corpus/reports/${n}`)))
    const t0 = performance.now()
    const order = []
    await Promise.all(files.map((b, k) => pt.renderThumbnails(b, 110, () => order.push(k), 1, 20)))
    const sixMs = performance.now() - t0
    const switches = order.filter((k, i) => i > 0 && k !== order[i - 1]).length
    return { okBefore, countAt, countAfter, revoked, sixMs: Math.round(sixMs), switches, pages: order.length }
  })
  const check = (name, ok, d) => {
    if (!ok) fails++
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${d}`)
  }
  check('thumbnail URL works before remove', res.okBefore, '')
  check('no thumbnails after remove', res.countAfter <= res.countAt, `${res.countAt} at remove, ${res.countAfter} 4 s later`)
  check('object URLs revoked on remove', res.revoked, '')
  check('6 files x 20 previews in blocks (<= 18 file switches)', res.pages >= 100 && res.switches <= 18, `${res.switches} switches over ${res.pages} pages, ${res.sixMs} ms`)
} finally {
  await browser.close()
  await dev.server?.close?.()
}
console.log(fails ? `${fails} failed` : 'all passed')
process.exit(fails ? 1 : 0)
