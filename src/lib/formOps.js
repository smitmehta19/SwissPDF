// Interactive PDF forms: detect existing fields, fill them, add new ones,
// and flatten (bake values in so they can no longer be edited).
// Field geometry is in points on the visible page as displayed (y from top).
//
// XFA: many government forms carry an XFA copy of the form next to the
// AcroForm fields. Viewers that read XFA (Acrobat) show the XFA data and ignore
// what we fill in, so filling removes the XFA part. Dynamic XFA forms have no
// AcroForm fields at all; they cannot be filled here (formInfo says so).
import {
  PDFArray,
  PDFButton,
  PDFCheckBox,
  PDFDict,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFSignature,
  PDFStream,
  PDFTextField,
  TextAlignment,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  translate,
} from 'pdf-lib'
import { loadPdf } from './pdfOps.js'
import { pageFrame, placeBox, userRectToView } from './pageFrame.js'
import { fontForText } from './fonts.js'

// Non-ASCII values may need a Noto font for their appearance stream.
const needsFont = (v) => /[^ -~\r\n\t]/.test(String(v ?? ''))

// instanceof, not constructor.name: minified builds rename pdf-lib classes.
const typeOf = (field) => {
  if (field instanceof PDFTextField) return 'text'
  if (field instanceof PDFCheckBox) return 'checkbox'
  if (field instanceof PDFDropdown) return 'dropdown'
  if (field instanceof PDFRadioGroup) return 'radio'
  if (field instanceof PDFOptionList) return 'optionlist'
  if (field instanceof PDFButton) return 'button'
  if (field instanceof PDFSignature) return 'signature'
  return 'other'
}

// ---------- XFA ----------

function acroFormDict(doc) {
  try {
    return doc.catalog.lookup(PDFName.of('AcroForm'))
  } catch {
    return null
  }
}

// Read before doc.getForm(): pdf-lib's getForm deletes the XFA entry itself.
function hasXfa(doc) {
  const af = acroFormDict(doc)
  if (!af?.get?.(PDFName.of('XFA'))) return null
  return { needsRendering: String(doc.catalog.get(PDFName.of('NeedsRendering')) ?? '') === 'true' }
}

// 'static' (XFA next to real AcroForm fields) | 'dynamic' (XFA only)
function xfaKind(xfa, fieldCount) {
  return fieldCount === 0 || xfa.needsRendering ? 'dynamic' : 'static'
}

// Drops the XFA copy so every viewer shows the AcroForm values we wrote.
// Call it before doc.getForm() (getForm deletes the /XFA key itself, so the
// result would say nothing was removed). The XFA streams, with the old
// values, go with dropLooseObjects before save: only when nothing else
// still points at them.
function stripXfa(doc) {
  const af = acroFormDict(doc)
  let removed = false
  if (af?.get?.(PDFName.of('XFA'))) {
    af.delete(PDFName.of('XFA'))
    removed = true
  }
  if (doc.catalog.get(PDFName.of('NeedsRendering'))) {
    doc.catalog.delete(PDFName.of('NeedsRendering'))
    removed = true
  }
  return removed
}

// pdf-lib saves every object it loaded, also the ones nothing points to any
// more: XFA streams of older revisions, removed fields. Drops everything the
// trailer does not reach, so stale form data does not ride along.
function dropLooseObjects(doc) {
  const { context } = doc
  const seen = new Set()
  const { Root, Info, Encrypt } = context.trailerInfo
  const stack = [Root, Info, Encrypt]
  while (stack.length) {
    let obj = stack.pop()
    if (obj instanceof PDFRef) {
      if (seen.has(obj)) continue
      seen.add(obj)
      obj = context.lookup(obj)
    }
    if (obj instanceof PDFStream) obj = obj.dict
    if (obj instanceof PDFDict) for (const [, v] of obj.entries()) stack.push(v)
    else if (obj instanceof PDFArray) stack.push(...obj.asArray())
  }
  for (const [ref] of context.enumerateIndirectObjects()) if (!seen.has(ref)) context.delete(ref)
}

// ---------- widget -> page ----------

