import HealthTool from './HealthTool.jsx'
import RepairTool from './RepairTool.jsx'
import ProtectTool from './ProtectTool.jsx'
import UnlockTool from './UnlockTool.jsx'
import OcrTool from './OcrTool.jsx'
import CompareTool from './CompareTool.jsx'
import merge from './v2/merge.jsx'
import compress from './v2/compress.jsx'
import watermark from './v2/watermark.jsx'
import groupOrganize from './v2/group-organize.js'
import convertTools from './v2/group-convert.js'
import groupEdit from './v2/group-edit.js'

// Edit tools by id, so watermark can sit among them.
const editTool = (id) => groupEdit.find((t) => t.id === id)

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
  ...convertTools,
  compress,
  {
    id: 'repair',
    name: 'Repair',
    io: 'broken PDF → PDF',
    description: 'Recover pages from damaged files.',
    category: 'Optimize',
    icon: 'repair',
    component: RepairTool,
  },
  {
    id: 'ocr',
    name: 'OCR',
    io: 'scan → searchable PDF',
    description: 'Read text off scans, keep the look.',
    category: 'Optimize',
    icon: 'ocr',
    component: OcrTool,
  },
  {
    id: 'compare',
    name: 'Compare',
    io: '2 PDF → differences',
    description: 'Word-level changes, side by side.',
    category: 'Optimize',
    icon: 'compare',
    component: CompareTool,
  },
  editTool('edit'),
  editTool('forms'),
  watermark,
  editTool('pagenumbers'),
  editTool('crop'),
  editTool('redact'),
  editTool('sign'),
  {
    id: 'protect',
    name: 'Protect',
    io: 'PDF → locked PDF',
    description: 'AES-256 password encryption.',
    category: 'Security',
    icon: 'lock',
    component: ProtectTool,
  },
  {
    id: 'unlock',
    name: 'Unlock',
    io: 'locked PDF → PDF',
    description: 'Remove a password you know.',
    category: 'Security',
    icon: 'unlock',
    component: UnlockTool,
  },
  {
    id: 'health',
    name: 'Health check',
    io: 'self-test',
    description: 'Verify every tool in this browser.',
    category: 'System',
    icon: 'health',
    component: HealthTool,
  },
]
