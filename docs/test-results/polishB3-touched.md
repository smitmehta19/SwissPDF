# Corpus scorecard: polishB3-touched

Run: 2026-10-27 20:40 UTC, 1.1 min. Command: `npm run test:corpus -- --light --shards 2 --tool sanitize,removeimages,redact --name polishB3-touched`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **78 PASS, 0 FAIL, 0 SKIP** of 78 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| redact | 60 | 0 | 0 | 63.1s |
| sanitize | 12 | 0 | 0 | 7.5s |
| removeimages | 6 | 0 | 0 | 4.3s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT TESTED | no corpus case |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT REPRODUCED | 25 linked check(s) passed, e.g. redact-tracemonkey: black box covers the word on screen; redact-aws-invoice: black box covers the word on screen |
| 3 | Redact search misses phrases split across text items | NOT REPRODUCED | 4 linked check(s) passed, e.g. redact-find-split-uk-IPPH353: search finds a phrase split across text items; redact-find-split-uk-AFPS-Form-17: search finds a phrase split across text items |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | NOT TESTED | no corpus case |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT TESTED | no corpus case |
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
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 28 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (5.9x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (10.8x input) (+1 more) |
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
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.9x size; warn: size stays reasonable (<= 3x) (5.9x input) | 9.2s, heap 17 MB |
| redact | aws-invoice.pdf<br><sub>redact-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 1.2s, heap 12 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.8x size; warn: size stays reasonable (<= 3x) (10.8x input) | 4.7s, heap 29 MB |
| redact | pdfjs-rotation.pdf<br><sub>redact-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 4.4x size; warn: size stays reasonable (<= 3x) (4.4x input) | 4.7s, heap 10 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>redact-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 1.2s, heap 10 MB |
| redact | letter-to-benjamin-glover.pdf<br><sub>redact-numbered-scan-letter-to-benjamin-glover</sub> | PASS |  | 1.0s, heap 10 MB |
| redact | fax-jean-schmidt-doe.pdf<br><sub>redact-numbered-scan-fax-jean-schmidt-doe</sub> | PASS |  | 0.6s, heap 11 MB |
| redact | letter-to-benjamin-glover.pdf<br><sub>redact-watermarked-scan-letter-to-benjamin-glover</sub> | PASS |  | 1.5s, heap 12 MB |
| redact | letter-to-benjamin-glover.pdf<br><sub>redact-watermarked-96pt-scan-letter-to-benjamin-glover</sub> | PASS |  | 3.1s, heap 12 MB |
| redact | uk-IPPH353.pdf<br><sub>redact-find-split-uk-IPPH353</sub> | PASS |  | 0.2s, heap 12 MB |
| redact | uk-AFPS-Form-17.pdf<br><sub>redact-find-split-uk-AFPS-Form-17</sub> | PASS |  | 0.2s, heap 12 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.94x size, 363 ms | 1.1s, heap 14 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.00x size, 432 ms | 1.1s, heap 20 MB |
| redact | pdfjs-rotation.pdf<br><sub>g3-redact-remove-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 0.83x size, 7 ms | 0.1s, heap 12 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 32 ms | 1.7s, heap 17 MB |
| redact | c-rot270-cropbox.pdf<br><sub>g3-redact-remove-rot270-cropbox</sub> | PASS | 16 boxes on 2 page(s), 0.99x size, 91 ms | 0.5s, heap 13 MB |
| redact | c-rot180-origin.pdf<br><sub>g3-redact-remove-rot180-origin</sub> | PASS | 16 boxes on 2 page(s), 0.99x size, 161 ms | 0.8s, heap 13 MB |
| redact | aws-invoice.pdf<br><sub>g3-redact-remove-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 0.96x size, 40 ms | 0.3s, heap 34 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-image-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.77x size, 1912 ms | 4.5s, heap 30 MB |
| redact | flipkart-invoice.pdf<br><sub>g3-redact-remove-flipkart</sub> | PASS | 6 boxes on 1 page(s), 1.01x size, 21 ms | 0.5s, heap 14 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-image-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.93x size, 1591 ms | 3.8s, heap 20 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | PASS |  | 0.1s, heap 13 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | PASS |  | 0.3s, heap 21 MB |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | PASS |  | 0.4s, heap 21 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-remove</sub> | PASS | review #1, raster pages none | 0.1s, heap 14 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-image</sub> | PASS | review #1, raster pages none | 0.1s, heap 15 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-remove</sub> | PASS | review #2, raster pages none | 0.4s, heap 14 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-image</sub> | PASS | review #2, raster pages none | 0.1s, heap 15 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 14 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-image</sub> | PASS | review #3, raster pages 1 | 0.3s, heap 15 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-remove</sub> | PASS | review #3, raster pages none | 0.3s, heap 14 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-image</sub> | PASS | review #3, raster pages 1 | 0.2s, heap 15 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-remove</sub> | PASS | review #4, raster pages none | 0.1s, heap 15 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-image</sub> | PASS | review #4, raster pages 1 | 0.6s, heap 15 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-remove</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 15 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-image</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 16 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-remove</sub> | PASS | review #6, raster pages none | 0.2s, heap 15 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-image</sub> | PASS | review #6, raster pages 1 | 0.2s, heap 16 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-remove</sub> | PASS | review #7, raster pages none | 0.1s, heap 15 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-image</sub> | PASS | review #7, raster pages 1 | 0.3s, heap 16 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-remove</sub> | PASS | review #8, raster pages none | 0.2s, heap 15 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-image</sub> | PASS | review #8, raster pages 1 | 0.4s, heap 16 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-remove</sub> | PASS | review #r2-2, raster pages none | 0.1s, heap 16 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-image</sub> | PASS | review #r2-2, raster pages 1 | 0.3s, heap 13 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.3s, heap 16 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-image</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 13 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.4s, heap 16 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-image</sub> | PASS | review #r2-1, raster pages 1 | 0.4s, heap 14 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-remove</sub> | PASS | review #r2-3, raster pages none | 0.1s, heap 16 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-image</sub> | PASS | review #r2-3, raster pages 1 | 0.3s, heap 14 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-remove</sub> | PASS | review #r2-6, raster pages none | 0.1s, heap 17 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-image</sub> | PASS | review #r2-6, raster pages 1 | 0.6s, heap 14 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-remove</sub> | PASS |  | 0.3s, heap 14 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-image</sub> | PASS |  | 0.8s, heap 13 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-actualtext-us-budget</sub> | PASS |  | 3.4s, heap 55 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 123 ms | 0.7s, heap 15 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.3s, heap 63 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-regex-budget-phones</sub> | PASS | 6 boxes, (202) 512-1530, (888) 293-6498, (202) 512-1800 | 3.5s, heap 54 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.2s, heap 76 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 4.0s, heap 76 MB |
| sanitize | loose-attachment.pdf<br><sub>u5b-sanitize-loose-attachment</sub> | PASS | run to result 479 ms: Removed 1 attached file. | 1.1s, heap 9 MB |
| sanitize | loose-attachment-notype.pdf<br><sub>u5b-sanitize-loose-attachment-notype</sub> | PASS | run to result 5 ms: Removed 1 attached file, what earlier versions of the file left behind. | 0.1s, heap 10 MB |
| sanitize | loose-attachment-escaped.pdf<br><sub>u5b-sanitize-loose-attachment-escaped</sub> | PASS | run to result 501 ms: Removed 1 attached file, what earlier versions of the file left behind. | 1.0s, heap 9 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-facturx</sub> | PASS | run to result 23 ms: Removed 1 attached file. | 0.3s, heap 10 MB |
| sanitize | xfa-imm1344e-filled.pdf<br><sub>u5b-sanitize-xfa-imm1344e</sub> | PASS | run to result 112 ms: Removed 39 scripts, 355 XFA scripts, what earlier versions of the file left behind. | 0.2s, heap 11 MB |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | PASS | run to result 136 ms: Removed 3 scripts, 1 XFA form, what earlier versions of the file left behind. | 0.5s, heap 10 MB |
| sanitize | uscis-i-9.pdf<br><sub>u5b-sanitize-i9</sub> | PASS | run to result 424 ms: Removed 28 scripts, 32 triggers. | 0.9s, heap 9 MB |
| sanitize | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-sanitize-fileattachment</sub> | PASS | run to result 15 ms: Removed 1 attached file, what earlier versions of the file left behind. | 0.2s, heap 14 MB |
| sanitize | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-sanitize-all-tracemonkey</sub> | PASS | run to result 116 ms: Removed 1 info dictionary, 24 embedded fonts, what earlier versions of the file left behind. | 0.5s, heap 11 MB |
| sanitize | pdfjs-tracemonkey.pdf<br><sub>u5b-sanitize-tracemonkey</sub> | PASS | run to result 96 ms: Nothing found to remove. | 0.5s, heap 14 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-aws</sub> | PASS | run to result 12 ms: Nothing found to remove. | 0.1s, heap 16 MB |
| sanitize | arxiv-1706.03762-attention.pdf<br><sub>u5b-sanitize-attention</sub> | PASS | run to result 896 ms: Nothing found to remove. | 2.0s, heap 18 MB |
| removeimages | loose-image.pdf<br><sub>u5b-removeimages-loose-image</sub> | PASS | run to result 425 ms: 1 image left over from an earlier version of the file removed, 170 B saved. | 1.1s, heap 9 MB |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | PASS | run to result 543 ms: Images removed on 3 pages, 177.9 KB saved. | 1.2s, heap 9 MB |
| removeimages | aws-invoice.pdf<br><sub>u5b-removeimages-aws</sub> | PASS | run to result 5 ms: Images removed on 1 page, 66.6 KB saved. | 0.1s, heap 12 MB |
| removeimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-removeimages-attention</sub> | PASS | run to result 362 ms: Images removed on 2 pages, 604.8 KB saved. | 1.3s, heap 17 MB |
| removeimages | udhr-hebrew.pdf<br><sub>u5b-removeimages-inline-hebrew</sub> | PASS | run to result 8 ms: No images found, the file is unchanged. | 0.1s, heap 17 MB |
| removeimages | arxiv-2005.14165-gpt3.pdf<br><sub>u5b-removeimages-inline-gpt3</sub> | PASS | run to result 83 ms: Images removed on 26 pages, 5.97 MB saved. | 0.4s, heap 17 MB |
