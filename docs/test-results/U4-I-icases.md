# Corpus scorecard: U4-I-icases

Run: 2026-10-17 18:30 UTC, 1.7 min. Command: `npm run test:corpus -- --tool word2pdf,excel2pdf,ppt2pdf,html2pdf --layer ops --case ^(office-engine-load|i-) --name U4-I-icases`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **21 PASS, 0 FAIL, 0 SKIP** of 21 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 9 | 0 | 0 | 48.9s |
| excel2pdf | 4 | 0 | 0 | 4.2s |
| ppt2pdf | 4 | 0 | 0 | 3.4s |
| html2pdf | 4 | 0 | 0 | 41.9s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT TESTED | no corpus case |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT TESTED | no corpus case |
| 3 | Redact search misses phrases split across text items | NOT TESTED | no corpus case |
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
| 18 | Office to PDF quick mode is screenshots (no text) | NOT REPRODUCED | 12 linked check(s) passed, e.g. i-hifi-poi-SampleSS.xlsx: selectable text (pdf.js); i-hifi-poi-SampleShow.pptx: selectable text (pdf.js) |
| 19 | HiFi engine from unpinned CDN, font substitution | CONFIRMED | office-engine-load: no fetches outside the page origin (cdn.zetaoffice.net) |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | NOT TESTED | no corpus case |
| 22 | Protect: comma in password splits MuPDF options | NOT TESTED | no corpus case |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | NOT TESTED | no corpus case |
| 24 | Sign is visual only, one placement | NOT TESTED | feature gap (no PAdES / multi-place API to call) |
| 25 | Redact rasterizes whole pages (size balloons) | NOT TESTED | no corpus case |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT TESTED | no corpus case |
| 27 | Compare by page index only; inserted page breaks the rest | NOT TESTED | no corpus case |
| 28 | HTML to PDF is a screenshot, head styles dropped | NOT REPRODUCED | 7 linked check(s) passed, e.g. i-html2pdf-hifi-styled-report: no remote fetches (stylesheet, @import, images); i-html2pdf-hifi-styled-report: selectable text (90%+ of the source words) |
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
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 16.0s, heap 24 MB |
| word2pdf | -<br><sub>i-engine-pinned-warm-boot</sub> | PASS | cold boot 10818 ms (download 3167 ms, cache false), warm boot 8935 ms | 19.9s, heap 39 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-convert-no-network</sub> | PASS |  | 1.7s, heap 37 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>i-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 1529 ms, fonts Carlito-Bold Carlito | 1.6s, heap 38 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>i-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 977 ms, fonts Carlito-Italic Carlito LiberationSans NotoSans-Regular | 1.1s, heap 20 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>i-hifi-poi-Tables.xlsx</sub> | PASS | 15 pages, 1259 ms, fonts LiberationSerif-Bold LiberationSerif-Italic LiberationSerif | 1.3s, heap 20 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>i-hifi-poi-VariousPictures.docx</sub> | PASS | 1 pages, 695 ms, fonts Carlito | 1.1s, heap 20 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>i-hifi-poi-WithThreeCharts.xlsx</sub> | PASS | 3 pages, 529 ms, fonts Carlito-Bold Carlito | 0.6s, heap 21 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>i-hifi-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 858 ms, fonts Carlito | 1.1s, heap 21 MB |
| word2pdf | poi-chartex.docx<br><sub>i-hifi-poi-chartex.docx</sub> | PASS | 3 pages, 1222 ms, fonts Carlito LiberationSerif OpenSymbol | 1.4s, heap 20 MB |
| excel2pdf | poi-picture.xlsx<br><sub>i-hifi-poi-picture.xlsx</sub> | PASS | 3 pages, 385 ms, fonts Carlito LiberationSans-Bold LiberationSans-Italic LiberationSans | 0.5s, heap 20 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>i-hifi-poi-pie-chart.pptx</sub> | PASS | 1 pages, 481 ms, fonts Carlito-Bold Carlito | 0.6s, heap 20 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-poi-sample.docx</sub> | PASS | 1 pages, 191 ms, fonts Carlito | 0.2s, heap 20 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>i-hifi-poi-table_footnotes.docx</sub> | PASS | 1 pages, 229 ms, fonts Carlito | 0.3s, heap 19 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>i-hifi-poi-table_test.pptx</sub> | PASS | 1 pages, 581 ms, fonts none | 0.7s, heap 20 MB |
| word2pdf | -<br><sub>i-font-probe-docx</sub> | PASS | per line: Calibri=BAAAAA+Carlito, Calibri Light=BAAAAA+Carlito, Cambria=CAAAAA+Caladea-Regular, Aptos=DAAAAA+NotoSans-Regular, SimSun=EAAAAA+NotoSerif-Regular, MS Gothic=DAAAAA+NotoSans-Regular, Malgun Gothic=DAAAAA+NotoSans-Regular, Mangal=DAAAAA+NotoSans-Regular; embedded: Caladea-Regular, Carlito, NotoSans-Regular, NotoSansKR-Regular, NotoSansSC-Regular, NotoSerif-Regular; warn: Devanagari text | 0.4s, heap 20 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-styled-report</sub> | PASS | 1 page(s), 43 KB, 411 ms, coverage 0.98 | 2.2s, heap 22 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-long-page</sub> | PASS | 23 pages, 478 KB, 1511 ms | 1.7s, heap 24 MB |
| word2pdf | poi-sample.docx<br><sub>i-engine-hang-restart</sub> | PASS | reboot + convert 7757 ms | 7.9s, heap 40 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-styled-report</sub> | PASS | 1 page(s), 152 KB, 485 ms | 1.3s, heap 6 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-long-page</sub> | PASS | 22 pages, 3.9 MB, 35754 ms | 36.8s, heap 42 MB |
