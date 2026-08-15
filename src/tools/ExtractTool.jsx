import PageSelectionTool from './PageSelectionTool.jsx'
import { extractPages } from '../lib/pdfOps.js'

export default function ExtractTool() {
  return (
    <PageSelectionTool
      verb="Extract pages"
      verbBusy="Extracting…"
      suffix="extracted"
      placeholder='Pages to keep, e.g. "2, 4-6"'
      operate={extractPages}
      testId="extract-btn"
      selectionEffect="keep"
    />
  )
}
