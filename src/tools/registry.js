import MergeTool from './MergeTool.jsx'
import SplitTool from './SplitTool.jsx'
import ExtractTool from './ExtractTool.jsx'
import RemoveTool from './RemoveTool.jsx'
import OrganizeTool from './OrganizeTool.jsx'
import RotateTool from './RotateTool.jsx'
import HealthTool from './HealthTool.jsx'
import ImageToPdfTool from './ImageToPdfTool.jsx'
import PdfToImageTool from './PdfToImageTool.jsx'
import CompressTool from './CompressTool.jsx'
import RepairTool from './RepairTool.jsx'
import WatermarkTool from './WatermarkTool.jsx'
import PageNumbersTool from './PageNumbersTool.jsx'
import CropTool from './CropTool.jsx'
import SignTool from './SignTool.jsx'
import ProtectTool from './ProtectTool.jsx'
import UnlockTool from './UnlockTool.jsx'
import OcrTool from './OcrTool.jsx'
import { WordToPdfTool, ExcelToPdfTool, PptToPdfTool } from './OfficeToPdfTool.jsx'
import { PdfToWordTool, PdfToExcelTool, PdfToPptTool } from './PdfToOfficeTool.jsx'
import MarkdownTool from './MarkdownTool.jsx'
import CompareTool from './CompareTool.jsx'
import RedactTool from './RedactTool.jsx'
import HtmlToPdfTool from './HtmlToPdfTool.jsx'
import FormsTool from './FormsTool.jsx'
import EditTool from './EditTool.jsx'

// Each tool: { id, name, io, description, category, icon, component }
// `io` is the input → output signature shown on every card; it does the work
// that a paragraph of marketing copy would otherwise do.
export const CATEGORIES = ['Organize', 'Convert', 'Optimize', 'Edit', 'Security', 'System']

export const TOOLS = [
  {
    id: 'merge',
    name: 'Merge',
    io: '2+ PDF → 1 PDF',
    description: 'Combine files, pick the page order.',
    category: 'Organize',
    icon: 'merge',
    component: MergeTool,
  },
  {
    id: 'split',
    name: 'Split',
    io: 'PDF → many PDF',
    description: 'Cut by ranges, every N pages, or per page.',
    category: 'Organize',
    icon: 'split',
    component: SplitTool,
  },
  {
    id: 'extract',
    name: 'Extract pages',
    io: 'PDF → PDF',
    description: 'Keep only the pages you select.',
    category: 'Organize',
    icon: 'extract',
    component: ExtractTool,
  },
  {
    id: 'remove',
    name: 'Remove pages',
    io: 'PDF → PDF',
    description: 'Delete the pages you select.',
    category: 'Organize',
    icon: 'remove',
    component: RemoveTool,
  },
  {
    id: 'organize',
    name: 'Organize',
    io: 'PDF → PDF',
    description: 'Drag page thumbnails into a new order.',
    category: 'Organize',
    icon: 'organize',
    component: OrganizeTool,
  },
  {
    id: 'rotate',
    name: 'Rotate',
    io: 'PDF → PDF',
    description: 'Turn all pages or just the ones you tick.',
    category: 'Organize',
    icon: 'rotate',
    component: RotateTool,
  },
  {
    id: 'img2pdf',
    name: 'Images to PDF',
    io: 'JPG/PNG → PDF',
    description: 'One page per image, in your order.',
    category: 'Convert',
    icon: 'image',
    component: ImageToPdfTool,
  },
  {
    id: 'pdf2img',
    name: 'PDF to images',
    io: 'PDF → JPG/PNG',
    description: 'Export pages at the quality you choose.',
    category: 'Convert',
    icon: 'camera',
    component: PdfToImageTool,
  },
  {
    id: 'word2pdf',
    name: 'Word to PDF',
    io: 'DOC/DOCX → PDF',
    description: 'True layout, selectable text.',
    category: 'Convert',
    icon: 'word',
    component: WordToPdfTool,
  },
  {
    id: 'excel2pdf',
    name: 'Excel to PDF',
    io: 'XLS/XLSX → PDF',
    description: 'One page per sheet.',
    category: 'Convert',
    icon: 'excel',
    component: ExcelToPdfTool,
  },
  {
    id: 'ppt2pdf',
    name: 'PowerPoint to PDF',
    io: 'PPT/PPTX → PDF',
    description: 'One page per slide.',
    category: 'Convert',
    icon: 'ppt',
    component: PptToPdfTool,
  },
  {
    id: 'pdf2word',
    name: 'PDF to Word',
    io: 'PDF → DOCX',
    description: 'Editable text — exact layout or flowing.',
    category: 'Convert',
    icon: 'word',
    component: PdfToWordTool,
  },
  {
    id: 'pdf2excel',
    name: 'PDF to Excel',
    io: 'PDF → XLSX',
    description: 'Tables into real rows and columns.',
    category: 'Convert',
    icon: 'excel',
    component: PdfToExcelTool,
  },
  {
    id: 'pdf2ppt',
    name: 'PDF to PowerPoint',
    io: 'PDF → PPTX',
    description: 'One slide per page.',
    category: 'Convert',
    icon: 'ppt',
    component: PdfToPptTool,
  },
  {
    id: 'pdf2md',
    name: 'PDF to Markdown',
    io: 'PDF → MD',
    description: 'Headings, tables and lists preserved.',
    category: 'Convert',
    icon: 'markdown',
    component: MarkdownTool,
  },
  {
    id: 'html2pdf',
    name: 'HTML to PDF',
    io: 'HTML → PDF',
    description: 'Render pasted markup or an .html file.',
    category: 'Convert',
    icon: 'html',
    component: HtmlToPdfTool,
  },
  {
    id: 'compress',
    name: 'Compress',
    io: 'PDF → smaller PDF',
    description: 'Keep text sharp, or go maximum.',
    category: 'Optimize',
    icon: 'compress',
    component: CompressTool,
  },
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
  {
    id: 'edit',
    name: 'Edit',
    io: 'PDF → PDF',
    description: 'Text, shapes, highlights, drawing, images.',
    category: 'Edit',
    icon: 'edit',
    component: EditTool,
  },
  {
    id: 'forms',
    name: 'Forms',
    io: 'PDF → filled PDF',
    description: 'Fill fields, or draw new ones.',
    category: 'Edit',
    icon: 'forms',
    component: FormsTool,
  },
  {
    id: 'watermark',
    name: 'Watermark',
    io: 'PDF → PDF',
    description: 'Stamp text or a logo, any position.',
    category: 'Edit',
    icon: 'watermark',
    component: WatermarkTool,
  },
  {
    id: 'pagenumbers',
    name: 'Page numbers',
    io: 'PDF → PDF',
    description: 'Style, position and start number.',
    category: 'Edit',
    icon: 'numbers',
    component: PageNumbersTool,
  },
  {
    id: 'crop',
    name: 'Crop',
    io: 'PDF → PDF',
    description: 'Drag the area to keep.',
    category: 'Edit',
    icon: 'crop',
    component: CropTool,
  },
  {
    id: 'redact',
    name: 'Redact',
    io: 'PDF → redacted PDF',
    description: 'Destroys the content, not just covers it.',
    category: 'Security',
    icon: 'redact',
    component: RedactTool,
  },
  {
    id: 'sign',
    name: 'Sign',
    io: 'PDF → signed PDF',
    description: 'Draw, type or upload a signature.',
    category: 'Security',
    icon: 'sign',
    component: SignTool,
  },
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
