# SwissPDF

A complete, private PDF toolkit that runs **entirely in your browser**. Your documents never leave your device — every operation happens client-side using WebAssembly and JavaScript. No uploads, no accounts, no server.

## Tools

**Organize** — Merge · Split · Extract pages · Remove pages · Organize · Rotate

**Convert** — Images ↔ PDF · Word ↔ PDF · Excel ↔ PDF · PowerPoint ↔ PDF · PDF → Markdown · HTML → PDF

**Optimize** — Compress · Repair · OCR · Compare

**Edit** — Edit (text, shapes, highlights, drawing, images) · Forms (fill & create) · Watermark · Page numbers · Crop

**Security** — Redact · Sign · Protect (AES-256) · Unlock

A built-in **Health check** self-tests every tool in your browser.

## How it works

| Capability | Engine |
| --- | --- |
| Page operations, editing, forms, stamping | [pdf-lib](https://github.com/Hopding/pdf-lib) |
| Rendering, previews, PDF → image, layout analysis | [pdf.js](https://github.com/mozilla/pdf.js) |
| Compress, repair, encryption | [MuPDF/WASM](https://mupdf.com) |
| High-fidelity Office → PDF | [LibreOffice/WASM (zetajs)](https://github.com/allotropia/zetajs) |
| OCR | [Tesseract.js](https://github.com/naptha/tesseract.js) |
| Office generation | docx · SheetJS · PptxGenJS · pptxviewjs |

The LibreOffice engine needs cross-origin isolation (COOP/COEP), which is why the app runs isolated. Office and OCR engines download once on first use, then cache.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
npm run make-samples   # generate labelled test PDFs into public/samples/
```

## Privacy

SwissPDF processes files locally in your browser's memory. Nothing is transmitted to any server. Engine assets (LibreOffice, OCR) are fetched from public CDNs the first time you use those tools — your documents are never part of that.
