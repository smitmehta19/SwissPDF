# Corpus scorecard: 2026-10-28-edittext-final

Run: 2026-10-28 13:06 UTC, 1.5 min. Command: `npm run test:corpus -- --light --shards 2 --case ^edittext- --name 2026-10-28-edittext-final`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **28 PASS, 0 FAIL, 0 SKIP** of 28 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| edittext | 28 | 0 | 0 | 38.5s |

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
| 18 | Office to PDF quick mode is screenshots (no text) | NOT TESTED | no corpus case |
| 19 | HiFi engine from unpinned CDN, font substitution | NOT TESTED | CDN pinning is a config review item; font fidelity not scored |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | NOT TESTED | no corpus case |
| 22 | Protect: comma in password splits MuPDF options | NOT TESTED | no corpus case |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | NOT TESTED | no corpus case |
| 24 | Sign is visual only, one placement | NOT TESTED | feature gap (no PAdES / multi-place API to call) |
| 25 | Redact rasterizes whole pages (size balloons) | NOT TESTED | no corpus case |
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
| edittext | aws-invoice.pdf<br><sub>edittext-invoice-aws-invoice</sub> | PASS | "estimated" p1 (HelveticaNeue-Roman); model 470ms; same 150+7ms orig; longer 114+4ms orig; missing 169+3ms Helvetica | 7.0s, heap 9 MB |
| edittext | flipkart-invoice.pdf<br><sub>edittext-invoice-flipkart-invoice</sub> | PASS | "manufacturer" p1 (Times-Italic); model 65ms; same 161+4ms orig; longer 168+5ms orig; missing 163+7ms Times-Italic | 1.0s, heap 9 MB |
| edittext | azure-interior.pdf<br><sub>edittext-invoice-azure-interior</sub> | PASS | "Beeswax" p1 (Lato-Regular); model 33ms; same 61+3ms orig; longer 66+4ms orig; missing 65+3ms Helvetica | 0.4s, heap 10 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-report-pdfjs-tracemonkey</sub> | PASS | "Andreas" p1 (NimbusRomNo9L-Regu); model 62ms; same 320+32ms orig; longer 303+18ms orig; missing 464+18ms Times-Roman | 2.1s, heap 10 MB |
| edittext | arxiv-1706.03762-attention.pdf<br><sub>edittext-report-arxiv-1706-03762-attenti</sub> | PASS | "Provided" p1 (NimbusRomNo9L-Regu); model 39ms; same 144+134ms orig; longer 201+124ms orig; missing 381+122ms Times-Roman | 2.3s, heap 10 MB |
| edittext | us-budget-2024.pdf<br><sub>edittext-report-us-budget-2024</sub> | PASS | "summary" p3 (NewCenturySchlbkLTStd-Ro); model 321ms; same 444+896ms orig; longer 552+875ms orig; missing 1172+834ms Times-Roman | 9.6s, heap 10 MB |
| edittext | irs-fw9.pdf<br><sub>edittext-rotated-irs-fw9</sub> | PASS | "Before" p1 (HelveticaNeueLTStd-Bd); model 59ms; same 332+15ms orig; longer 513+16ms orig; missing 561+17ms Helvetica-Bold | 1.9s, heap 9 MB |
| edittext | rot90-cropbox-bert.pdf<br><sub>edittext-rotated-rot90-cropbox-bert</sub> | PASS | "Kristina" p1 (NimbusRomNo9L-Medi); model 36ms; same 197+37ms orig; longer 199+27ms orig; missing 344+33ms Times-Bold | 1.8s, heap 9 MB |
| edittext | c-rot270-cropbox.pdf<br><sub>edittext-rotated-c-rot270-cropbox</sub> | PASS | "Type" p1 (NimbusRomNo9L-Medi); model 39ms; same 270+6ms orig; longer 320+7ms orig; missing 322+6ms Times-Bold | 1.3s, heap 9 MB |
| edittext | udhr-arabic.pdf<br><sub>edittext-intl-udhr-arabic</sub> | PASS | "اعتُمد" p1 (SegoeUI); model 30ms; same 384+17ms NotoSansArabic-Regular overflow; longer 107+10ms NotoSansArabic-Regular overflow; missing 102+13ms NotoSansArabic-Regular overflow; warn: longer: new text in MuPDF text with every mark (a combining mark is missing) | 1.0s, heap 9 MB |
| edittext | udhr-chinese-simplified.pdf<br><sub>edittext-intl-udhr-chinese-simplified</sub> | PASS | "一九" p1 (ArialUnicodeMS+1); model 53ms; same 63+6ms orig; longer 81+8ms orig; missing 159+7ms NotoSansSC-Regular | 0.8s, heap 9 MB |
| edittext | edittext-hindi.pdf<br><sub>edittext-intl-edittext-hindi</sub> | PASS | "सावर्भौम" p1 (NotoSansDevanagari-Regular-2000); model 4ms; same 74+12ms NotoSansDevanagari-Regular; longer 56+2ms NotoSansDevanagari-Regular; missing 41+2ms NotoSansDevanagari-Regular; warn: same: new text in pdf.js text ("सार्भौवम" not found); longer: new text in pdf.js text ("सार्भौवमसावर्भौ" not found); missing: new text in pdf.js text ("साऋर्भौम" not found) | 0.3s, heap 9 MB |
| edittext | fax-jean-schmidt-doe.pdf<br><sub>edittext-refuse-scanned-fax-jean-schmidt-doe</sub> | PASS | model 17ms, 46 runs, refused "scanned" in 17ms | 0.1s, heap 9 MB |
| edittext | pdfjs-vertical.pdf<br><sub>edittext-refuse-vertical-pdfjs-vertical</sub> | PASS | model 3ms, 8 runs, refused "vertical" in 3ms | 0.1s, heap 9 MB |
| edittext | udhr-hebrew.pdf<br><sub>edittext-refuse-no-unicode-udhr-hebrew</sub> | PASS | model 77ms, 1191 runs, refused "no-unicode" in 57ms | 0.3s, heap 9 MB |
| edittext | aws-invoice.pdf<br><sub>edittext-batch-aws-invoice</sub> | PASS | 3 edits in 97ms; original, fallback shift 11.98, original | 0.2s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-fit-pdfjs-tracemonkey</sub> | PASS | "Andreas" -> +abc at 0.7059 in 272ms | 0.8s, heap 9 MB |
| edittext | aws-invoice.pdf<br><sub>edittext-overflow-short-usage</sub> | PASS | "Usage" -> "UQage" in "† Usage and recurring charges for this s": overflow false, pushed 2.09, fallback, ms {"edit":106,"save":1,"total":107} | 0.2s, heap 9 MB |
| edittext | aws-invoice.pdf<br><sub>edittext-overflow-short-check</sub> | PASS | "Check" -> "Checkabc" in "*** Check the GST statement attached at ": overflow false, pushed 13.34, original, ms {"edit":98,"save":1,"total":99} | 0.2s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-overflow-widest-tracemonkey</sub> | PASS | "and" -> "andabcdefgh" in "and is used for the application logic of": overflow false, pushed 0, null, ms {"edit":42,"save":0,"total":42} | 0.4s, heap 9 MB |
| edittext | arxiv-1706.03762-attention.pdf<br><sub>edittext-overflow-widest-attention</sub> | PASS | "less" -> "lessabcdefgh" in "less time to train. Our model achieves 2": overflow true, pushed 37.17, original, ms {"edit":176,"save":8,"total":184} | 0.7s, heap 9 MB |
| edittext | edittext-actualtext.pdf<br><sub>edittext-actualtext-synthetic</sub> | PASS | "PATIENTNAME" p1: jane fallback 9+1ms; delete null 4+1ms | 0.1s, heap 10 MB |
| edittext | us-budget-2024.pdf<br><sub>edittext-actualtext-us-budget</sub> | PASS | "foreclosures" p11: at original 416+563ms | 4.0s, heap 10 MB |
| edittext | edittext-whitebox.pdf<br><sub>edittext-whitebox-no-push</sub> | PASS | "Visible" p1: grow original fit 0.8549 noPush covered 7+1ms | 0.1s, heap 9 MB |
| edittext | edittext-tight.pdf<br><sub>edittext-tight-075</sub> | PASS | "Kilo" p1: grow tight-lines 9+1ms | 0.1s, heap 9 MB |
| edittext | edittext-tight.pdf<br><sub>edittext-tight-090</sub> | PASS | "Kilo" p2: grow fallback 11+1ms | 0.1s, heap 9 MB |
| edittext | aws-invoice.pdf<br><sub>edittext-repeat-aws-invoice</sub> | PASS | 10 edits 69/59/88/58/59/59/59/61/58/69 ms, finalize 4 ms, 151871 B vs 149203 B | 1.1s, heap 9 MB |
| edittext | edittext-signed.pdf<br><sub>edittext-signed-aws-invoice</sub> | PASS | "estimated" edited in 86ms, signature removed | 0.3s, heap 9 MB |
