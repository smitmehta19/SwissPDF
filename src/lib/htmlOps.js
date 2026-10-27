// HTML → PDF, in-browser. Pasted HTML/markup or an uploaded .html file.
// Two paths:
// - htmlToPdfHiFi: LibreOffice Writer imports the HTML, so the PDF has real,
//   selectable text. Falls back to htmlToPdf when the engine can't run.
// - htmlToPdf: renders the page in a sandboxed frame and captures it as
//   images (no text layer), cutting pages between blocks.
// Both keep <head> styles and never fetch anything: scripts are removed and
// only inline (data:) images and styles are kept. Fetching arbitrary URLs is
// also blocked by browser CORS, so the user pastes the page source instead.
import { PDFDocument } from 'pdf-lib'

const A4_W = 794 // px at 96dpi
const A4_H = 1123

// Page sizes in 1/100 mm for the engine.
const ENGINE_PAGES = {
  a4: { width: 21000, height: 29700 },
  'a4-landscape': { width: 29700, height: 21000 },
  letter: { width: 21590, height: 27940 },
}

const isInline = (url) => /^\s*(data:|#)/i.test(url ?? '')

// The render frame may load nothing but inline data. Second line of defence
// behind the sanitizer: the browser blocks the request itself.
export const FRAME_CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:"

// CSS escapes (\75rl, @\69mport, u\rl) spell the same token as plain letters:
// decode them before testing. Escapes that would change the CSS structure
// (quotes, backslash, parens, newlines) stay escaped.
const decodeCssEscapes = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?|\\([^\n\r\f0-9a-f])/gi, (m, hex, ch) => {
      const c = hex ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 0xfffd, 0x10ffff)) : ch
      return /["'\\()\n\r\f;{}]/.test(c) ? m : c
    })

