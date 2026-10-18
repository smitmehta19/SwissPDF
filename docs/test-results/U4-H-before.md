# Corpus scorecard: U4-H-before

Run: 2026-10-17 19:24 UTC, 6 min. Command: `npm run test:corpus -- --case ^h- --shards 4 --name U4-H-before`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **3 PASS, 20 FAIL, 0 SKIP** of 23 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| pdf2word | 2 | 9 | 0 | 421.2s |
| pdf2excel | 0 | 6 | 0 | 608.5s |
| pdf2ppt | 0 | 3 | 0 | 28.1s |
| pdf2md | 1 | 2 | 0 | 16.2s |

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
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | CONFIRMED | h-word-tracemonkey-columns: column lines stay in reading order (90%+) (23 of 109 line joins kept; missed "to com- pile than")<br>h-word-tracemonkey-columns: line-end hyphens joined (<= 5 "com- laboration") (104 left)<br>h-word-tracemonkey-columns: paragraph alignment carried (justified)<br>(+21 more) |
| 16 | PDF to Excel number parsing loses leading zeros / formats | CONFIRMED | h-excel-aws-typed: number cells typed (<2% left as text) (6 as text, e.g. "$4.11" "$4.11" "$4.11")<br>h-excel-aws-typed: typed $4.11 as currency (not found as a typed number)<br>h-excel-aws-typed: typed August 3, 2014 as a date (not found as a typed number)<br>(+6 more) |
| 17 | PDF to PPT slides are flat images, fixed slide size | CONFIRMED | h-ppt-tracemonkey-editable: slide text extractable (85%+ of words) (coverage 0.00)<br>h-ppt-tracemonkey-editable: every slide has editable text (14 slides without text)<br>h-ppt-rotation-mixed-editable: slide text extractable (85%+ of words) (coverage 0.00)<br>(+3 more) |
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

## Failures by tool

