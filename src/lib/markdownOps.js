// PDF → Markdown using the same layout analysis as PDF→Office: columns read
// in order, ruled and borderless tables as Markdown tables, heading levels
// from font size, bullets and numbered lists from line prefixes, bold/italic
// inline, repeating page headers/footers kept once.
import { extractDocument } from './pdfExtract.js'
import { layoutPage, buildParagraphs, paragraphRuns, detectFurniture, bodyFontSize, runsText } from './layout.js'

const escapeCell = (t) => t.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()

function inlineText(runs) {
  return runs
    .map((r) => {
      const text = r.text.trim()
      if (!text) return ''
      const lead = /^\s/.test(r.text) ? ' ' : ''
      const tail = /\s$/.test(r.text) ? ' ' : ''
      if (r.bold && r.italic) return `${lead}***${text}***${tail}`
      if (r.bold) return `${lead}**${text}**${tail}`
      if (r.italic) return `${lead}*${text}*${tail}`
      return r.text
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

// Big text that reads like a sentence or a list of names is not a heading:
// the arXiv licence banner, author lines.
// An all-caps headline may run longer (FDIC: 22 words).
const sentenceLike = (t) => /^\p{Ll}/u.test(t) || /,\s*$/.test(t) || (t.match(/,/g) ?? []).length >= 3 || t.split(/\s+/).length > (t === t.toUpperCase() ? 30 : 18)

// Page 1 of a paper: lines between the title and "Abstract" are authors and
// affiliations, not headings. Returns how many were turned back into text.
function demoteFrontMatter(out) {
  const heads = out.flatMap((l, i) => (/^#{1,2} /.test(l) ? [i] : []))
  const abs = heads.find((i) => /^#{1,2} abstract\b/i.test(out[i]))
  if (abs == null) return 0
  let n = 0
  for (const i of heads) {
    if (i <= heads[0] || i >= abs) continue
    out[i] = out[i].replace(/^#{1,2} /, '')
    n++
  }
  return n
}

const BULLET_RE = /^\s*([•·▪◦‣∙●○■□➢➤►*-])\s+/
const NUMBER_RE = /^\s*(\d{1,2})[.)]\s+/

export async function pdfToMarkdown(bytes, { onProgress = () => {}, pageRule = true } = {}) {
  onProgress('analyzing layout')
  const pages = await extractDocument(bytes)
  const body = bodyFontSize(pages)
  // headers/footers: keep the first copy, skip the repeats
  const furniture = detectFurniture(pages)
  const seen = new Set()
  furniture.forEach((f) => {
    for (const s of [...f.header, ...f.footer]) {
      if (seen.has(s.key)) continue
      seen.add(s.key)
      s.line.items.forEach((it) => f.skip.delete(it))
    }
  })
  const out = []
  let tableCount = 0
  let headingCount = 0

  pages.forEach((page, pi) => {
    onProgress(`converting page ${pi + 1} of ${pages.length}`)
    if (pi > 0 && pageRule) out.push('\n---\n')
    const { blocks } = layoutPage(page, { bodySize: body, skip: furniture[pi].skip })

    const emitParagraph = (p) => {
      const runs = paragraphRuns(p.lines)
      const raw = runsText(runs).trim()
      if (!raw) return
      const heading = raw.length < 200 && !sentenceLike(raw)
      if (heading && p.size > body * 1.5) {
        out.push(`# ${raw}`, '')
        headingCount++
        return
      }
      if (heading && p.size > body * 1.2) {
        out.push(`## ${raw}`, '')
        headingCount++
        return
      }
      const text = inlineText(runs)
      const bullet = raw.match(BULLET_RE)
      const numbered = raw.match(NUMBER_RE)
      if (bullet) out.push(`- ${text.replace(BULLET_RE, '')}`, '')
      else if (numbered) out.push(`${numbered[1]}. ${text.replace(NUMBER_RE, '')}`, '')
      // a line of text starting with "#" (#L #H in a BERT table) is not a heading
      else out.push(text.replace(/^#/, '\\#'), '')
    }

    let run = []
    const flush = () => {
      for (const p of buildParagraphs(run, body)) emitParagraph(p)
      run = []
    }
    for (const block of blocks) {
      if (block.type === 'line') {
        run.push(block)
        continue
      }
      flush()
      tableCount++
      const rows = block.table.rows.filter((r) => r.some((c) => c))
      if (rows.length > 0) {
        const width = Math.max(...rows.map((r) => r.length))
        const pad = (r) => Array.from({ length: width }, (_, i) => escapeCell(r[i] ?? ''))
        out.push(`| ${pad(rows[0]).join(' | ')} |`)
        out.push(`| ${Array(width).fill('---').join(' | ')} |`)
        for (const row of rows.slice(1)) out.push(`| ${pad(row).join(' | ')} |`)
        out.push('')
      }
    }
    flush()
    if (pi === 0) headingCount -= demoteFrontMatter(out)
  })

  const md = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
  return { text: md, pages: pages.length, tables: tableCount, headings: headingCount }
}