// Functions that take a URL or an image list. url() keeps data: and #frag;
// the others are dropped when any URL or string inside is not data:.
const URL_FUNCS = /(-webkit-image-set|image-set|cross-fade|image|element|src|url)\(/gi
function cleanCss(css) {
  let s = decodeCssEscapes(css).replace(/@import\b[^;]*;?/gi, '')
  let out = ''
  let i = 0
  URL_FUNCS.lastIndex = 0
  for (let m; (m = URL_FUNCS.exec(s)); ) {
    // skip matches inside an identifier (my-url( is not url()
    if (m.index > 0 && /[\w-]/.test(s[m.index - 1]) && !m[1].startsWith('-')) continue
    // find the matching close paren, ignoring parens in strings
    let depth = 1
    let j = m.index + m[0].length
    let quote = null
    for (; j < s.length && depth > 0; j++) {
      const c = s[j]
      if (quote) {
        if (c === '\\') j++
        else if (c === quote) quote = null
      } else if (c === '"' || c === "'") quote = c
      else if (c === '(') depth++
      else if (c === ')') depth--
    }
    const inner = s.slice(m.index + m[0].length, j - 1)
    const name = m[1].toLowerCase()
    const safe =
      name === 'url'
        ? /^\s*(['"]?)\s*(data:|#)/i.test(inner)
        : !/url\(/i.test(inner) && [...inner.matchAll(/(['"])([\s\S]*?)\1/g)].every((q) => /^\s*data:/i.test(q[2]))
    out += s.slice(i, m.index) + (safe ? s.slice(m.index, j) : 'none')
    i = j
    URL_FUNCS.lastIndex = j
  }
  return out + s.slice(i)
}

// Links in the output: only web, mail and phone links survive. Browsers drop
// tabs and newlines inside a scheme (java&#9;script:), so test without them.
function safeHref(value) {
  const v = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
  const scheme = v.match(/^([a-z][a-z0-9+.-]*):/i)
  return !scheme || ['http', 'https', 'mailto', 'tel'].includes(scheme[1].toLowerCase())
}

// Declarative shadow DOM (<template shadowrootmode>) is inert in DOMParser
// but attaches when the frame parses it, with content the walk below never
// saw. Shadow templates are unwrapped into plain content, other templates
// (invisible anyway) removed, so there is nothing left inside a template.
function flattenTemplates(doc) {
  for (let pass = 0; pass < 32; pass++) {
    const list = doc.querySelectorAll('template')
    if (!list.length) return
    for (const t of list) {
      if (!t.isConnected) continue
      if (t.hasAttribute('shadowrootmode') || t.hasAttribute('shadowroot')) t.replaceWith(doc.importNode(t.content, true))
      else t.remove()
    }
  }
  doc.querySelectorAll('template').forEach((t) => t.remove())
}

// Returns a parsed, inert copy of the HTML: no scripts or embeds, no event
// handlers, no remote resources. Images without a data: source become their
// alt text.
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  flattenTemplates(doc)
  doc.querySelectorAll('script,noscript,iframe,frame,frameset,object,embed,applet,base,link,meta,video,audio,source,track,portal,fencedframe').forEach((el) => el.remove())
  // SVG animation can set href (feImage, use, a) to a URL after the walk
  // below: nothing animates in a PDF, so drop it all
  for (const el of [...doc.querySelectorAll('*')]) {
    if (/^(animate|animatemotion|animatetransform|animatecolor|set|discard)$/.test(el.localName.toLowerCase())) el.remove()
  }
  doc.querySelectorAll('img,image,input[type=image]').forEach((el) => {
    const src = el.getAttribute('src') ?? el.getAttribute('href')
    if (/^\s*data:/i.test(src ?? '')) {
      el.removeAttribute('srcset')
      return
    }
    const alt = el.getAttribute('alt')
    if (alt) el.replaceWith(Object.assign(doc.createElement('span'), { textContent: alt }))
    else el.remove()
  })
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      else if (name === 'style') el.setAttribute('style', cleanCss(attr.value))
      else if (['src', 'srcset', 'background', 'poster', 'data', 'xlink:href'].includes(name) && !isInline(attr.value)) el.removeAttribute(attr.name)
      else if (name === 'href' && el.tagName !== 'A' && !isInline(attr.value)) el.removeAttribute(attr.name)
      else if (name === 'href' && !safeHref(attr.value)) el.removeAttribute(attr.name)
      else if (['srcdoc', 'action', 'formaction', 'ping', 'manifest', 'itemtype', 'cite', 'longdesc'].includes(name)) el.removeAttribute(attr.name)
      // SVG presentation attributes (fill, filter, mask) take url() too
      else if (/url\s*\(|image-set/i.test(decodeCssEscapes(attr.value))) el.setAttribute(attr.name, cleanCss(attr.value))
    }
  }
  doc.querySelectorAll('style').forEach((el) => {
    el.textContent = cleanCss(el.textContent)
  })
  return doc
}

function serialize(doc) {
  if (!doc.querySelector('meta[charset]')) {
    const meta = doc.createElement('meta')
    meta.setAttribute('charset', 'utf-8')
    doc.head.prepend(meta)
  }
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

function hexColor(css) {
  const m = css.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/)
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null
  return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')
}
const px2pt = (px) => `${Math.round(parseFloat(px) * 0.75 * 10) / 10}pt`

// Writer's HTML import only understands simple selectors and few properties.
// The browser has already resolved every rule (head <style>, classes,
// descendant selectors), so write the result back as inline styles and the
// old table attributes Writer reads (border, cellpadding, bgcolor, width).
function inlineComputedStyles(doc) {
  const win = doc.defaultView
  const bodyW = doc.body.getBoundingClientRect().width || 1
  for (const el of [doc.body, ...doc.body.querySelectorAll('*')]) {
    if (!el.isConnected) continue // inside a hidden element removed below
    const cs = win.getComputedStyle(el)
    const tag = el.tagName
    if (cs.display === 'none') {
      el.remove()
      continue
    }
    const out = [
      `font-family:${cs.fontFamily}`,
      `font-size:${px2pt(cs.fontSize)}`,
      `font-weight:${Number(cs.fontWeight) >= 600 ? 'bold' : 'normal'}`,
      `font-style:${cs.fontStyle}`,
    ]
    const color = hexColor(cs.color)
    if (color) out.push(`color:${color}`)
    const bg = hexColor(cs.backgroundColor)
    if (bg && bg !== '#ffffff') out.push(`background:${bg}`)
    if (cs.textDecorationLine && cs.textDecorationLine !== 'none') out.push(`text-decoration:${cs.textDecorationLine}`)
    if (/^(P|H[1-6]|DIV|LI|TD|TH|BLOCKQUOTE|PRE)$/.test(tag)) {
      out.push(`text-align:${cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign}`)
      out.push(`margin-top:${px2pt(cs.marginTop)}`, `margin-bottom:${px2pt(cs.marginBottom)}`)
      // a single coloured left/bottom rule (callouts, heading underlines)
      for (const side of ['Left', 'Bottom', 'Top']) {
        const w = parseFloat(cs[`border${side}Width`])
        const c = hexColor(cs[`border${side}Color`])
        if (w > 0 && c && cs[`border${side}Style`] !== 'none') out.push(`border-${side.toLowerCase()}:${px2pt(w)} solid ${c}`)
      }
      if (parseFloat(cs.paddingLeft) > 0 && tag !== 'LI') out.push(`padding-left:${px2pt(cs.paddingLeft)}`)
    }
    el.setAttribute('style', out.join(';'))
    if (tag === 'TABLE') {
      const cell = el.querySelector('td,th')
      const ccs = cell && win.getComputedStyle(cell)
      if (ccs && parseFloat(ccs.borderTopWidth) > 0 && ccs.borderTopStyle !== 'none') el.setAttribute('border', '1')
      if (ccs) el.setAttribute('cellpadding', String(Math.round(parseFloat(ccs.paddingTop) || 0)))
      el.setAttribute('cellspacing', cs.borderCollapse === 'collapse' ? '0' : String(Math.round(parseFloat(cs.borderSpacing) || 0)))
      const w = el.getBoundingClientRect().width / bodyW
      el.setAttribute('width', w > 0.97 ? '100%' : `${Math.round(w * 100)}%`)
    } else if (tag === 'TD' || tag === 'TH') {
      if (bg) el.setAttribute('bgcolor', bg)
      el.setAttribute('align', cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : cs.textAlign === 'center' ? 'center' : 'left')
    }
  }
  // the head rules are now inline; leaving them lets Writer apply them twice
  doc.querySelectorAll('style').forEach((el) => el.remove())
}

// HTML → PDF with real text through the LibreOffice engine (Writer HTML
// import, then PDF export). Supports what Writer's HTML import supports:
// headings, paragraphs, lists, tables (borders, widths, cell colours), fonts,
// colours, inline data: images, <head> <style> rules for elements and classes.
// No flexbox/grid or positioned layout: use htmlToPdf for pixel-exact pages.
// opts: { pageSize: 'a4' | 'a4-landscape' | 'letter', marginMm = 15,
//         fallback = true, onProgress(msg), onEngine(name, reason), signal }
// onEngine reports 'hifi', or 'quick' plus the reason when it fell back.
// Returns PDF bytes.
export async function htmlToPdfHiFi(html, opts = {}) {
  const { pageSize = 'a4', marginMm = 15, fallback = true, onProgress = () => {}, onEngine = () => {}, signal } = opts
  if (!html.trim()) throw new Error('Nothing to convert: paste some HTML first.')
  const lo = await import('./libreOffice.js')
  try {
    if (!lo.engineAvailable()) throw new Error('High-fidelity mode needs a cross-origin isolated page.')
    const size = ENGINE_PAGES[pageSize] ?? ENGINE_PAGES.a4
    // lay the page out at its printed width so % widths resolve the same way
    const widthPx = Math.round(((size.width - marginMm * 200) / 2540) * 96)
    const frame = await renderFrame(sanitizeHtml(html), widthPx, { base: false })
    let source
    try {
      inlineComputedStyles(frame.contentDocument)
      frame.contentDocument.querySelectorAll('meta[http-equiv]').forEach((el) => el.remove())
      source = new TextEncoder().encode(serialize(frame.contentDocument))
    } finally {
      frame.remove()
    }
    const page = { ...size, margin: Math.round(marginMm * 100) }
    const bytes = await lo.convertToPdfHiFi(source, 'page.html', onProgress, { page, signal })
    onEngine('hifi')
    return bytes
  } catch (err) {
    if (!fallback || err?.cancelled) throw err
    onEngine('quick', err.message)
    onProgress(`high-fidelity engine unavailable (${err.message}), using image capture`)
    return htmlToPdf(html, { pageSize, onProgress })
  }
}

// Renders the sanitized page in a sandboxed, script-less frame (its own CSS
// scope, so page styles can't touch the app). Resolves with the frame.
export async function renderFrame(doc, width, { base = true } = {}) {
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('csp', FRAME_CSP)
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${A4_H}px;border:0;background:#fff;`
  // default look for unstyled markup; the page's own rules come after and win
  const style = doc.createElement('style')
  style.textContent = base
    ? 'html{background:#fff}body{margin:0;padding:40px;font-family:Segoe UI,Arial,sans-serif;color:#111}'
    : 'body{margin:0}'
  doc.head.prepend(style)
  // the policy has to come before anything that could load
  doc.querySelectorAll('meta[http-equiv]').forEach((el) => el.remove())
  const csp = doc.createElement('meta')
  csp.setAttribute('http-equiv', 'Content-Security-Policy')
  csp.setAttribute('content', FRAME_CSP)
  doc.head.prepend(csp)
  frame.srcdoc = serialize(doc)
  await new Promise((resolve) => {
    frame.onload = resolve
    document.body.appendChild(frame)
  })
  await frame.contentDocument.fonts?.ready
  return frame
}

// Page cuts (px from the top) that fall between blocks where possible.
function pageCuts(body, pageH) {
  const total = Math.max(body.scrollHeight, body.getBoundingClientRect().height)
  // bottoms of leaf-ish blocks: a cut there splits no line
  const bottoms = []
  for (const el of body.querySelectorAll('p,li,tr,h1,h2,h3,h4,h5,h6,pre,blockquote,img,hr,dt,dd,figure,caption,div,section,article,table')) {
    const r = el.getBoundingClientRect()
    if (r.height > 0) bottoms.push(Math.ceil(r.bottom))
  }
  bottoms.sort((a, b) => a - b)
  const cuts = [0]
  let top = 0
  while (top + pageH < total) {
    const limit = top + pageH
    let best = -1
    for (const b of bottoms) {
      if (b > limit) break
      if (b > top + pageH * 0.5) best = b // never leave a page more than half empty
    }
    top = best > 0 ? best : limit
    cuts.push(top)
  }
  cuts.push(total)
  return cuts
}

// Image capture path: one html2canvas render per page slice (no huge canvas).
export async function htmlToPdf(html, { pageSize = 'a4', onProgress = () => {} } = {}) {
  if (!html.trim()) throw new Error('Nothing to convert: paste some HTML first.')
  const html2canvas = (await import('html2canvas')).default
  const landscape = pageSize === 'a4-landscape'
  const width = landscape ? A4_H : A4_W
  const pageH = landscape ? A4_W : A4_H
  const frame = await renderFrame(sanitizeHtml(html), width)
  try {
    onProgress('rendering page')
    const body = frame.contentDocument.body
    const cuts = pageCuts(body, pageH)
    const pdf = await PDFDocument.create()
    // PDF page in points, the frame width maps to the page width
    const ptPerPx = (landscape ? 841.89 : 595.28) / width
    const total = cuts.length - 1
    for (let i = 0; i < total; i++) {
      onProgress(`building page ${i + 1} of ${total}`)
      const y = cuts[i]
      const h = Math.max(1, cuts[i + 1] - y)
      const canvas = await html2canvas(frame.contentDocument.documentElement, {
        scale: 2,
        backgroundColor: '#ffffff',
        x: 0,
        y,
        width,
        height: h,
        windowWidth: width,
        windowHeight: pageH,
        logging: false,
      })
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      const img = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()))
      const page = pdf.addPage([width * ptPerPx, pageH * ptPerPx])
      page.drawImage(img, { x: 0, y: (pageH - h) * ptPerPx, width: width * ptPerPx, height: h * ptPerPx })
    }
    return pdf.save()
  } finally {
    frame.remove()
  }
}