- **pdf2word** (9): `h-word-tracemonkey-columns` column lines stay in reading order (90%+): 23 of 109 line joins kept; missed "to com- pile than"; `h-word-bert-columns` column lines stay in reading order (90%+): 19 of 135 line joins kept; missed "to pre- train deep"; `h-word-attention-columns` line-end hyphens joined (<= 5 "com- laboration"): 15 left; `h-word-resnet-columns` column lines stay in reading order (90%+): 11 of 110 line joins kept; missed "provide com- prehensive empirical"; `h-word-camelot-tables` row with BTW + € 32,80: not in any table row; `h-word-netpresse-tables` row with Justificatif PDF + 0,75 €: not in any table row; +3 more
- **pdf2excel** (6): `h-excel-aws-typed` number cells typed (<2% left as text): 6 as text, e.g. "$4.11" "$4.11" "$4.11"; `h-excel-camelot-eu-typed` number cells typed (<2% left as text): 16 as text, e.g. "€ 156,20" "€ 156,20" "21%"; `h-excel-netpresse-eu-typed` typed 56,02 € (suffix currency): not found as a typed number; `h-excel-saeco-dates` typed 22-9-2022 as a date: not found as a typed number; `h-excel-fdic-speed-typed` error: timed out after 300s; `h-excel-fdic-joined` error: timed out after 300s
- **pdf2ppt** (3): `h-ppt-tracemonkey-editable` slide text extractable (85%+ of words): coverage 0.00; `h-ppt-rotation-mixed-editable` slide text extractable (85%+ of words): coverage 0.00; `h-ppt-aws-editable` slide text extractable (85%+ of words): coverage 0.00
- **pdf2md** (2): `h-md-tracemonkey-columns` column lines stay in reading order (90%+): 23 of 109; missed "to com- pile than"; `h-md-bert-columns` column lines stay in reading order (90%+): 19 of 135; missed "to pre- train deep"

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>h-word-tracemonkey-columns</sub> | FAIL | column lines stay in reading order (90%+): 23 of 109 line joins kept; missed "to com- pile than" | 30.9s, heap 7 MB |
| pdf2word | arxiv-1810.04805-bert.pdf<br><sub>h-word-bert-columns</sub> | FAIL | column lines stay in reading order (90%+): 19 of 135 line joins kept; missed "to pre- train deep" | 3.0s, heap 24 MB |
| pdf2word | arxiv-1706.03762-attention.pdf<br><sub>h-word-attention-columns</sub> | FAIL | line-end hyphens joined (<= 5 "com- laboration"): 15 left | 28.1s, heap 7 MB |
| pdf2word | arxiv-1512.03385-resnet.pdf<br><sub>h-word-resnet-columns</sub> | FAIL | column lines stay in reading order (90%+): 11 of 110 line joins kept; missed "provide com- prehensive empirical" | 1.8s, heap 23 MB |
| pdf2word | aws-invoice.pdf<br><sub>h-word-aws-tables</sub> | PASS | 2 tables, 19 rows, 121 ms | 0.3s, heap 24 MB |
| pdf2word | saeco.pdf<br><sub>h-word-saeco-tables</sub> | PASS | 1 tables, 8 rows, 2629 ms | 20.6s, heap 7 MB |
| pdf2word | camelot-bol.pdf<br><sub>h-word-camelot-tables</sub> | FAIL | row with BTW + € 32,80: not in any table row | 26.3s, heap 6 MB |
| pdf2word | netpresse-invoice.pdf<br><sub>h-word-netpresse-tables</sub> | FAIL | row with Justificatif PDF + 0,75 €: not in any table row | 4.7s, heap 11 MB |
| pdf2word | pdfjs-ArabicCIDTrueType.pdf<br><sub>h-word-arabic-cid-logical</sub> | FAIL | RTL lines in logical order: 0 of 4 lines | 0.2s, heap 16 MB |
| pdf2word | udhr-arabic.pdf<br><sub>h-word-udhr-arabic-logical</sub> | FAIL | RTL word order kept (80%+ of 3-word runs): 2 of 281 | 3.4s, heap 9 MB |
| pdf2word | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-word-fdic-speed-furniture</sub> | FAIL | error: timed out after 300s | 301.8s |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | FAIL | number cells typed (<2% left as text): 6 as text, e.g. "$4.11" "$4.11" "$4.11" | 2.8s, heap 6 MB |
| pdf2excel | camelot-bol.pdf<br><sub>h-excel-camelot-eu-typed</sub> | FAIL | number cells typed (<2% left as text): 16 as text, e.g. "€ 156,20" "€ 156,20" "21%" | 2.7s, heap 7 MB |
| pdf2excel | netpresse-invoice.pdf<br><sub>h-excel-netpresse-eu-typed</sub> | FAIL | typed 56,02 € (suffix currency): not found as a typed number | 2.7s, heap 7 MB |
| pdf2excel | saeco.pdf<br><sub>h-excel-saeco-dates</sub> | FAIL | typed 22-9-2022 as a date: not found as a typed number | 0.2s, heap 8 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-speed-typed</sub> | FAIL | error: timed out after 300s | 300.2s |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-joined</sub> | FAIL | error: timed out after 300s | 300.1s |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>h-ppt-tracemonkey-editable</sub> | FAIL | slide text extractable (85%+ of words): coverage 0.00 | 19.4s, heap 39 MB |
| pdf2ppt | pdfjs-rotation.pdf<br><sub>h-ppt-rotation-mixed-editable</sub> | FAIL | slide text extractable (85%+ of words): coverage 0.00 | 1.6s, heap 6 MB |
| pdf2ppt | aws-invoice.pdf<br><sub>h-ppt-aws-editable</sub> | FAIL | slide text extractable (85%+ of words): coverage 0.00 | 7.1s, heap 7 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | FAIL | column lines stay in reading order (90%+): 23 of 109; missed "to com- pile than" | 13.2s, heap 10 MB |
| pdf2md | arxiv-1810.04805-bert.pdf<br><sub>h-md-bert-columns</sub> | FAIL | column lines stay in reading order (90%+): 19 of 135; missed "to pre- train deep" | 2.5s, heap 8 MB |
| pdf2md | netpresse-invoice.pdf<br><sub>h-md-netpresse-tables</sub> | PASS | 1430 chars, 2 tables, 0 headings | 0.6s, heap 12 MB |
