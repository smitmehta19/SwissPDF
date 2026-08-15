// PDF → Markdown using the same layout analysis as PDF→Office:
// heading levels from font size, real tables as Markdown tables, bullets and
// numbered lists detected from line prefixes, bold/italic preserved inline.
import { extractDocument, buildLines, detectTables } from './pdfExtract.js'

const escapeCell = (t) => t.replace(/\|/g, '\\|').trim()

function inlineText(items) {
  // merge items into styled runs, then emit markdown emphasis
  const runs = []
  for (const it of items) {
    const prev = runs[runs.length - 1]
    if (prev && prev.bold === it.bold && prev.italic === it.italic) {
      prev.text += (it.x - prev.endX > 1 ? ' ' : '') + it.text
      prev.endX = it.x + it.width
    } else {
      runs.push({ text: it.text, bold: it.bold, italic: it.italic, endX: it.x + it.width })
    }
  }
  return runs
    .map((r) => {
      const text = r.text.trim()
      if (!text) return ''
      if (r.bold && r.italic) return `***${text}***`
      if (r.bold) return `**${text}**`
      if (r.italic) return `*${text}*`
      return text
    })
    .filter(Boolean)
    .join(' ')
}

const BULLET_RE = /^\s*([•·▪◦‣∙*-]|•)\s+/
const NUMBER_RE = /^\s*(\d{1,2})[.)]\s+/

export async function pdfToMarkdown(bytes, { onProgress = () => {}, pageRule = true } = {}) {
  onProgress('analyzing layout')
  const pages = await extractDocument(bytes)
  const sizes = pages.flatMap((p) => p.items.map((i) => i.size)).sort((a, b) => a - b)
  const body = sizes[Math.floor(sizes.length / 2)] || 12
  const out = []
  let tableCount = 0
  let headingCount = 0

  pages.forEach((page, pi) => {
    onProgress(`converting page ${pi + 1} of ${pages.length}`)
    if (pi > 0 && pageRule) out.push('\n---\n')
    const { tables, usedItems } = detectTables(page)
    const lines = buildLines(page.items.filter((it) => !usedItems.has(it)))
    const blocks = [
      ...tables.map((t) => ({ top: t.top, type: 'table', table: t })),
      ...lines.map((l) => ({ top: l.y, type: 'line', line: l })),
    ].sort((a, b) => b.top - a.top)

    let paragraph = []
    const flush = () => {
      if (paragraph.length === 0) return
      out.push(paragraph.join(' '))
      out.push('')
      paragraph = []
    }

    let prev = null
    for (const block of blocks) {
      if (block.type === 'table') {
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
        prev = null
        continue
      }
      const line = block.line
      const raw = line.items.map((i) => i.text).join(' ').trim()
      if (!raw) continue
      const text = inlineText(line.items)

      // headings: notably larger than body text
      if (line.size > body * 1.5) {
        flush()
        out.push(`# ${raw}`)
        out.push('')
        headingCount++
        prev = line
        continue
      }
      if (line.size > body * 1.2) {
        flush()
        out.push(`## ${raw}`)
        out.push('')
        headingCount++
        prev = line
        continue
      }
      // lists
      const bullet = raw.match(BULLET_RE)
      const numbered = raw.match(NUMBER_RE)
      if (bullet) {
        flush()
        out.push(`- ${text.replace(BULLET_RE, '')}`)
        prev = line
        continue
      }
      if (numbered) {
        flush()
        out.push(`${numbered[1]}. ${text.replace(NUMBER_RE, '')}`)
        prev = line
        continue
      }
      // paragraph flow: break on vertical gaps
      if (prev && prev.y - line.y > line.size * 1.9) flush()
      paragraph.push(text)
      prev = line
    }
    flush()
  })

  const md = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
  return { text: md, pages: pages.length, tables: tableCount, headings: headingCount }
}