// One pass over every page's annotations, instead of a scan per widget.
function widgetPages(doc) {
  const pages = doc.getPages()
  const byRef = new Map()
  const byDict = new Map()
  const byPageRef = new Map(pages.map((p, i) => [p.ref, i]))
  pages.forEach((page, i) => {
    const annots = page.node.Annots?.()
    if (!annots) return
    for (let a = 0; a < annots.size(); a++) {
      const entry = annots.get(a)
      if (entry instanceof PDFRef) {
        byRef.set(entry.toString(), i)
        const dict = doc.context.lookup(entry)
        if (dict) byDict.set(dict, i)
      } else if (entry) byDict.set(entry, i)
    }
  })
  return (widget) => {
    const i = byDict.get(widget.dict)
    if (i !== undefined) return i
    const ref = doc.context.getObjectRef(widget.dict)
    if (ref && byRef.has(ref.toString())) return byRef.get(ref.toString())
    const p = widget.dict.get(PDFName.of('P'))
    if (p && byPageRef.has(p)) return byPageRef.get(p)
    return -1
  }
}

function readValue(field, type) {
  let value = ''
  let options
  try {
    if (type === 'text') value = field.isRichFormatted() ? richPlain(field) : (field.getText() ?? '')
    else if (type === 'checkbox') value = field.isChecked() ? 'on' : ''
    else if (type === 'dropdown' || type === 'optionlist') {
      value = (field.getSelected() ?? [])[0] ?? ''
      options = field.getOptions()
    } else if (type === 'radio') {
      value = field.getSelected() ?? ''
      options = field.getOptions()
    }
  } catch {
    /* unreadable field value */
  }
  return { value, options }
}

// Plain /V of a rich text field (pdf-lib refuses to read those).
function richPlain(field) {
  const v = field.acroField.dict.lookup(PDFName.of('V'))
  return v?.decodeText?.() ?? ''
}

function openForm(doc) {
  try {
    return doc.getForm()
  } catch {
    return null
  }
}

// Returns one entry PER WIDGET (a radio group yields one per option):
// { name, type, value, options, widgetOption, pageIndex, x, y (from top), w, h }
// with x, y, w, h on the visible page.
export async function listFields(bytes) {
  return (await inspectForm(bytes)).fields
}

// listFields plus { xfa: 'none'|'static'|'dynamic', count }.
export async function inspectForm(bytes) {
  const doc = await loadPdf(bytes)
  const xfa = hasXfa(doc)
  const form = openForm(doc)
  const fields = form ? safeFields(form) : []
  const pageOf = widgetPages(doc)
  const frames = new Map()
  const frameOf = (i) => {
    if (!frames.has(i)) frames.set(i, pageFrame(doc.getPage(i)))
    return frames.get(i)
  }
  const out = []
  for (const field of fields) {
    const type = typeOf(field)
    const { value, options } = readValue(field, type)
    let widgets = []
    try {
      widgets = field.acroField.getWidgets()
    } catch {
      continue
    }
    widgets.forEach((widget, wi) => {
      const found = pageOf(widget)
      const pageIndex = found < 0 ? 0 : found
      let box
      try {
        box = userRectToView(frameOf(pageIndex), widget.getRectangle())
      } catch {
        return
      }
      out.push({
        name: field.getName(),
        type,
        value,
        options,
        // each radio widget represents one option, matched by position
        widgetOption: type === 'radio' ? options?.[wi] ?? null : null,
        readOnly: field.isReadOnly?.() ?? false,
        maxLength: type === 'text' ? field.getMaxLength?.() : undefined,
        pageIndex,
        ...box,
      })
    })
  }
  return { fields: out, xfa: xfa ? xfaKind(xfa, fields.length) : 'none', count: fields.length }
}

function safeFields(form) {
  try {
    return form.getFields()
  } catch {
    return []
  }
}

// ---------- appearances + flatten ----------

// Makes sure every field has an appearance for its current value. Rich text
// fields are read as their plain value. Comb fields about to be flattened are
// drawn as one centred word: pdf-lib (and any cell layout) spaces the glyphs
// so far apart that text extraction reads "C O R P U S" instead of the value.
async function prepareAppearances(doc, form, { forFlatten }) {
  let defaultFont = null
  for (const field of safeFields(form)) {
    const type = typeOf(field)
    try {
      if (type === 'text' && field.isRichFormatted()) {
        const plain = richPlain(field)
        field.disableRichFormatting()
        field.setText(plain)
      }
      if (!field.needsAppearancesUpdate()) continue
      const value = type === 'text' ? (field.getText() ?? '') : ''
      const font = needsFont(value) ? await fontForText(doc, value) : (defaultFont ??= form.getDefaultFont())
      if (type === 'text' && forFlatten && field.isCombed() && value) {
        field.disableCombing()
        field.setAlignment(TextAlignment.Center)
        field.updateAppearances(font)
      } else if (type === 'text' || type === 'dropdown' || type === 'optionlist' || type === 'button') {
        field.updateAppearances(font)
      } else {
        field.defaultUpdateAppearances(font)
      }
    } catch {
      /* this field keeps whatever appearance it had */
    }
  }
}

