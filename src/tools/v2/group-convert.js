// G4 Convert tools, in directory order. The registry spreads this array.
import img2pdf from './img2pdf.jsx'
import pdf2img from './pdf2img.jsx'
import { word2pdf, excel2pdf, ppt2pdf } from './office2pdf.jsx'
import { pdf2word, pdf2excel, pdf2ppt } from './pdf2office.jsx'
import pdf2md from './markdown.jsx'
import html2pdf from './html2pdf.jsx'

export default [img2pdf, pdf2img, word2pdf, excel2pdf, ppt2pdf, pdf2word, pdf2excel, pdf2ppt, pdf2md, html2pdf]
