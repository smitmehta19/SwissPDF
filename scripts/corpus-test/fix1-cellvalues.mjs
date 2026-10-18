// Cell typing cases from the integration 1 review (#12, #21). Plain Node.
// Usage: node scripts/corpus-test/fix1-cellvalues.mjs [--lib <path to cellValues.js>]
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const at = process.argv.indexOf('--lib')
const lib = at > 0 ? resolve(process.argv[at + 1]) : new URL('../../src/lib/cellValues.js', import.meta.url)
const { typedCell, detectNumberLocale } = await import(at > 0 ? pathToFileURL(lib).href : lib.href)

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}
const show = (c) => JSON.stringify(c)
const point = { decimalComma: false, dayFirst: false }

// 12a: dotted version / section numbers stay text
for (const v of ['3.1.12', '1.2.10', '10.4.21']) {
  const c = typedCell(v, point)
  check(`${v} stays text`, c?.t === 's', show(c))
}
// a dotted date with a 4-digit year is still a date
{
  const c = typedCell('03.01.2012', { decimalComma: true, dayFirst: true })
  check('03.01.2012 is a date', c?.t === 'n' && c.z === 'dd.mm.yyyy' && c.v === 40911, show(c))
}

// 12b: a few "4,25" tokens do not flip a document with grouped thousands
{
  const texts = ['Amount 1,250', 'Total 12,000', 'Rates 4,25 and 7,10']
  const loc = detectNumberLocale(texts)
  check('review texts stay point-decimal', loc.decimalComma === false, show(loc))
  const a = typedCell('1,250', loc)
  const b = typedCell('12,000', loc)
  check('1,250 is 1250', a?.v === 1250, show(a))
  check('12,000 is 12000', b?.v === 12000, show(b))
}
// a real decimal-comma document still flips
{
  const loc = detectNumberLocale(['Summe 1.234,56 EUR', 'Netto 99,90', 'MwSt 18,98', 'Preis 4,25'])
  check('German amounts read as decimal comma', loc.decimalComma === true, show(loc))
  const c = typedCell('1.234,56', loc)
  check('1.234,56 is 1234.56', c?.v === 1234.56, show(c))
}
// one stray token is not enough
{
  const loc = detectNumberLocale(['Rate 4,25'])
  check('one comma token is not a majority', loc.decimalComma === false, show(loc))
}
// decimal comma document that also groups with commas somewhere
{
  const loc = detectNumberLocale(['1,50', '2,75', '3,10', '4,20', '5,99', 'Population 1,250'])
  const c = typedCell('1,250', loc)
  check('1,250 stays thousands when the document groups with commas', c?.v === 1250, `${show(loc)} ${show(c)}`)
}

// 21: hyphen date with a leading zero, sign before the currency
{
  const c = typedCell('01-15-2024', point)
  check('01-15-2024 is a date', c?.t === 'n' && c.v === 45306, show(c))
  const d = typedCell('-$5.00', point)
  check('-$5.00 is -5', d?.t === 'n' && d.v === -5, show(d))
  const e = typedCell('007123', point)
  check('007123 stays an ID', e?.t === 's', show(e))
  const f = typedCell('($1,234.00)', point)
  check('($1,234.00) is -1234', f?.v === -1234, show(f))
}

console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
