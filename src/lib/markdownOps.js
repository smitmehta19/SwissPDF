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
      if (p.size > body * 1.5 && raw.length < 200) {
        out.push(`# ${raw}`, '')
        headingCount++
        return
      }
      if (p.size > body * 1.2 && raw.length < 200) {
        out.push(`## ${raw}`, '')
        headingCount++
        return
      }
      const text = inlineText(runs)
      const bullet = raw.match(BULLET_RE)
      const numbered = raw.match(NUMBER_RE)
      if (bullet) out.push(`- ${text.replace(BULLET_RE, '')}`, '')
      else if (numbered) out.push(`${numbered[1]}. ${text.replace(NUMBER_RE, '')}`, '')
      else out.push(text, '')
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
  })

  const md = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
  return { text: md, pages: pages.length, tables: tableCount, headings: headingCount }
}
