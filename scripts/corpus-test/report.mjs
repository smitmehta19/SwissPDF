// Writes the scorecard: <name>.json (full results) and <name>.md (per-tool
// summary, audit findings confirmed / not reproduced, then every row).
import { writeFileSync as writeOnce } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { AUDIT, AUDIT_NOT_TESTABLE } from './cases.mjs'

// OneDrive / antivirus can lock a file for a moment on Windows: retry a few times.
function writeFileSync(path, data) {
  for (let i = 0; ; i++) {
    try {
      return writeOnce(path, data)
    } catch (err) {
      if (i >= 5) throw err
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
    }
  }
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').replace(/\u2014/g, '-').slice(0, 400)
const secs = (ms) => (ms == null ? '' : `${(ms / 1000).toFixed(1)}s`)

// Evidence per audit finding from case-level and check-level links.
export function auditStatus(results) {
  const ev = new Map()
  const add = (n, kind, text) => {
    if (!ev.has(n)) ev.set(n, { confirmed: [], warned: [], notRepro: [] })
    ev.get(n)[kind].push(text)
  }
  for (const r of results) {
    if (r.result === 'SKIP') continue
    let linked = false
    for (const k of r.checks ?? []) {
      if (!k.audit) continue
      linked = true
      if (k.ok) add(k.audit, 'notRepro', `${r.id}: ${k.name}`)
      else add(k.audit, k.soft ? 'warned' : 'confirmed', `${r.id}: ${k.name}${k.detail ? ` (${k.detail})` : ''}`)
    }
    if (r.audit && !linked) {
      if (r.result === 'FAIL') add(r.audit, 'confirmed', `${r.id}: ${r.detail}`)
      else add(r.audit, 'notRepro', `${r.id}: passed`)
    } else if (r.audit && r.result === 'FAIL' && r.error) {
      add(r.audit, 'confirmed', `${r.id}: ${r.detail}`)
    }
  }
  return Object.keys(AUDIT).map((k) => {
    const n = +k
    const e = ev.get(n)
    // only a failed hard check confirms a finding; soft-only failures are
    // reported as SOFT WARN so a noisy probe never reads as a broken feature
    let status = 'NOT TESTED'
    if (e?.confirmed.length) status = 'CONFIRMED'
    else if (e?.warned.length) status = 'SOFT WARN'
    else if (e?.notRepro.length) status = 'NOT REPRODUCED'
    return {
      n,
      title: AUDIT[n],
      status,
      evidence: e?.confirmed.length ? e.confirmed : e?.warned.length ? e.warned : e?.notRepro ?? [],
      passedChecks: e?.notRepro.length ?? 0,
      reason: status === 'NOT TESTED' ? AUDIT_NOT_TESTABLE[n] ?? 'no corpus case' : null,
    }
  })
}

export function writeReport(results, { name, startedAt, finishedAt, command, dir }) {
  const tools = [...new Set(results.map((r) => r.tool))]
  const summary = tools.map((t) => {
    const rs = results.filter((r) => r.tool === t)
    const n = (v) => rs.filter((r) => r.result === v).length
    return { tool: t, pass: n('PASS'), fail: n('FAIL'), skip: n('SKIP'), ms: rs.reduce((a, r) => a + (r.ms ?? 0), 0) }
  })
  const audit = auditStatus(results)
  const totals = { pass: 0, fail: 0, skip: 0 }
  for (const r of results) totals[r.result.toLowerCase()]++
  const env = {
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpus: os.cpus().length,
    memGB: Math.round(os.totalmem() / 2 ** 30),
  }
  const json = { name, startedAt, finishedAt, durationMin: +((finishedAt - startedAt) / 60000).toFixed(1), command, env, totals, summary, audit, results }
  const jsonPath = join(dir, `${name}.json`)
  // app messages carry em dashes; keep result files plain
  writeFileSync(jsonPath, JSON.stringify(json, null, 2).replace(/\u2014/g, '-'))

  const L = []
  L.push(`# Corpus scorecard: ${name}`)
  L.push('')
  L.push(`Run: ${startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC, ${json.durationMin} min. Command: \`${command}\`.`)
  L.push(`Env: Node ${env.node}, ${env.platform}, ${env.cpus} CPUs, ${env.memGB} GB RAM, Chromium (Playwright, headless).`)
  L.push(`Totals: **${totals.pass} PASS, ${totals.fail} FAIL, ${totals.skip} SKIP** of ${results.length} rows.`)
  L.push('')
  L.push('Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).')
  L.push('')
  L.push('## Per-tool summary')
  L.push('')
  L.push('| Tool | Pass | Fail | Skip | Time |')
  L.push('|---|---|---|---|---|')
  for (const s of summary) L.push(`| ${s.tool} | ${s.pass} | ${s.fail} | ${s.skip} | ${secs(s.ms)} |`)
  L.push('')
  L.push('## Audit findings (docs/research/swisspdf-audit.md)')
  L.push('')
  L.push('| # | Finding | Status | Evidence |')
  L.push('|---|---|---|---|')
  for (const a of audit) {
    const evidence =
      a.status === 'NOT TESTED'
        ? a.reason
        : a.status === 'CONFIRMED'
          ? a.evidence.slice(0, 3).join('<br>') + (a.evidence.length > 3 ? `<br>(+${a.evidence.length - 3} more)` : '')
          : a.status === 'SOFT WARN'
            ? `soft only, ${a.passedChecks} linked check(s) passed; warn: ${a.evidence.slice(0, 2).join('; ')}${a.evidence.length > 2 ? ` (+${a.evidence.length - 2} more)` : ''}`
            : `${a.passedChecks} linked check(s) passed, e.g. ${a.evidence.slice(0, 2).join('; ')}`
    L.push(`| ${a.n} | ${cell(a.title)} | ${a.status} | ${cell(evidence).replace(/&lt;br&gt;/g, '<br>')} |`)
  }
  L.push('')
  const fails = results.filter((r) => r.result === 'FAIL')
  if (fails.length) {
    L.push('## Failures by tool')
    L.push('')
    for (const t of tools) {
      const f = fails.filter((r) => r.tool === t)
      if (!f.length) continue
      L.push(`- **${t}** (${f.length}): ${f.slice(0, 6).map((r) => `\`${r.id}\` ${cell(r.detail).slice(0, 120)}`).join('; ')}${f.length > 6 ? `; +${f.length - 6} more` : ''}`)
    }
    L.push('')
  }
  L.push('## All rows')
  L.push('')
  L.push('| Tool | File | Result | Detail | Time |')
  L.push('|---|---|---|---|---|')
  for (const r of results) {
    const files = (r.files ?? []).map((f) => f.split('/').pop()).join(' + ') || '-'
    const heap = r.heapMB ? `, heap ${r.heapMB} MB` : ''
    L.push(`| ${r.tool} | ${cell(files)}<br><sub>${cell(r.id)}</sub> | ${r.result} | ${cell(r.detail)} | ${secs(r.ms)}${heap} |`)
  }
  L.push('')
  const mdPath = join(dir, `${name}.md`)
  writeFileSync(mdPath, L.join('\n'))
  return { md: mdPath, json: jsonPath }
}
