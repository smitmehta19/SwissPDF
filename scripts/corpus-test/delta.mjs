// Compares two scorecards and appends a "Delta vs <base>" section to the new
// run's .md: rows that changed result, and what still fails grouped by the
// unit that owns the fix (docs/plans/2026-10-17-parity.md unit map).
// Usage: node scripts/corpus-test/delta.mjs <new.json> <base.json> [--write]
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const [newPath, basePath] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!newPath || !basePath) {
  console.error('usage: node scripts/corpus-test/delta.mjs <new.json> <base.json> [--write]')
  process.exit(2)
}
const cur = JSON.parse(readFileSync(newPath, 'utf8'))
const base = JSON.parse(readFileSync(basePath, 'utf8'))

// audit finding -> unit that fixes it
const UNIT_OF_AUDIT = {}
const units = {
  U0: [22, 42],
  U1: [1, 4, 5, 7, 8, 9, 12, 20, 30],
  U2: [35, 36, 37, 38, 40, 41],
  U3: [2, 3, 6, 10, 11, 13, 21, 23, 24, 25, 26, 27, 31, 32, 33, 34, 39],
  U4: [14, 15, 16, 17, 18, 19, 28, 29],
}
for (const [u, list] of Object.entries(units)) for (const n of list) UNIT_OF_AUDIT[n] = u
// fallback when a failing row links no finding: the unit that owns the tool
const UNIT_OF_TOOL = {
  intake: 'U1', merge: 'U1', split: 'U1', extract: 'U1', remove: 'U1', rotate: 'U1',
  pdf2img: 'U1', health: 'U1',
  organize: 'U3', compress: 'U3', repair: 'U3', watermark: 'U3', pagenumbers: 'U3', sign: 'U3',
  crop: 'U3', edit: 'U3', protect: 'U3', unlock: 'U3', ocr: 'U3', img2pdf: 'U3', redact: 'U3',
  forms: 'U3', compare: 'U3',
  pdf2word: 'U4', pdf2excel: 'U4', pdf2ppt: 'U4', pdf2md: 'U4', word2pdf: 'U4', excel2pdf: 'U4',
  ppt2pdf: 'U4', html2pdf: 'U4',
}
function unitOf(r) {
  const k = (r.checks ?? []).find((c) => !c.ok && !c.soft)
  const audit = k?.audit ?? r.audit
  if (audit && UNIT_OF_AUDIT[audit]) return { unit: UNIT_OF_AUDIT[audit], audit }
  return { unit: UNIT_OF_TOOL[r.tool] ?? '?', audit: audit ?? null }
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').replace(/\u2014/g, '-').slice(0, 300)
const byId = new Map(base.results.map((r) => [r.id, r]))
const fixed = []
const broke = []
const stillFail = []
const added = []
for (const r of cur.results) {
  const b = byId.get(r.id)
  if (!b) {
    added.push(r)
    continue
  }
  if (b.result !== 'PASS' && r.result === 'PASS') fixed.push([r, b])
  else if (b.result === 'PASS' && r.result !== 'PASS') broke.push([r, b])
  else if (r.result === 'FAIL') stillFail.push(r)
}
const gone = base.results.filter((b) => !cur.results.some((r) => r.id === b.id))
const newFails = added.filter((r) => r.result === 'FAIL')

const baseName = basename(basePath, '.json')
const L = []
L.push(`## Delta vs ${baseName}`, '')
L.push(`Baseline: ${base.totals.pass} PASS, ${base.totals.fail} FAIL, ${base.totals.skip} SKIP of ${base.results.length}. This run: ${cur.totals.pass} PASS, ${cur.totals.fail} FAIL, ${cur.totals.skip} SKIP of ${cur.results.length}.`)
L.push(`Same rows: ${cur.results.length - added.length}. FAIL->PASS: ${fixed.length}. PASS->FAIL: ${broke.length}. Still failing: ${stillFail.length}. New rows: ${added.length} (${added.length - newFails.length} pass, ${newFails.length} fail). Rows gone: ${gone.length}.`, '')

L.push(`### PASS->FAIL (regressions): ${broke.length}`, '')
if (broke.length) {
  L.push('| Case | Now | Baseline detail |', '|---|---|---|')
  for (const [r, b] of broke) L.push(`| ${cell(r.id)} | ${cell(r.detail)} | ${cell(b.detail)} |`)
} else L.push('None.')
L.push('')

L.push(`### FAIL->PASS: ${fixed.length}`, '')
if (fixed.length) {
  L.push('| Case | Was | Now |', '|---|---|---|')
  for (const [r, b] of fixed) L.push(`| ${cell(r.id)} | ${cell(b.detail)} | ${cell(r.detail)} |`)
}
L.push('')

const groups = new Map()
for (const r of [...stillFail, ...newFails]) {
  const { unit, audit } = unitOf(r)
  if (!groups.has(unit)) groups.set(unit, [])
  groups.get(unit).push({ r, audit, isNew: !byId.has(r.id) })
}
L.push(`### Still failing, by owning unit: ${stillFail.length + newFails.length}`, '')
L.push('Unit from the audit finding of the first failing check, else from the tool. New = row not in the baseline.', '')
for (const u of [...groups.keys()].sort()) {
  const list = groups.get(u)
  L.push(`#### ${u} (${list.length})`, '', '| Case | Audit | Detail |', '|---|---|---|')
  for (const { r, audit, isNew } of list) L.push(`| ${cell(r.id)}${isNew ? ' (new)' : ''} | ${audit ?? ''} | ${cell(r.detail)} |`)
  L.push('')
}

const text = L.join('\n')
if (process.argv.includes('--write')) {
  const md = newPath.replace(/\.json$/, '.md')
  const old = readFileSync(md, 'utf8')
  // drop an earlier delta section (it ends at the next level-2 heading)
  const cut = old.indexOf(`## Delta vs ${baseName}`)
  const end = cut >= 0 ? old.indexOf('\n## ', cut + 3) : -1
  const head = (cut >= 0 ? old.slice(0, cut).trimEnd() + (end >= 0 ? `\n${old.slice(end)}` : '') : old).trimEnd()
  // put the delta right after the per-tool summary, before the long row list
  const at = head.indexOf('\n## Audit findings')
  const out = at >= 0 ? `${head.slice(0, at)}\n\n${text}\n${head.slice(at)}\n` : `${head}\n\n${text}\n`
  writeFileSync(md, out)
  console.log(`delta written to ${md}`)
} else console.log(text)
