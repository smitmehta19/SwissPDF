import PageSelectionTool from './PageSelectionTool.jsx'
import { removePages } from '../lib/pdfOps.js'

export default function RemoveTool() {
  return (
    <PageSelectionTool
      verb="Remove pages"
      verbBusy="Removing…"
      suffix="removed"
      placeholder='Pages to delete, e.g. "1, 5-7"'
      operate={removePages}
      testId="remove-btn"
      selectionEffect="drop"
    />
  )
}
