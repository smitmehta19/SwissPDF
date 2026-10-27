// Checks the structure of a linearized PDF (ISO 32000-1 Annex F) straight
// from its bytes, without the writer's code: linearization dict, both xref
// sections, /L /O /E /T /H, the order of the page sections and both hint
// tables. Returns a list of problems (empty = fine) and some facts.
// Usage as a script: node lin-check.mjs file.pdf
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const num = (s) => Number(s)

// Bit reader for the hint tables (big-endian, items padded to bytes).
class BitReader {
  constructor(bytes, at = 0) {
    this.b = bytes
    this.pos = at * 8
  }
  get(bits) {
    let v = 0
    for (let i = 0; i < bits; i++) {
      const byte = this.b[this.pos >> 3]
      if (byte === undefined) throw new Error('hint table runs past the stream')
      v = v * 2 + ((byte >> (7 - (this.pos & 7))) & 1)
      this.pos++
    }
    return v
  }
  align() {
    this.pos = Math.ceil(this.pos / 8) * 8
  }
}

// Simple dict parser good enough for xref trailers and small dicts: returns
// raw value strings for top-level keys.
function dictKeys(text) {
  const out = {}
  const re = /\/(\w+)\s*((?:\[[^\]]*\])|(?:\d+\s+\d+\s+R)|(?:-?[\d.]+)|(?:\/\w+)|(?:<<))/g
  // only top-level keys: walk depth
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('<<', i)) {
      depth++
      i++
      continue
    }
    if (text.startsWith('>>', i)) {
      depth--
      i++
      continue
    }
    if (depth === 1 && text[i] === '/') {
      re.lastIndex = i
      const m = re.exec(text)
      if (m && m.index === i) out[m[1]] = m[2]
    }
  }
  return out
}

// Text of the object starting at `at` ("n g obj ... endobj"), dict part only
// for streams. Returns { num, gen, dict, end, streamStart, streamLength }.
function objectAt(s, at) {
  const head = /^(\d+) (\d+) obj\s*/.exec(s.slice(at, at + 40))
  if (!head) return null
  const body = at + head[0].length
  const endObj = s.indexOf('endobj', body)
  const streamAt = s.indexOf('stream', body)
  const isStream = streamAt !== -1 && streamAt < endObj && s.slice(body, streamAt).trim().startsWith('<<')
  const dict = s.slice(body, isStream ? streamAt : endObj)
  let streamStart = null
  if (isStream) streamStart = streamAt + 6 + (s[streamAt + 6] === '\r' ? 2 : 1)
  return { num: num(head[1]), gen: num(head[2]), dict, end: endObj + 6, streamStart }
}

