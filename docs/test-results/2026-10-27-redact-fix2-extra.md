# Corpus scorecard: 2026-10-27-redact-fix2-extra

Run: 2026-10-27 01:36 UTC, 0.6 min. Command: `npm run test:corpus -- --case free-fiber|leak|actualtext|g3-redact-remove|form-value --name 2026-10-27-redact-fix2-extra`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **32 PASS, 0 FAIL, 0 SKIP** of 32 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| pdf2excel | 1 | 0 | 0 | 12.4s |
| redact | 30 | 0 | 0 | 13.8s |
| intake | 1 | 0 | 0 | 0.3s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT TESTED | no corpus case |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT REPRODUCED | 16 linked check(s) passed, e.g. g3-redact-remove-tracemonkey: "dynamic" gone from extracted text; g3-redact-remove-tracemonkey: black box covers the word on screen |
| 3 | Redact search misses phrases split across text items | NOT TESTED | no corpus case |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | NOT TESTED | no corpus case |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT REPRODUCED | 1 linked check(s) passed, e.g. intake-invoices/free-fiber.pdf: accepted |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT TESTED | no corpus case |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT TESTED | no corpus case |
| 10 | OCR English only, assets from CDN (not offline) | NOT TESTED | no corpus case |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | NOT TESTED | no corpus case |
| 12 | Merge/split drop outlines, AcroForm, links | NOT TESTED | no corpus case |
| 13 | Crop rejects rotated, ignores box origin | NOT TESTED | no corpus case |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | NOT TESTED | no corpus case |
| 16 | PDF to Excel number parsing loses leading zeros / formats | NOT TESTED | no corpus case |
| 17 | PDF to PPT slides are flat images, fixed slide size | NOT TESTED | no corpus case |
| 18 | Office to PDF quick mode is screenshots (no text) | NOT TESTED | no corpus case |
| 19 | HiFi engine from unpinned CDN, font substitution | NOT TESTED | CDN pinning is a config review item; font fidelity not scored |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | NOT TESTED | no corpus case |
| 22 | Protect: comma in password splits MuPDF options | NOT TESTED | no corpus case |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | NOT TESTED | no corpus case |
| 24 | Sign is visual only, one placement | NOT TESTED | feature gap (no PAdES / multi-place API to call) |
| 25 | Redact rasterizes whole pages (size balloons) | NOT REPRODUCED | 24 linked check(s) passed, e.g. g3-redact-remove-tracemonkey: text outside the boxes stays selectable; g3-redact-remove-tracemonkey: no page fell back to an image |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT TESTED | no corpus case |
| 27 | Compare by page index only; inserted page breaks the rest | NOT TESTED | no corpus case |
| 28 | HTML to PDF is a screenshot, head styles dropped | NOT TESTED | no corpus case |
| 29 | Split/batch outputs and ZIP all in memory | NOT TESTED | memory profile of very large splits not measured in U0 |
| 30 | assertValidOutput re-parses outputs with pdf-lib | NOT TESTED | internal double parse; see timings |
| 31 | Unlock: one password per batch, MuPDF docs not destroyed | NOT TESTED | per-file password is UI only; destroy() leak not measured |
| 32 | Watermark centring is a 45 degree approximation | NOT TESTED | centring at non-45 angles not measured |
| 33 | Page numbers: no skip/template/Bates | NOT TESTED | feature gap |
| 34 | Organize renders all thumbnails at once | NOT TESTED | UI thumbnail batching not driven in U0 |
| 35 | Upload grid: no rotate/sort/add | NOT TESTED | UI feature gap |
| 36 | No result screen / chaining | NOT TESTED | UI feature gap |
| 37 | Files lost on tool switch / Escape | NOT TESTED | UI navigation behaviour not driven in U0 |
| 38 | No cancel, no progress bar | NOT TESTED | UI feature gap |
| 39 | Single-file tools have no batch | NOT TESTED | UI feature gap |
| 40 | Thumbnail cache never evicted | NOT TESTED | memory over a long session not measured |
| 41 | Single pdf.js queue delays user ops | NOT TESTED | queue contention not measured |
| 42 | Self-test uses only synthetic fixtures | NOT TESTED | no corpus case |

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| pdf2excel | free-fiber.pdf<br><sub>pdf2excel-free-fiber</sub> | PASS | 2 sheets, 22 cells, coverage 1.00 | 12.4s, heap 9 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.98x size, 469 ms | 2.8s, heap 13 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.12x size, 532 ms | 1.8s, heap 25 MB |
| redact | pdfjs-rotation.pdf<br><sub>g3-redact-remove-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 0.94x size, 5 ms | 0.1s, heap 12 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.00x size, 25 ms | 0.3s, heap 13 MB |
| redact | c-rot270-cropbox.pdf<br><sub>g3-redact-remove-rot270-cropbox</sub> | PASS | 16 boxes on 2 page(s), 1.07x size, 63 ms | 0.4s, heap 12 MB |
| redact | c-rot180-origin.pdf<br><sub>g3-redact-remove-rot180-origin</sub> | PASS | 16 boxes on 2 page(s), 1.07x size, 94 ms | 0.5s, heap 13 MB |
| redact | aws-invoice.pdf<br><sub>g3-redact-remove-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 34 ms | 0.4s, heap 33 MB |
| redact | flipkart-invoice.pdf<br><sub>g3-redact-remove-flipkart</sub> | PASS | 6 boxes on 1 page(s), 1.02x size, 24 ms | 0.5s, heap 15 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-remove</sub> | PASS | review #1, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-image</sub> | PASS | review #1, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-remove</sub> | PASS | review #2, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-image</sub> | PASS | review #2, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-image</sub> | PASS | review #3, raster pages 1 | 0.3s, heap 13 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 14 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-image</sub> | PASS | review #3, raster pages 1 | 0.2s, heap 14 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-remove</sub> | PASS | review #4, raster pages none | 0.1s, heap 14 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-image</sub> | PASS | review #4, raster pages 1 | 0.6s, heap 12 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-remove</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-image</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-remove</sub> | PASS | review #6, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-image</sub> | PASS | review #6, raster pages 1 | 0.3s, heap 12 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-remove</sub> | PASS | review #7, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-image</sub> | PASS | review #7, raster pages 1 | 0.3s, heap 12 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-remove</sub> | PASS | review #8, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-image</sub> | PASS | review #8, raster pages 1 | 0.2s, heap 12 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-remove</sub> | PASS |  | 0.2s, heap 12 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-image</sub> | PASS |  | 0.5s, heap 12 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-actualtext-us-budget</sub> | PASS |  | 2.5s, heap 32 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 0.3s, heap 28 MB |
| intake | free-fiber.pdf<br><sub>intake-invoices/free-fiber.pdf</sub> | PASS | expect accept (2 p): "2 pages, 117.3 KB" | 0.3s |
