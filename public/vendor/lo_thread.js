// Runs inside the LibreOffice office thread (web worker). Receives convert
// requests from the main thread, drives LibreOffice via UNO, replies with the
// result path. Loaded by zetaHelper as a module: plain JS, no bundler.
import { ZetaHelperThread } from './zetajs/zetaHelper.js'

const zHT = new ZetaHelperThread()
const css = zHT.css
const bean = (Name, Value) => new css.beans.PropertyValue({ Name, Value })

// Sets every page style to { width, height, margin } (1/100 mm). Used for HTML,
// which LibreOffice otherwise lays out on its own default page.
function setPageSize(doc, page) {
  const styles = doc.getStyleFamilies().getByName('PageStyles')
  for (const name of styles.getElementNames()) {
    const st = styles.getByName(name)
    st.setPropertyValue('Width', page.width)
    st.setPropertyValue('Height', page.height)
    for (const side of ['LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin']) st.setPropertyValue(side, page.margin)
  }
}

zHT.thrPort.onmessage = (e) => {
  const msg = e.data
  if (msg.cmd !== 'convert') return
  try {
    const loadArgs = [bean('Hidden', true), bean('ReadOnly', true)]
    // PDFs must be imported through the Draw/Impress PDF import filter.
    if (msg.importFilter) loadArgs.push(bean('FilterName', msg.importFilter))
    const doc = zHT.desktop.loadComponentFromURL('file://' + msg.from, '_blank', 0, loadArgs)
    if (!doc) throw new Error('LibreOffice could not open this document.')
    try {
      if (msg.page) setPageSize(doc, msg.page)
      const args = [bean('FilterName', msg.filter), bean('Overwrite', true)]
      if (msg.pdfA) {
        // FilterData must be a typed UNO sequence<PropertyValue>, not a plain
        // JS array, or LibreOffice silently ignores it (output is not PDF/A).
        // SelectPdfVersion 2 = PDF/A-2b (ISO 19005-2).
        const zetajs = zHT.zetajs
        // PropertyValue is a UNO struct; FilterData is sequence<PropertyValue>.
        const seqType = zetajs.type.sequence(zetajs.type.struct(css.beans.PropertyValue))
        args.push(
          new css.beans.PropertyValue({
            Name: 'FilterData',
            Value: new zetajs.Any(seqType, [bean('SelectPdfVersion', 2)]),
          }),
        )
      }
      doc.storeToURL('file://' + msg.to, args)
    } finally {
      try {
        doc.close(false)
      } catch {
        try {
          doc.dispose()
        } catch {
          /* document already gone */
        }
      }
    }
    zHT.thrPort.postMessage({ cmd: 'converted', id: msg.id, to: msg.to })
  } catch (err) {
    zHT.thrPort.postMessage({
      cmd: 'convert-error',
      id: msg.id,
      message: String(err?.message ?? err),
    })
  }
}

zHT.thrPort.postMessage({ cmd: 'lo-ready' })