// Decoded data of a stream object (Flate, PNG predictors).
function streamData(bytes, o) {
  const d = dictKeys(o.dict)
  let data = Buffer.from(bytes.subarray(o.streamStart, o.streamStart + num(d.Length)))
  if (/\/Filter\s*\/FlateDecode/.test(o.dict)) data = inflateSync(data)
  const pred = num(/\/Predictor\s+(\d+)/.exec(o.dict)?.[1] ?? 1)
  if (pred >= 10) {
    const cols = num(/\/Columns\s+(\d+)/.exec(o.dict)?.[1] ?? 1)
    const rows = Math.floor(data.length / (cols + 1))
    const out = Buffer.alloc(rows * cols)
    let prev = Buffer.alloc(cols)
    for (let r = 0; r < rows; r++) {
      const f = data[r * (cols + 1)]
      const row = Buffer.from(data.subarray(r * (cols + 1) + 1, (r + 1) * (cols + 1)))
      for (let i = 0; i < cols; i++) {
        const a = i > 0 ? row[i - 1] : 0
        const b = prev[i]
        const c = i > 0 ? prev[i - 1] : 0
        if (f === 1) row[i] = (row[i] + a) & 255
        else if (f === 2) row[i] = (row[i] + b) & 255
        else if (f === 3) row[i] = (row[i] + ((a + b) >> 1)) & 255
        else if (f === 4) {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          row[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
        }
      }
      row.copy(out, r * cols)
      prev = row
    }
    data = out
  }
  return data
}

// Xref stream at `at`: entries type 'n' (offset), 'f', 'c' (in an object stream).
function readXrefStream(s, bytes, at) {
  const o = objectAt(s, at)
  if (!o || o.streamStart === null || !/\/Type\s*\/XRef/.test(o.dict)) return null
  const d = dictKeys(o.dict)
  const W = d.W.replace(/[[\]]/g, '').trim().split(/\s+/).map(num)
  const index = (d.Index ?? `[0 ${d.Size}]`).replace(/[[\]]/g, '').trim().split(/\s+/).map(num)
  const data = streamData(bytes, o)
  const rowLen = W[0] + W[1] + W[2]
  const field = (p, w, dflt) => {
    if (w === 0) return dflt
    let v = 0
    for (let i = 0; i < w; i++) v = v * 256 + data[p + i]
    return v
  }
  const entries = new Map()
  let row = 0
  for (let i = 0; i < index.length; i += 2) {
    for (let k = 0; k < index[i + 1]; k++, row++) {
      const p = row * rowLen
      const type = field(p, W[0], 1)
      const a = field(p + W[0], W[1], 0)
      const b = field(p + W[0] + W[1], W[2], 0)
      const objNum = index[i] + k
      if (type === 1) entries.set(objNum, { type: 'n', off: a, gen: b })
      else if (type === 2) entries.set(objNum, { type: 'c', stm: a, idx: b })
      else entries.set(objNum, { type: 'f' })
    }
  }
  return { entries, stream: true, trailer: d }
}

function readXref(s, at, bytes) {
  if (!s.startsWith('xref', at)) return readXrefStream(s, bytes, at)
  let p = at + 4
  const entries = new Map()
  const sub = /\s*(\d+) (\d+)\s*?\r?\n/y
  for (;;) {
    sub.lastIndex = p
    const m = sub.exec(s)
    if (!m) break
    const start = num(m[1])
    const count = num(m[2])
    p = sub.lastIndex
    for (let k = 0; k < count; k++) {
      const e = s.slice(p, p + 20)
      if (!/^\d{10} \d{5} [nf](\r\n| \r| \n)$/.test(e)) throw new Error(`bad xref entry at ${p}: ${JSON.stringify(e)}`)
      entries.set(start + k, { off: num(e.slice(0, 10)), gen: num(e.slice(11, 16)), type: e[17] })
      p += 20
    }
  }
  const t = s.indexOf('trailer', p)
  const tEnd = s.indexOf('startxref', t)
  return { entries, firstEntry: null, trailer: dictKeys(s.slice(t + 7, tEnd)), trailerAt: t, startxref: num(/startxref\s+(\d+)/.exec(s.slice(tEnd, tEnd + 40))[1]) }
}

const refNum = (v) => (v ? num(/^(\d+)\s+\d+\s+R$/.exec(v.trim())?.[1]) : null)
const refsOf = (text) => [...text.matchAll(/(\d+)\s+(\d+)\s+R\b/g)].map((m) => num(m[1]))

export function checkLinearized(bytes) {
  try {
    return checkUnsafe(bytes)
  } catch (err) {
    return { problems: [`could not read the structure: ${err.message}`], facts: {} }
  }
}

function checkUnsafe(bytes) {
  const s = Buffer.from(bytes).toString('latin1')
  const problems = []
  const bad = (msg) => problems.push(msg)
  const facts = {}
  if (!/^%PDF-\d\.\d/.test(s)) bad('no %PDF header at 0')
  // linearization dict: first object in the file
  const firstObj = /\d+ 0 obj/.exec(s.slice(0, 1024))
  if (!firstObj) return { problems: ['no object in the first 1024 bytes'], facts }
  const lin = objectAt(s, firstObj.index)
  const L = dictKeys(lin.dict)
  if (num(L.Linearized) !== 1) bad('first object is not a linearization dict')
  facts.L = num(L.L)
  if (num(L.L) !== bytes.length) bad(`/L ${L.L} != file length ${bytes.length}`)
  const H = (L.H ?? '').replace(/[[\]]/g, '').trim().split(/\s+/).map(num)
  const N = num(L.N)

  // first-page xref (table or stream) follows the dict
  const x1At = lin.end + /^\s*/.exec(s.slice(lin.end, lin.end + 4096))[0].length
  const x1 = readXref(s, x1At, bytes)
  if (!x1) return { problems: [...problems, 'no first-page xref after the linearization dict'], facts }
  const prev = num(x1.trailer.Prev)
  const x2 = readXref(s, prev, bytes)
  if (!x2) return { problems: [...problems, `/Prev ${prev} does not point at an xref table`], facts }
  const lastStart = num(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s.slice(-64))?.[1])
  if (lastStart !== x1At) bad(`last startxref ${lastStart} should point at the first-page xref ${x1At}`)
  const size = num(x1.trailer.Size)
  const all = new Map([...x2.entries, ...x1.entries])
  for (let k = 1; k < size; k++) if (!all.has(k)) bad(`object ${k} in no xref section`)
  for (const [k, e] of all) {
    if (e.type !== 'n') continue
    const o = objectAt(s, e.off)
    if (!o || o.num !== k) bad(`xref says object ${k} at ${e.off}, found ${o ? o.num : 'nothing'}`)
  }
  if (problems.length > 20) return { problems, facts }
  const off = (k) => all.get(k)?.off
  // objects inside object streams: { num, dict } with the object's text
  const stms = new Map()
  const packed = (k) => {
    const e = all.get(k)
    if (!stms.has(e.stm)) {
      const o = objectAt(s, off(e.stm))
      const data = streamData(bytes, o).toString('latin1')
      const d = dictKeys(o.dict)
      const head = data.slice(0, num(d.First)).trim().split(/\s+/).map(num)
      stms.set(e.stm, { data, first: num(d.First), head })
    }
    const st = stms.get(e.stm)
    const from = st.first + st.head[e.idx * 2 + 1]
    const to = e.idx * 2 + 3 < st.head.length ? st.first + st.head[e.idx * 2 + 3] : st.data.length
    if (st.head[e.idx * 2] !== k) throw new Error(`object stream ${e.stm} entry ${e.idx} is ${st.head[e.idx * 2]}, want ${k}`)
    return { num: k, dict: st.data.slice(from, to) }
  }
  const obj = (k) => (all.get(k)?.type === 'c' ? packed(k) : objectAt(s, off(k)))
  for (const [k, e] of all) if (e.type === 'c') obj(k)
  // /T: white space before the first main xref entry (table), or before the
  // main xref stream object (stream, as Acrobat writes it)
  const T = num(L.T)
  if (x2.stream) {
    if (!(T === prev - 1 && /\s/.test(s[T])) && T !== prev) bad(`/T ${T}, main xref stream at ${prev}`)
  } else {
    const mainFirst = s.indexOf('0000000000 65535 f', prev)
    if (T !== mainFirst - 1 || !/\s/.test(s[T])) bad(`/T ${T}, first main xref entry starts at ${mainFirst}`)
  }
  facts.xref = x2.stream ? 'stream' : 'table'
  facts.packed = [...all.values()].filter((e) => e.type === 'c').length
  // /Type of the dict itself, not of a nested one
  const typeName = (text) => dictKeys(text).Type?.slice(1)

  // page tree order
  const root = obj(refNum(x1.trailer.Root))
  const pagesNum = refNum(dictKeys(root.dict).Pages)
  const pageNums = []
  const walk = (k, depth = 0) => {
    if (depth > 50) return
    const d = obj(k).dict
    const type = typeName(d)
    if (type === 'Page') return void pageNums.push(k)
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(d)?.[1] ?? ''
    for (const r of refsOf(kids)) walk(r, depth + 1)
  }
  walk(pagesNum)
  facts.pages = pageNums.length
  if (N !== pageNums.length) bad(`/N ${N} != ${pageNums.length} pages`)
  if (num(L.O) !== pageNums[0]) bad(`/O ${L.O} is not the first page (${pageNums[0]})`)

  // first page section: the first page and what it uses are in the first-page
  // xref section and end before /E
  const E = num(L.E)
  const firstSection = new Set([...x1.entries.keys()])
  const closure = (start) => {
    const seen = new Set()
    const stack = [start]
    while (stack.length) {
      const k = stack.pop()
      if (seen.has(k) || !all.has(k)) continue
      const o = obj(k)
      const type = typeName(o.dict)
      // page content stops at other pages, the catalog and the structure tree
      if (k !== start && ['Page', 'Pages', 'Catalog', 'StructTreeRoot', 'StructElem', 'Outlines'].includes(type)) continue
      seen.add(k)
      for (const r of refsOf(o.dict.replace(/\/(Parent|P|B)\s+\d+\s+\d+\s+R/g, ''))) stack.push(r)
    }
    return seen
  }
  const p1 = closure(pageNums[0])
  for (const k of p1) {
    if (!firstSection.has(k)) bad(`first page object ${k} is not in the first-page xref section`)
    if (off(k) >= E) bad(`first page object ${k} at ${off(k)} is past /E ${E}`)
  }

  // hint stream
  const hint = objectAt(s, H[0])
  if (!hint || hint.streamStart === null) return { problems: [...problems, `/H ${H[0]} is not a stream object`], facts }
  // the length may include padding up to the next object
  if (H[0] + H[1] < hint.end || /\S/.test(s.slice(hint.end, H[0] + H[1]))) bad(`/H length ${H[1]}, object is ${hint.end + 1 - H[0]} bytes`)
  const hd = dictKeys(hint.dict)
  let data = Buffer.from(bytes.subarray(hint.streamStart, hint.streamStart + num(hd.Length)))
  if (/\/Filter\s*\/FlateDecode/.test(hint.dict)) data = inflateSync(data)
  const hintLen = H[1]
  // offsets in the hint tables ignore the hint stream itself
  const real = (o) => (o >= H[0] ? o + hintLen : o)

  // page offset hint table
  const r = new BitReader(data)
  const h = {
    minObj: r.get(32),
    firstPageAt: r.get(32),
    bObj: r.get(16),
    minLen: r.get(32),
    bLen: r.get(16),
    minCO: r.get(32),
    bCO: r.get(16),
    minCL: r.get(32),
    bCL: r.get(16),
    bShared: r.get(16),
    bSharedId: r.get(16),
    bNum: r.get(16),
    den: r.get(16),
  }
  const vec = (bits, n = N) => {
    const v = []
    for (let i = 0; i < n; i++) v.push(r.get(bits))
    r.align()
    return v
  }
  const nObj = vec(h.bObj).map((d) => d + h.minObj)
  const pLen = vec(h.bLen).map((d) => d + h.minLen)
  const nShared = vec(h.bShared)
  const sharedIds = nShared.map((n) => {
    const ids = []
    for (let i = 0; i < n; i++) ids.push(r.get(h.bSharedId))
    return ids
  })
  r.align()
  nShared.forEach((n) => {
    for (let i = 0; i < n; i++) r.get(h.bNum)
  })
  r.align()
  if (real(h.firstPageAt) !== off(pageNums[0])) bad(`hint: first page object at ${h.firstPageAt}, really ${off(pageNums[0])} (less hint ${hintLen})`)
  // each page section starts with its page object and is as long as the table says
  let at = h.firstPageAt
  const sorted = [...all.entries()].filter(([, e]) => e.type === 'n').map(([k, e]) => [e.off, k]).sort((a, b) => a[0] - b[0])
  for (let i = 0; i < N; i++) {
    const o = objectAt(s, real(at))
    if (!o || o.num !== pageNums[i]) {
      bad(`hint: page ${i + 1} section at ${at} holds object ${o?.num}, want page object ${pageNums[i]}`)
      break
    }
    // objects in [at, at + len)
    const from = real(at)
    const to = real(at + pLen[i])
    const inside = sorted.filter(([o2]) => o2 >= from && o2 < to && o2 !== H[0])
    if (inside.length !== nObj[i]) bad(`hint: page ${i + 1} has ${inside.length} objects in its section, table says ${nObj[i]}`)
    at += pLen[i]
    if (i === 0 && real(at) !== E) bad(`hint: first page section ends at ${real(at)}, /E is ${E}`)
    if (problems.length > 20) break
  }

  // shared object hint table
  const sOff = num(hd.S)
  const r2 = new BitReader(data, sOff)
  const sh = { firstObj: r2.get(32), firstAt: r2.get(32), nFirst: r2.get(32), nAll: r2.get(32), bGroup: r2.get(16), minLen: r2.get(32), bLen: r2.get(16) }
  const gLen = []
  for (let i = 0; i < sh.nAll; i++) gLen.push(r2.get(sh.bLen) + sh.minLen)
  r2.align()
  // first-page groups: objects of the first page section, in file order
  const firstObjs = sorted.filter(([o]) => o >= off(pageNums[0]) && o < E)
  if (sh.nFirst !== firstObjs.length) bad(`shared hint: ${sh.nFirst} first-page groups, section has ${firstObjs.length} objects`)
  const objLen = (k) => {
    const i = sorted.findIndex(([, kk]) => kk === k)
    const o = objectAt(s, sorted[i][0])
    return o.end + 1 - sorted[i][0]
  }
  firstObjs.forEach(([, k], i) => {
    if (i < gLen.length && objLen(k) !== gLen[i]) bad(`shared hint: group ${i} length ${gLen[i]}, object ${k} is ${objLen(k)} bytes`)
  })
  if (sh.nAll > sh.nFirst) {
    if (off(sh.firstObj) !== real(sh.firstAt)) bad(`shared hint: first shared object ${sh.firstObj} at ${sh.firstAt}, really ${off(sh.firstObj)}`)
    const start = sorted.findIndex(([, k]) => k === sh.firstObj)
    for (let i = sh.nFirst; i < sh.nAll; i++) {
      const [, k] = sorted[start + i - sh.nFirst] ?? []
      if (k === undefined || objLen(k) !== gLen[i]) {
        bad(`shared hint: group ${i} length ${gLen[i]}, object ${k} is ${k === undefined ? '-' : objLen(k)} bytes`)
        break
      }
    }
  }
  for (const [i, ids] of sharedIds.entries()) for (const id of ids) if (id >= sh.nAll) bad(`hint: page ${i + 1} names shared group ${id} of ${sh.nAll}`)
  // every object a page uses outside its own section must be a named shared group
  const groupOf = new Map()
  firstObjs.forEach(([, k], i) => groupOf.set(k, i))
  if (sh.nAll > sh.nFirst) {
    const start = sorted.findIndex(([, k]) => k === sh.firstObj)
    for (let i = sh.nFirst; i < sh.nAll; i++) groupOf.set(sorted[start + i - sh.nFirst]?.[1], i)
  }
  at = h.firstPageAt
  for (let i = 0; i < N && problems.length < 20; i++) {
    const from = real(at)
    const to = real(at + pLen[i])
    at += pLen[i]
    if (i === 0) continue
    const named = new Set(sharedIds[i])
    for (const k of closure(pageNums[i])) {
      const o = off(k)
      // packed objects are not part of any page section
      if (all.get(k)?.type === 'c' || (o >= from && o < to)) continue
      if (!named.has(groupOf.get(k))) bad(`page ${i + 1} uses object ${k} outside its section without naming it as shared`)
    }
  }
  facts.hint = { pageObjects: nObj.slice(0, 3), sharedGroups: sh.nAll, firstPageGroups: sh.nFirst }
  return { problems, facts }
}

if (process.argv[1]?.endsWith('lin-check.mjs') && process.argv[2]) {
  const res = checkLinearized(new Uint8Array(readFileSync(process.argv[2])))
  console.log(JSON.stringify(res, null, 1))
  process.exitCode = res.problems.length ? 1 : 0
}