const HIDDEN = 1 << 1

// Bakes every field's appearance into its page and removes the fields.
// Like pdf-lib's flatten, but with a one-pass page map, hidden widgets left
// out, and fields without an appearance removed instead of failing the file.
function flattenAll(doc, form) {
  const pageOf = widgetPages(doc)
  const pages = doc.getPages()
  let count = 0
  for (const field of safeFields(form)) {
    let widgets = []
    try {
      widgets = field.acroField.getWidgets()
    } catch {
      /* broken field: removed below */
    }
    for (const widget of widgets) {
      const i = pageOf(widget)
      const page = pages[i]
      const ref = doc.context.getObjectRef(widget.dict)
      if (page && ref) page.node.removeAnnot(ref)
      let ap = null
      try {
        if (page && !((widget.getFlags?.() ?? 0) & HIDDEN)) ap = form.findWidgetAppearanceRef(field, widget)
      } catch {
        /* no appearance: nothing to draw */
      }
      if (ap) {
        const r = widget.getRectangle()
        const key = page.node.newXObject('FlatWidget', ap)
        page.pushOperators(pushGraphicsState(), translate(r.x, r.y), drawObject(key), popGraphicsState())
      }
      if (ref && ref !== field.ref) doc.context.delete(ref)
    }
    pages.forEach((p) => p.node.removeAnnot(field.ref))
    try {
      form.acroForm.removeField(field.acroField)
    } catch {
      /* already detached */
    }
    doc.context.delete(field.ref)
    count++
  }
  return count
}

// values: { [fieldName]: string | boolean }
// Returns { bytes, filled, xfaRemoved }.
export async function fillFields(bytes, values, { flatten = false } = {}) {
  const doc = await loadPdf(bytes)
  const xfaRemoved = stripXfa(doc)
  const form = doc.getForm()
  let filled = 0
  for (const field of safeFields(form)) {
    const name = field.getName()
    if (!(name in values)) continue
    const v = values[name]
    const type = typeOf(field)
    try {
      if (type === 'text') {
        if (field.isRichFormatted()) field.disableRichFormatting()
        field.setText(String(v ?? ''))
      } else if (type === 'checkbox') v ? field.check() : field.uncheck()
      else if (type === 'dropdown' || type === 'radio') {
        if (v) field.select(String(v))
      } else if (type === 'optionlist' && v) {
        field.select(String(v))
      } else {
        continue
      }
    } catch {
      continue // value not valid for this field: skip it
    }
    // the default Helvetica appearance cannot encode non-Latin text
    if (type !== 'checkbox' && type !== 'radio' && needsFont(v) && !(flatten && field.isCombed?.())) {
      field.updateAppearances(await fontForText(doc, v))
    }
    filled++
  }
  await prepareAppearances(doc, form, { forFlatten: flatten })
  if (flatten) flattenAll(doc, form)
  dropLooseObjects(doc)
  return { bytes: await doc.save({ updateFieldAppearances: false }), filled, xfaRemoved }
}

