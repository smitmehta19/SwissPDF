// HTML to PDF must never fetch anything (review integ-1 #6, #25). Runs the
// app's own sanitizeHtml + render frame (image path htmlToPdf, and the frame
// the high-fidelity path lays out in) in Chromium on HTML with tracking
// pixels hidden in ways a regex sanitizer misses, and checks that a local
// tracker server got no request at all.
// Usage: node scripts/corpus-test/fix1-html-sanitize.mjs [--lib /src/lib/htmlOps.js]
//   --lib: module path on the dev server (to run an older copy for comparison)
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { startServer } from './server.mjs'

const at = process.argv.indexOf('--lib')
const lib = at > 0 ? process.argv[at + 1] : '/src/lib/htmlOps.js'

const hits = []
const tracker = createServer((req, res) => {
  hits.push(req.url)
  res.setHeader('Content-Type', 'image/gif')
  res.end(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'))
})
await new Promise((r) => tracker.listen(0, '127.0.0.1', r))
const T = `http://127.0.0.1:${tracker.address().port}`

// id -> HTML. a-d are the four bypasses from the review, the rest are near
// variants.
const CASES = {
  'a-shadow-template': `<div><template shadowrootmode="open"><p>shadow</p><img src="${T}/a"></template>light</div>`,
  'b-image-set': `<div style='background-image: image-set("${T}/b" 1x); height:40px'>x</div>`,
  'c-css-escape': `<div style="background: \\75rl(${T}/c); height:40px">x</div>`,
  'd-escaped-import': `<style>@\\69mport "${T}/d";</style><p>x</p>`,
  'e-webkit-image-set-style-tag': `<style>.x{background-image:-webkit-image-set(url(${T}/e) 1x);height:40px}</style><div class="x">x</div>`,
  'f-svg-fill': `<svg width="40" height="40"><rect width="40" height="40" fill="url(${T}/f#p)"/></svg>`,
  'g-nested-template': `<div><template shadowrootmode="open"><div><template shadowrootmode="closed"><img src="${T}/g"></template></div></template></div>`,
  'h-ident-escape': `<div style="background: u\\rl(${T}/h); height:40px">x</div>`,
  'i-import-comment': `<style>@im/**/port url(${T}/i);</style><p>x</p>`,
  'j-font-face': `<style>@font-face{font-family:Z;src:\\75rl(${T}/j)}p{font-family:Z}</style><p>x</p>`,
}

const dev = await startServer()
const browser = await chromium.launch()
const context = await browser.newContext()
const seen = []
context.on('request', (r) => {
  if (r.url().startsWith(T)) seen.push(r.url())
})
const page = await context.newPage()
await page.goto(`${dev.url}/`, { waitUntil: 'load' })

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

for (const [id, html] of Object.entries(CASES)) {
  const before = hits.length
  const out = await page.evaluate(
    async ({ lib, html }) => {
      const m = await import(lib)
      const errs = []
      try {
        await m.htmlToPdf(html)
      } catch (e) {
        errs.push(`htmlToPdf: ${e.message}`)
      }
      // the frame the high-fidelity path lays out in (exported in new code)
      if (m.renderFrame) {
        const f = await m.renderFrame(m.sanitizeHtml(html), 700, { base: false })
        await new Promise((r) => setTimeout(r, 300))
        f.remove()
      }
      await new Promise((r) => setTimeout(r, 700))
      return { errs, hifiFrame: !!m.renderFrame }
    },
    { lib, html },
  )
  await new Promise((r) => setTimeout(r, 300))
  const got = hits.slice(before)
  check(`${id}: no request`, got.length === 0, got.length ? `tracker got ${got.join(', ')}` : out.errs.join('; '))
}

// the sanitizer on its own, in a plain frame without the CSP: each layer
// has to hold by itself
for (const [id, html] of Object.entries(CASES)) {
  const before = hits.length
  await page.evaluate(
    async ({ lib, html }) => {
      const m = await import(lib)
      const f = document.createElement('iframe')
      f.setAttribute('sandbox', 'allow-same-origin')
      f.srcdoc = '<!doctype html>' + m.sanitizeHtml(html).documentElement.outerHTML
      document.body.appendChild(f)
      await new Promise((r) => setTimeout(r, 800))
      f.remove()
    },
    { lib, html },
  )
  await new Promise((r) => setTimeout(r, 200))
  const got = hits.slice(before)
  check(`${id}: sanitizer alone, no request`, got.length === 0, got.join(', '))
}

// #25: script links with a tab or newline in the scheme
const hrefs = await page.evaluate(async (lib) => {
  const m = await import(lib)
  const doc = m.sanitizeHtml('<a id=a href="java&#9;script:alert(1)">a</a><a id=b href=" jav&#10;ascript:x">b</a><a id=c href="https://example.com/x">c</a><a id=d href="mailto:x@example.com">d</a>')
  return ['a', 'b', 'c', 'd'].map((id) => doc.getElementById(id).getAttribute('href'))
}, lib)
check('javascript: with tab removed', hrefs[0] === null, String(hrefs[0]))
check('javascript: with newline removed', hrefs[1] === null, String(hrefs[1]))
check('https and mailto links kept', hrefs[2] === 'https://example.com/x' && hrefs[3] === 'mailto:x@example.com', hrefs.slice(2).join(' '))

// shadow template content is kept as plain content, not dropped
const kept = await page.evaluate(async (lib) => (await import(lib)).sanitizeHtml('<div><template shadowrootmode="open"><p>shadow text</p></template></div>').body.textContent, lib)
check('shadow template text kept', /shadow text/.test(kept), kept)

check('network log (browser context) has no tracker request', seen.length === 0, seen.join(', '))
console.log(`tracker hits: ${hits.length}`)
await browser.close()
await dev.server.close()
tracker.close()
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
