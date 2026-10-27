import merge from './v2/merge.jsx'
import compress from './v2/compress.jsx'
import watermark from './v2/watermark.jsx'
import groupOrganize from './v2/group-organize.js'
import convertTools from './v2/group-convert.js'
import groupEdit from './v2/group-edit.js'
import groupLayout from './v2/group-layout.js'
import groupStructure from './v2/group-structure.js'
import groupSecurity from './v2/group-security.js'
import automate from './v2/automate.jsx'

// Edit tools by id, so watermark can sit among them.
const editTool = (id) => groupEdit.find((t) => t.id === id)
// G2 tools by id, in their old slots.
const g2 = (id) => groupSecurity.find((t) => t.id === id)

// Each tool: { id, name, io, description, category, icon } plus either
// - the tool contract (docs/design/tool-contract.md): accepts, defaults,
//   Options, summary, run. These work on the shared workspace files; or
// - component: a legacy tool page with its own file picker (until U2b).
// `io` is the input → output signature shown on every card; it does the work
// that a paragraph of marketing copy would otherwise do.
export const CATEGORIES = ['Organize', 'Convert', 'Optimize', 'Edit', 'Security', 'System']

export const TOOLS = [
  merge,
  ...groupOrganize,
  g2('autorotate'),
  ...convertTools,
  compress,
  g2('repair'),
  g2('ocr'),
  automate,
  g2('compare'),
  editTool('edit'),
  editTool('forms'),
  watermark,
  editTool('pagenumbers'),
  editTool('crop'),
  editTool('redact'),
  editTool('sign'),
  ...groupLayout,
  g2('protect'),
  g2('unlock'),
  g2('health'),
  ...groupStructure,
]
