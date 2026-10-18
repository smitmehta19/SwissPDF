// Page data for PDF -> Office conversion (pdf.js side). The layout analysis
// itself is pure and lives in layout.js:
//   - text items with font info (family, bold/italic, size, colour)
//   - vector ruling lines from the operator list (real table borders)
//   - image placements, resolved to PNG bytes
//   - lattice / stream tables, columns, reading order (layout.js)
import { openPdfDocument, pdfjsLib, serializedPdfOp } from './pdfText.js'
import {
  walkOperators,
  consolidate,
  colorItems,
  isBoldFont,
  isItalicFont,
  fontFamily,
} from './layout.js'

export {
  detectTables,
  buildLines,
  detectColumns,
  lineCells,
  lineText,
  layoutPage,
  buildParagraphs,
  paragraphRuns,
  detectFurniture,
  buildFrames,
} from './layout.js'

// Convert a pdf.js image object (ImageBitmap wrapper or raw pixel buffer) to
// PNG bytes for embedding in Office documents.
async function imageObjToPng(img) {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const bitmap = img instanceof ImageBitmap ? img : img?.bitmap
    if (bitmap) {
      // JPEGs arrive as a VideoFrame (pdf.js uses ImageDecoder): it has
      // displayWidth/displayHeight, no width/height
      canvas.width = bitmap.width ?? bitmap.displayWidth ?? img.width
      canvas.height = bitmap.height ?? bitmap.displayHeight ?? img.height
      if (!canvas.width || !canvas.height) return null
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    } else if (img?.data && img.width && img.height) {
      canvas.width = img.width
      canvas.height = img.height
      const imageData = ctx.createImageData(img.width, img.height)
      const src = img.data
      const dst = imageData.data
      if (img.kind === 3 /* RGBA_32BPP */) {
        dst.set(src.subarray(0, dst.length))
      } else if (img.kind === 2 /* RGB_24BPP */) {
        for (let i = 0, j = 0; j < dst.length - 3; i += 3, j += 4) {
          dst[j] = src[i]
          dst[j + 1] = src[i + 1]
          dst[j + 2] = src[i + 2]
          dst[j + 3] = 255
        }
      } else if (img.kind === 1 /* GRAYSCALE_1BPP */) {
        const rowBytes = Math.ceil(img.width / 8)
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1
            const j = (y * img.width + x) * 4
            const v = bit ? 255 : 0
            dst[j] = dst[j + 1] = dst[j + 2] = v
            dst[j + 3] = 255
          }
        }
      } else {
        return null
      }
      ctx.putImageData(imageData, 0, 0)
    } else {
      return null
    }
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) return null
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    return null
  }
}

// Image data arrives from the pdf.js worker asynchronously: the callback form
// of objs.get waits for it (with a timeout so a broken object can't hang us).
function getObjWhenReady(store, objId, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs)
    try {
      store.get(objId, (obj) => {
        clearTimeout(timer)
        resolve(obj)
      })
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}

// Images shared across pages (ids "g_...") live in commonObjs, page images
// in page.objs. Asking the wrong store waited out the full timeout for every
// placement (FDIC: a logo on 44 pages = 5+ minutes).
async function resolveImages(page, placements, pngCache) {
  const out = []
  for (const p of placements) {
    let png = null
    if (p.objId && pngCache.has(p.objId)) {
      png = pngCache.get(p.objId)
    } else {
      let obj = p.inlineObj
      if (!obj && p.objId) {
        const common = p.objId.startsWith('g_')
        const first = common ? page.commonObjs : page.objs
        const second = common ? page.objs : page.commonObjs
        obj = (await getObjWhenReady(first, p.objId)) ?? (await getObjWhenReady(second, p.objId, 500))
      }
      png = obj ? await imageObjToPng(obj) : null
      if (p.objId) pngCache.set(p.objId, png)
    }
    if (png) out.push({ ...p.rect, png })
  }
  return out
}

async function pageData(page, pngCache) {
  const viewport = page.getViewport({ scale: 1 })
  const [vx0, vy0, vx1, vy1] = viewport.viewBox
  // getOperatorList first: it loads fonts + images into the object stores AND
  // yields the vector paths for table detection.
  const opList = await page.getOperatorList()
  const { segments, imagePlacements, textMarks, vectorPaths } = walkOperators(
    opList,
    pdfjsLib.OPS,
    Math.abs((vx1 - vx0) * (vy1 - vy0)),
  )
  const { hLines, vLines } = consolidate(segments)
  const images = await resolveImages(page, imagePlacements, pngCache)
  const content = await page.getTextContent()
  const fontInfo = (internalName) => {
    try {
      const f = page.commonObjs.get(internalName)
      const name = f?.name ?? ''
      return {
        family: fontFamily(name) || fontFamily(content.styles?.[internalName]?.fontFamily ?? ''),
        bold: isBoldFont(name) || !!f?.bold || !!f?.black,
        italic: isItalicFont(name) || !!f?.italic,
      }
    } catch {
      return { family: '', bold: false, italic: false }
    }
  }
  const fontCache = new Map()
  const items = content.items
    .filter((it) => it.str && it.str.trim())
    .map((it) => {
      if (!fontCache.has(it.fontName)) fontCache.set(it.fontName, fontInfo(it.fontName))
      const f = fontCache.get(it.fontName)
      return {
        text: it.str,
        x: it.transform[4],
        y: it.transform[5],
        size: Math.hypot(it.transform[2], it.transform[3]),
        width: it.width,
        bold: f.bold,
        italic: f.italic,
        font: f.family,
        color: null,
        dir: it.dir,
      }
    })
  colorItems(items, textMarks)
  return {
    items,
    hLines,
    vLines,
    images,
    width: viewport.width,
    height: viewport.height,
    // unrotated CropBox in user space; rotate is the page's /Rotate
    view: { x0: Math.min(vx0, vx1), y0: Math.min(vy0, vy1), w: Math.abs(vx1 - vx0), h: Math.abs(vy1 - vy0), rotate: page.rotate || 0 },
    vectorPaths,
  }
}

// Interactive form fields (AcroForm widgets) are annotations, not page
// content: text extraction never sees them. Surface them with their boxes.
async function extractFormFields(page) {
  try {
    const annots = await page.getAnnotations()
    return annots
      .filter((a) => a.subtype === 'Widget' && a.rect)
      .map((a) => {
        const [x1, y1, x2, y2] = a.rect
        return {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
          value:
            typeof a.fieldValue === 'string'
              ? a.fieldValue
              : Array.isArray(a.fieldValue)
                ? a.fieldValue.join(', ')
                : '',
          name: a.fieldName ?? '',
          type: a.fieldType ?? '',
        }
      })
  } catch {
    return []
  }
}

// All pages' data. Coordinates are PDF user space (y up), as other tools
// (redact, forms) expect; `view` gives the visible box for placing output.
export function extractDocument(bytes, { onPage } = {}) {
  return serializedPdfOp(async () => {
    // cached by pdfText: never destroy it here
    const doc = await openPdfDocument(bytes)
    const pages = []
    const pngCache = new Map()
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const data = await pageData(page, pngCache)
      data.formFields = await extractFormFields(page)
      pages.push(data)
      page.cleanup()
      onPage?.(p, doc.numPages)
    }
    return pages
  })
}
