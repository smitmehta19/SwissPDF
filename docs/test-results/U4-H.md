# Corpus scorecard: U4-H

Run: 2026-10-17 19:42 UTC, 2.2 min. Command: `npm run test:corpus -- --tool pdf2word,pdf2excel,pdf2ppt,pdf2md --shards 4 --name U4-H`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **53 PASS, 0 FAIL, 0 SKIP** of 53 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| pdf2word | 23 | 0 | 0 | 122.2s |
| pdf2excel | 12 | 0 | 0 | 28.7s |
| pdf2ppt | 6 | 0 | 0 | 19.2s |
| pdf2md | 12 | 0 | 0 | 18.8s |


## Delta vs 2026-10-17-U1

Baseline: 461 PASS, 16 FAIL, 0 SKIP of 477. This run: 53 PASS, 0 FAIL, 0 SKIP of 53.
Same rows: 28. FAIL->PASS: 0. PASS->FAIL: 0. Still failing: 0. New rows: 25 (25 pass, 0 fail). Rows gone: 449.

### PASS->FAIL (regressions): 0

None.

### FAIL->PASS: 0


### Still failing, by owning unit: 0

Unit from the audit finding of the first failing check, else from the tool. New = row not in the baseline.


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
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | CONFIRMED | pdf2word-tracemonkey-2col: column lines stay in reading order (30 of 43 line joins kept)<br>pdf2word-bert-2col: column lines stay in reading order (35 of 59 line joins kept) |
| 16 | PDF to Excel number parsing loses leading zeros / formats | CONFIRMED | pdf2excel-aws-invoice: leading-zero / long ids kept as text (lost 0000) |
| 17 | PDF to PPT slides are flat images, fixed slide size | CONFIRMED | pdf2ppt-rotation-mixed: mixed page shapes each fit their slide (2 page aspects, one slide size) |
| 18 | Office to PDF quick mode is screenshots (no text) | NOT TESTED | no corpus case |
| 19 | HiFi engine from unpinned CDN, font substitution | NOT TESTED | CDN pinning is a config review item; font fidelity not scored |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT REPRODUCED | 3 linked check(s) passed, e.g. pdf2md-noembed-sjis: words carried over (85%+); pdf2md-noembed-eucjp: words carried over (85%+) |
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
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>pdf2word-tracemonkey-2col</sub> | PASS | coverage 0.94, 11 tables, 88 images; warn: column lines stay in reading order (30 of 43 line joins kept) | 11.5s, heap 9 MB |
| pdf2word | arxiv-1810.04805-bert.pdf<br><sub>pdf2word-bert-2col</sub> | PASS | coverage 0.86, 14 tables, 38 images; warn: column lines stay in reading order (35 of 59 line joins kept) | 3.3s, heap 34 MB |
| pdf2word | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>pdf2word-fdic</sub> | PASS | coverage 0.98, 60 tables, 43 images | 10.5s, heap 19 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice</sub> | PASS | coverage 1.00, 3 tables, 1 images | 7.4s, heap 9 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice-exact</sub> | PASS | coverage 1.00, 0 tables, 1 images | 0.6s, heap 48 MB |
| pdf2word | flipkart-invoice.pdf<br><sub>pdf2word-flipkart</sub> | PASS | coverage 1.00, 1 tables, 6 images | 0.4s, heap 11 MB |
| pdf2word | udhr-arabic.pdf<br><sub>pdf2word-arabic</sub> | PASS | coverage 1.00, 0 tables, 0 images | 1.3s, heap 11 MB |
| pdf2word | udhr-chinese-simplified.pdf<br><sub>pdf2word-chinese</sub> | PASS | coverage 1.00, 0 tables, 0 images | 0.7s, heap 14 MB |
| pdf2word | fax-jean-schmidt-doe.pdf<br><sub>pdf2word-scanned-fax</sub> | PASS |  | 0.7s, heap 9 MB |
| pdf2word | 911-commission-report.pdf<br><sub>pdf2word-911-large</sub> | PASS | coverage 0.97, 16 tables, 34 images | 12.6s, heap 199 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>h-word-tracemonkey-columns</sub> | PASS | 108/109 joins, 2 broken hyphens, 11 tables, 2965 ms | 3.2s, heap 204 MB |
| pdf2word | arxiv-1810.04805-bert.pdf<br><sub>h-word-bert-columns</sub> | PASS | 127/135 joins, 3 broken hyphens, 14 tables, 2073 ms | 2.2s, heap 44 MB |
| pdf2word | arxiv-1706.03762-attention.pdf<br><sub>h-word-attention-columns</sub> | PASS | 48/50 joins, 4 broken hyphens, 9 tables, 1809 ms | 2.2s, heap 44 MB |
| pdf2word | arxiv-1512.03385-resnet.pdf<br><sub>h-word-resnet-columns</sub> | PASS | 110/110 joins, 4 broken hyphens, 24 tables, 1222 ms | 1.4s, heap 23 MB |
| pdf2word | aws-invoice.pdf<br><sub>h-word-aws-tables</sub> | PASS | 3 tables, 22 rows, 134 ms | 0.6s, heap 11 MB |
| pdf2word | saeco.pdf<br><sub>h-word-saeco-tables</sub> | PASS | 3 tables, 11 rows, 139 ms | 0.4s, heap 18 MB |
| pdf2word | camelot-bol.pdf<br><sub>h-word-camelot-tables</sub> | PASS | 5 tables, 11 rows, 72 ms | 0.4s, heap 22 MB |
| pdf2word | netpresse-invoice.pdf<br><sub>h-word-netpresse-tables</sub> | PASS | 2 tables, 7 rows, 440 ms | 0.6s, heap 14 MB |
| pdf2word | pdfjs-ArabicCIDTrueType.pdf<br><sub>h-word-arabic-cid-logical</sub> | PASS | 4/4 RTL lines in reading order | 0.2s, heap 24 MB |
| pdf2word | udhr-arabic.pdf<br><sub>h-word-udhr-arabic-logical</sub> | PASS | 278/281 three-word runs in order | 0.5s, heap 18 MB |
| pdf2word | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-word-fdic-speed-furniture</sub> | PASS | 2.9 s, 60 tables, coverage 1.00 | 3.2s, heap 25 MB |
| pdf2word | sub-ndl-konoye-p1.pdf<br><sub>h-word-jpeg-scan-ndl</sub> | PASS | 1 OCR pages, 0 images, 13 words, 4.4 s | 4.5s, heap 48 MB |
| pdf2word | letter-to-benjamin-glover.pdf<br><sub>h-word-jpeg-scan-glover</sub> | PASS | 2 OCR pages, 0 images, 24 words, 52.2 s | 53.9s, heap 28 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 73 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 8.5s, heap 7 MB |
| pdf2excel | flipkart-invoice.pdf<br><sub>pdf2excel-flipkart</sub> | PASS | 1 sheets, 36 cells, coverage 1.00 | 1.9s, heap 7 MB |
| pdf2excel | camelot-bol.pdf<br><sub>pdf2excel-camelot-bol</sub> | PASS | 1 sheets, 64 cells, coverage 1.00 | 0.1s, heap 8 MB |
| pdf2excel | saeco.pdf<br><sub>pdf2excel-saeco</sub> | PASS | 1 sheets, 53 cells, coverage 1.00 | 0.6s, heap 8 MB |
| pdf2excel | free-fiber.pdf<br><sub>pdf2excel-free-fiber</sub> | PASS | 2 sheets, 22 cells, coverage 1.00 | 0.2s, heap 9 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>pdf2excel-fdic</sub> | PASS | 44 sheets, 5302 cells, coverage 0.99 | 9.6s, heap 16 MB |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | PASS | 1 sheets, 22 numbers, 0 numeric text, 0.1 s | 0.3s, heap 8 MB |
| pdf2excel | camelot-bol.pdf<br><sub>h-excel-camelot-eu-typed</sub> | PASS | 1 sheets, 18 numbers, 0 numeric text, 0.0 s | 0.2s, heap 9 MB |
| pdf2excel | netpresse-invoice.pdf<br><sub>h-excel-netpresse-eu-typed</sub> | PASS | 1 sheets, 10 numbers, 0 numeric text, 0.3 s | 0.5s, heap 11 MB |
| pdf2excel | saeco.pdf<br><sub>h-excel-saeco-dates</sub> | PASS | 1 sheets, 14 numbers, 0 numeric text, 0.1 s | 0.2s, heap 10 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-speed-typed</sub> | PASS | 44 sheets, 2860 numbers, 2 numeric text, 3.2 s | 3.6s, heap 26 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-joined</sub> | PASS | 1 sheets, 2680 numbers, 2 numeric text, 2.8 s | 2.9s, heap 20 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>pdf2ppt-tracemonkey</sub> | PASS | 14 slides, 99 images, 2.0 MB | 7.4s, heap 17 MB |
| pdf2ppt | pdfjs-rotation.pdf<br><sub>pdf2ppt-rotation-mixed</sub> | PASS | 2 slides, 1 images, 50 KB; warn: mixed page shapes each fit their slide (2 page aspects, one slide size) | 2.1s, heap 8 MB |
| pdf2ppt | rot90-cropbox-bert.pdf<br><sub>pdf2ppt-rot90-cropbox</sub> | PASS | 16 slides, 50 images, 2.2 MB | 4.6s, heap 16 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>h-ppt-tracemonkey-editable</sub> | PASS | 14 slides, 83231 chars, 99 media, 2.0 MB, 4.3 s | 4.5s, heap 26 MB |
| pdf2ppt | pdfjs-rotation.pdf<br><sub>h-ppt-rotation-mixed-editable</sub> | PASS | 2 slides, 152 chars, 1 media, 50 KB, 0.0 s | 0.1s, heap 7 MB |
| pdf2ppt | aws-invoice.pdf<br><sub>h-ppt-aws-editable</sub> | PASS | 1 slides, 1853 chars, 3 media, 152 KB, 0.3 s | 0.5s, heap 9 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 85800 chars, 14 headings, 11 tables | 3.6s, heap 10 MB |
| pdf2md | us-budget-2024.pdf<br><sub>pdf2md-budget</sub> | PASS | 596818 chars, 29 headings, 125 tables | 4.4s, heap 21 MB |
| pdf2md | aws-invoice.pdf<br><sub>pdf2md-aws-invoice</sub> | PASS | 2076 chars, 5 headings, 3 tables | 3.7s, heap 6 MB |
| pdf2md | udhr-chinese-simplified.pdf<br><sub>pdf2md-chinese</sub> | PASS | 5895 chars, 0 headings, 0 tables | 0.3s, heap 25 MB |
| pdf2md | udhr-japanese.pdf<br><sub>pdf2md-japanese</sub> | PASS | 4587 chars, 0 headings, 0 tables | 0.6s, heap 7 MB |
| pdf2md | pdfjs-noembed-sjis.pdf<br><sub>pdf2md-noembed-sjis</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.2s, heap 33 MB |
| pdf2md | pdfjs-noembed-eucjp.pdf<br><sub>pdf2md-noembed-eucjp</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.2s, heap 10 MB |
| pdf2md | pdfjs-vertical.pdf<br><sub>pdf2md-vertical</sub> | PASS | 20 chars, 0 headings, 0 tables | 0.1s, heap 34 MB |
| pdf2md | udhr-arabic.pdf<br><sub>pdf2md-arabic</sub> | PASS | 8269 chars, 0 headings, 0 tables | 0.5s, heap 10 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | PASS | 85800 chars, 11 tables, 14 headings | 2.6s, heap 11 MB |
| pdf2md | arxiv-1810.04805-bert.pdf<br><sub>h-md-bert-columns</sub> | PASS | 68234 chars, 14 tables, 17 headings | 1.9s, heap 34 MB |
| pdf2md | netpresse-invoice.pdf<br><sub>h-md-netpresse-tables</sub> | PASS | 1472 chars, 2 tables, 0 headings | 0.5s, heap 9 MB |