// newFields: [{ type, name, pageIndex, x, y (from top), w, h, value?, options? }]
//   type: 'text' | 'checkbox' | 'dropdown' | 'radio'
//   dropdown/radio carry options: string[]; radio lays one widget per option
//   evenly across the drawn width.
export async function addFields(bytes, newFields) {
  const doc = await loadPdf(bytes)
  stripXfa(doc)
  const form = doc.getForm()
  const existing = new Set(safeFields(form).map((f) => f.getName()))
  const uniqueName = (base, type) => {
    let name = base?.trim() || type
    let n = 1
    while (existing.has(name)) name = `${base?.trim() || type}_${++n}`
    existing.add(name)
    return name
  }
  const border = { borderWidth: 1, borderColor: rgb(0.35, 0.35, 0.4) }
  let added = 0
  for (const f of newFields) {
    const page = doc.getPage(f.pageIndex)
    const frame = pageFrame(page)
    // widget text stays upright on rotated pages (rotate sets /MK /R)
    const rect = { ...placeBox(frame, f.x, f.y, f.w, f.h), width: f.w, height: f.h }
    const font = needsFont(f.value) ? await fontForText(doc, f.value) : undefined
    const name = uniqueName(f.name, f.type)
    if (f.type === 'checkbox') {
      const cb = form.createCheckBox(name)
      cb.addToPage(page, { ...rect, ...border })
      if (f.value) cb.check()
    } else if (f.type === 'dropdown') {
      const dd = form.createDropdown(name)
      dd.addOptions((f.options ?? []).filter(Boolean))
      if (f.value) dd.select(String(f.value))
      dd.addToPage(page, { ...rect, ...border, font, backgroundColor: rgb(0.98, 0.98, 1) })
      // marks it clean, so save() does not redo it in Helvetica
      if (font) dd.updateAppearances(font)
    } else if (f.type === 'radio') {
      const opts = (f.options ?? []).filter(Boolean)
      if (opts.length === 0) continue
      const group = form.createRadioGroup(name)
      const size = Math.min(f.h, f.w / opts.length, 16)
      const gap = opts.length > 1 ? (f.w - size) / (opts.length - 1) : 0
      opts.forEach((opt, oi) => {
        group.addOptionToPage(opt, page, {
          ...placeBox(frame, f.x + oi * gap, f.y, size, size),
          width: size,
          height: size,
          ...border,
        })
      })
      if (f.value) group.select(String(f.value))
      added++
      continue
    } else {
      const tf = form.createTextField(name)
      if (f.value) tf.setText(String(f.value))
      tf.addToPage(page, { ...rect, ...border, font, backgroundColor: rgb(0.98, 0.98, 1) })
      if (font) tf.updateAppearances(font)
    }
    added++
  }
  dropLooseObjects(doc)
  return { bytes: await doc.save(), added }
}

// Auto-detects fill-in areas on a form that has NO interactive fields: blank
// ruling lines (write-on lines) and runs of underscores. Returns suggested text
// field rectangles ({ pageIndex, x, y (from top), w, h }) on the visible page.
export async function detectFillAreas(bytes) {
  const { extractDocument } = await import('./pdfExtract.js')
  const pages = await extractDocument(bytes)
  const doc = await loadPdf(bytes)
  const areas = []
  pages.forEach((page, pi) => {
    // extracted lines and text are in PDF user space
    const frame = pageFrame(doc.getPage(pi))
    const toView = (x, y, width, height) => userRectToView(frame, { x, y, width, height })

    // 1) horizontal ruling lines that look like write-on lines: reasonably long,
    //    not part of a dense table (few parallel lines nearby).
    for (const h of page.hLines) {
      const len = h.b - h.a
      if (len < 40 || len > page.width * 0.9) continue
      const near = page.hLines.filter((o) => Math.abs(o.y - h.y) < 26).length
      if (near > 2) continue // table region, not a blank line
      const box = { pageIndex: pi, ...toView(h.a, h.y, len, 15), source: 'line' }
      if (!areas.some((a) => a.pageIndex === pi && Math.abs(a.y - box.y) < 8 && Math.abs(a.x - box.x) < 20)) {
        areas.push(box)
      }
    }

    // 2) runs of underscores in the text (e.g. "Name: ________").
    for (const it of page.items) {
      const m = it.text.match(/_{3,}/)
      if (!m) continue
      const perChar = it.width / Math.max(1, it.text.length)
      const startX = it.x + m.index * perChar
      areas.push({
        pageIndex: pi,
        ...toView(startX, it.y - it.size * 0.3, m[0].length * perChar, it.size * 1.3),
        source: 'underscore',
      })
    }
  })
  return areas
}

// Bakes the current values of every field into the pages.
export async function flattenForm(bytes) {
  const doc = await loadPdf(bytes)
  stripXfa(doc)
  const form = doc.getForm()
  await prepareAppearances(doc, form, { forFlatten: true })
  const flattened = flattenAll(doc, form)
  dropLooseObjects(doc)
  return { bytes: await doc.save({ updateFieldAppearances: false }), flattened }
}
