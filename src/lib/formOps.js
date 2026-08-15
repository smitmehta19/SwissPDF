// Interactive PDF forms: detect existing fields, fill them, add new ones,
// and flatten (bake values in so they can no longer be edited).
import { PDFDocument, PDFName, rgb } from 'pdf-lib'
import { loadPdf } from './pdfOps.js'

function widgetPageIndex(doc, widget) {
  const widgetRef = widget.dict.get(PDFName.of('P'))
  const pages = doc.getPages()
  for (let i = 0; i < pages.length; i++) {
    if (widgetRef && pages[i].ref === widgetRef) return i
    const annots = pages[i].node.Annots?.()
    if (annots) {
      for (let a = 0; a < annots.size(); a++) {
        if (doc.context.lookup(annots.get(a)) === widget.dict) return i
      }
    }
  }
  return 0
}

const typeOf = (field) => {
  const ctor = field.constructor.name
  if (ctor.includes('TextField')) return 'text'
  if (ctor.includes('CheckBox')) return 'checkbox'
  if (ctor.includes('Dropdown')) return 'dropdown'
  if (ctor.includes('RadioGroup')) return 'radio'
  if (ctor.includes('OptionList')) return 'optionlist'
  if (ctor.includes('Button')) return 'button'
  return 'other'
}

// Returns one entry PER WIDGET (a radio group yields one per option):
// { name, type, value, options, widgetOption, pageIndex, x, y (from top), w, h }
export async function listFields(bytes) {
  const doc = await loadPdf(bytes)
  let form
  try {
    form = doc.getForm()
  } catch {
    return []
  }
  const out = []
  for (const field of form.getFields()) {
    const type = typeOf(field)
    let value = ''
    let options
    try {
      if (type === 'text') value = field.getText() ?? ''
      else if (type === 'checkbox') value = field.isChecked() ? 'on' : ''
      else if (type === 'dropdown') {
        value = (field.getSelected() ?? [])[0] ?? ''
        options = field.getOptions()
      } else if (type === 'radio') {
        value = field.getSelected() ?? ''
        options = field.getOptions()
      } else if (type === 'optionlist') {
        value = (field.getSelected() ?? [])[0] ?? ''
        options = field.getOptions()
      }
    } catch {
      /* unreadable field value */
    }
    const widgets = field.acroField.getWidgets()
    widgets.forEach((widget, wi) => {
      const r = widget.getRectangle()
      const pageIndex = widgetPageIndex(doc, widget)
      const page = doc.getPage(pageIndex)
      out.push({
        name: field.getName(),
        type,
        value,
        options,
        // each radio widget represents one option, matched by position
        widgetOption: type === 'radio' ? options?.[wi] ?? null : null,
        readOnly: field.isReadOnly?.() ?? false,
        pageIndex,
        x: r.x,
        y: page.getHeight() - r.y - r.height, // from top
        w: r.width,
        h: r.height,
      })
    })
  }
  return out
}

// values: { [fieldName]: string | boolean }
export async function fillFields(bytes, values, { flatten = false } = {}) {
  const doc = await loadPdf(bytes)
  const form = doc.getForm()
  let filled = 0
  for (const field of form.getFields()) {
    const name = field.getName()
    if (!(name in values)) continue
    const v = values[name]
    const type = typeOf(field)
    try {
      if (type === 'text') field.setText(String(v ?? ''))
      else if (type === 'checkbox') (v ? field.check() : field.uncheck())
      else if (type === 'dropdown' || type === 'radio') {
        if (v) field.select(String(v))
      } else if (type === 'optionlist' && v) {
        field.select(String(v))
      } else {
        continue
      }
      filled++
    } catch {
      /* value not valid for this field — skip it */
    }
  }
  if (flatten) {
    form.updateFieldAppearances()
    form.flatten()
  }
  return { bytes: await doc.save(), filled }
}

// newFields: [{ type, name, pageIndex, x, y (from top), w, h, value?, options? }]
//   type: 'text' | 'checkbox' | 'dropdown' | 'radio'
//   dropdown/radio carry options: string[]; radio lays one widget per option
//   evenly across the drawn width.
export async function addFields(bytes, newFields) {
  const doc = await loadPdf(bytes)
  const form = doc.getForm()
  const existing = new Set(form.getFields().map((f) => f.getName()))
  const uniqueName = (base, type) => {
    let name = base?.trim() || type
    let n = 1
    while (existing.has(name)) name = `${base?.trim() || type}_${++n}`
    existing.add(name)
    return name
  }
  const border = { borderWidth: 1, borderColor: rgb(0.35, 0.35, 0.4) }
  let added = 0
  newFields.forEach((f) => {
    const page = doc.getPage(f.pageIndex)
    const rect = { x: f.x, y: page.getHeight() - f.y - f.h, width: f.w, height: f.h }
    const name = uniqueName(f.name, f.type)
    if (f.type === 'checkbox') {
      form.createCheckBox(name).addToPage(page, { ...rect, ...border })
    } else if (f.type === 'dropdown') {
      const dd = form.createDropdown(name)
      dd.addOptions((f.options ?? []).filter(Boolean))
      if (f.value) dd.select(String(f.value))
      dd.addToPage(page, { ...rect, ...border, backgroundColor: rgb(0.98, 0.98, 1) })
    } else if (f.type === 'radio') {
      const opts = (f.options ?? []).filter(Boolean)
      if (opts.length === 0) return
      const group = form.createRadioGroup(name)
      const size = Math.min(f.h, f.w / opts.length, 16)
      const gap = opts.length > 1 ? (f.w - size) / (opts.length - 1) : 0
      opts.forEach((opt, oi) => {
        const ox = f.x + oi * gap
        group.addOptionToPage(opt, page, {
          x: ox,
          y: page.getHeight() - f.y - size,
          width: size,
          height: size,
          ...border,
        })
      })
      if (f.value) group.select(String(f.value))
      added++
      return
    } else {
      const tf = form.createTextField(name)
      if (f.value) tf.setText(String(f.value))
      tf.addToPage(page, { ...rect, ...border, backgroundColor: rgb(0.98, 0.98, 1) })
    }
    added++
  })
  return { bytes: await doc.save(), added }
}

// Auto-detects fill-in areas on a form that has NO interactive fields: blank
// ruling lines (write-on lines) and runs of underscores. Returns suggested text
// field rectangles ({ pageIndex, x, y (from top), w, h }).
export async function detectFillAreas(bytes) {
  const { extractDocument } = await import('./pdfExtract.js')
  const pages = await extractDocument(bytes)
  const areas = []
  pages.forEach((page, pi) => {
    const usedX = [] // avoid stacking suggestions on the same spot

    // 1) horizontal ruling lines that look like write-on lines: reasonably long,
    //    not part of a dense table (few parallel lines nearby).
    for (const h of page.hLines) {
      const len = h.b - h.a
      if (len < 40 || len > page.width * 0.9) continue
      const near = page.hLines.filter((o) => Math.abs(o.y - h.y) < 26).length
      if (near > 2) continue // table region, not a blank line
      const box = {
        pageIndex: pi,
        x: h.a,
        y: page.height - h.y - 15,
        w: len,
        h: 15,
        source: 'line',
      }
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
        x: startX,
        y: page.height - it.y - it.size,
        w: m[0].length * perChar,
        h: it.size * 1.3,
        source: 'underscore',
      })
    }
  })
  return areas
}

export async function flattenForm(bytes) {
  const doc = await loadPdf(bytes)
  const form = doc.getForm()
  const count = form.getFields().length
  form.updateFieldAppearances()
  form.flatten()
  return { bytes: await doc.save(), flattened: count }
}
