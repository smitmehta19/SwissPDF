# Corpus scorecard: G4-convert

Run: 2026-10-17 19:08 UTC, 6.7 min. Command: `npm run test:corpus -- --tool img2pdf,pdf2img,word2pdf,excel2pdf,ppt2pdf,html2pdf,pdf2word,pdf2excel,pdf2ppt,pdf2md --shards 4 --name G4-convert`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **77 PASS, 4 FAIL, 0 SKIP** of 81 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 9 | 0 | 0 | 35.9s |
| excel2pdf | 5 | 3 | 0 | 51.7s |
| ppt2pdf | 8 | 0 | 0 | 9.5s |
| pdf2word | 10 | 0 | 0 | 376.6s |
| pdf2excel | 5 | 1 | 0 | 347.9s |
| pdf2ppt | 3 | 0 | 0 | 13.9s |
| pdf2md | 9 | 0 | 0 | 11.8s |
| img2pdf | 12 | 0 | 0 | 23.2s |
| pdf2img | 15 | 0 | 0 | 32.1s |
| html2pdf | 1 | 0 | 0 | 2.4s |


## Delta vs 2026-10-17-U1

Baseline: 461 PASS, 16 FAIL, 0 SKIP of 477. This run: 77 PASS, 4 FAIL, 0 SKIP of 81.
Same rows: 81. FAIL->PASS: 5. PASS->FAIL: 1. Still failing: 3. New rows: 0 (0 pass, 0 fail). Rows gone: 396.

### PASS->FAIL (regressions): 1

| Case | Now | Baseline detail |
|---|---|---|
| pdf2excel-fdic | xlsx opens: Unsupported ZIP Compression method NaN | 44 sheets, 10476 cells, coverage 1.00 |

### FAIL->PASS: 5

| Case | Was | Now |
|---|---|---|
| img2pdf-heic-libheif-example.heic | image decoded: Not a supported image file. | 1 page(s), 8.5x5.7 in, 455 KB |
| img2pdf-heic-nokia-C001.heic | image decoded: Not a supported image file. | 1 page(s), 8.5x4.8 in, 219 KB |
| img2pdf-tiff-multipage-mmap.tiff | image decoded: Not a supported image file. | 3 page(s), 0.1x0.1 in, 4 KB |
| img2pdf-tiff-multipage.tiff | image decoded: Not a supported image file. | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) |
| pdf2img-jbig2-header | page 1 not blank: ink 0.00% | ink 41.0% |

### Still failing, by owning unit: 3

Unit from the audit finding of the first failing check, else from the tool. New = row not in the baseline.

#### U4 (3)

| Case | Audit | Detail |
|---|---|---|
| excel2pdf-quick-poi-SampleSS.xlsx |  | error: TypeError: Cannot read properties of undefined (reading 'indexOf') |
| excel2pdf-quick-poi-WithThreeCharts.xlsx |  | error: TypeError: Cannot read properties of undefined (reading 'indexOf') |
| excel2pdf-quick-poi-picture.xlsx |  | error: TypeError: Cannot read properties of undefined (reading 'indexOf') |


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
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | CONFIRMED | pdf2word-tracemonkey-2col: column lines stay in reading order (4 of 43 line joins kept)<br>pdf2word-bert-2col: column lines stay in reading order (6 of 59 line joins kept) |
| 16 | PDF to Excel number parsing loses leading zeros / formats | CONFIRMED | pdf2excel-aws-invoice: leading-zero / long ids kept as text (lost 0000) |
| 17 | PDF to PPT slides are flat images, fixed slide size | CONFIRMED | pdf2ppt-tracemonkey: slides carry editable text (0 chars)<br>pdf2ppt-rotation-mixed: slides carry editable text (0 chars)<br>pdf2ppt-rotation-mixed: mixed page shapes each fit their slide (2 page aspects, one slide size)<br>(+1 more) |
| 18 | Office to PDF quick mode is screenshots (no text) | CONFIRMED | ppt2pdf-quick-poi-SampleShow.pptx: selectable text (coverage 0.00)<br>excel2pdf-quick-poi-Tables.xlsx: selectable text (coverage 0.00)<br>word2pdf-quick-poi-VariousPictures.docx: selectable text (coverage 0.00)<br>(+4 more) |
| 19 | HiFi engine from unpinned CDN, font substitution | CONFIRMED | office-engine-load: no fetches outside the page origin (cdn.zetaoffice.net) |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT REPRODUCED | 15 linked check(s) passed, e.g. pdf2md-noembed-sjis: words carried over (85%+); pdf2md-noembed-eucjp: words carried over (85%+) |
| 21 | Forms: XFA not handled, slow widget map | NOT TESTED | no corpus case |
| 22 | Protect: comma in password splits MuPDF options | NOT TESTED | no corpus case |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | CONFIRMED | img2pdf-photo-24MP-punjab-smartphone.jpg: fit page is a sane paper size (<= 17 in) (40.1 x 26.7 in)<br>img2pdf-photo-castle-3456x2628.jpg: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in)<br>img2pdf-tiff-multipage.tiff: output not bloated (<= 3x input) (4.8x input) |
| 24 | Sign is visual only, one placement | NOT TESTED | feature gap (no PAdES / multi-place API to call) |
| 25 | Redact rasterizes whole pages (size balloons) | NOT TESTED | no corpus case |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT TESTED | no corpus case |
| 27 | Compare by page index only; inserted page breaks the rest | NOT TESTED | no corpus case |
| 28 | HTML to PDF is a screenshot, head styles dropped | CONFIRMED | html2pdf-tracemonkey-text: selectable text (coverage 0.00) |
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

- **excel2pdf** (3): `excel2pdf-quick-poi-SampleSS.xlsx` error: TypeError: Cannot read properties of undefined (reading 'indexOf'); `excel2pdf-quick-poi-WithThreeCharts.xlsx` error: TypeError: Cannot read properties of undefined (reading 'indexOf'); `excel2pdf-quick-poi-picture.xlsx` error: TypeError: Cannot read properties of undefined (reading 'indexOf')
- **pdf2excel** (1): `pdf2excel-fdic` xlsx opens: Unsupported ZIP Compression method NaN

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 13.4s, heap 28 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 1.9s, heap 25 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 2.0s, heap 26 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>excel2pdf-hifi-poi-Tables.xlsx</sub> | PASS | 15 pages, 71 KB, text coverage 1.00 | 2.3s, heap 27 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>word2pdf-hifi-poi-VariousPictures.docx</sub> | PASS | 1 pages, 88 KB, text coverage 1.00 | 1.5s, heap 28 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>excel2pdf-hifi-poi-WithThreeCharts.xlsx</sub> | PASS | 3 pages, 27 KB, text coverage undefined | 0.7s, heap 29 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>ppt2pdf-hifi-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 157 KB, text coverage undefined | 1.2s, heap 30 MB |
| word2pdf | poi-chartex.docx<br><sub>word2pdf-hifi-poi-chartex.docx</sub> | PASS | 3 pages, 67 KB, text coverage 1.00 | 1.4s, heap 24 MB |
| excel2pdf | poi-picture.xlsx<br><sub>excel2pdf-hifi-poi-picture.xlsx</sub> | PASS | 3 pages, 315 KB, text coverage 1.00 | 1.6s, heap 24 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>ppt2pdf-hifi-poi-pie-chart.pptx</sub> | PASS | 1 pages, 15 KB, text coverage 1.00 | 0.8s, heap 24 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 1.4s, heap 24 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>word2pdf-hifi-poi-table_footnotes.docx</sub> | PASS | 1 pages, 11 KB, text coverage 1.00 | 0.4s, heap 24 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>ppt2pdf-hifi-poi-table_test.pptx</sub> | PASS | 1 pages, 7 KB, text coverage undefined | 0.7s, heap 24 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>pdf2word-tracemonkey-2col</sub> | PASS | coverage 1.00, 6 tables, 88 images; warn: column lines stay in reading order (4 of 43 line joins kept) | 7.3s, heap 11 MB |
| pdf2word | arxiv-1810.04805-bert.pdf<br><sub>pdf2word-bert-2col</sub> | PASS | coverage 1.00, 5 tables, 38 images; warn: column lines stay in reading order (6 of 59 line joins kept) | 11.2s, heap 24 MB |
| pdf2word | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>pdf2word-fdic</sub> | PASS | coverage 0.99, 52 tables, 0 images | 346.3s, heap 19 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice</sub> | PASS | coverage 1.00, 2 tables, 0 images | 0.2s, heap 20 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice-exact</sub> | PASS | coverage 1.00, 0 tables, 0 images | 0.1s, heap 23 MB |
| pdf2word | flipkart-invoice.pdf<br><sub>pdf2word-flipkart</sub> | PASS | coverage 1.00, 1 tables, 5 images | 0.4s, heap 16 MB |
| pdf2word | udhr-arabic.pdf<br><sub>pdf2word-arabic</sub> | PASS | coverage 1.00, 0 tables, 0 images | 0.6s, heap 19 MB |
| pdf2word | udhr-chinese-simplified.pdf<br><sub>pdf2word-chinese</sub> | PASS | coverage 1.00, 0 tables, 0 images | 0.7s, heap 29 MB |
| pdf2word | fax-jean-schmidt-doe.pdf<br><sub>pdf2word-scanned-fax</sub> | PASS |  | 0.3s, heap 27 MB |
| pdf2word | 911-commission-report.pdf<br><sub>pdf2word-911-large</sub> | PASS | coverage 1.00, 4 tables, 0 images | 9.6s, heap 205 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 62 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 1.8s, heap 7 MB |
| pdf2excel | flipkart-invoice.pdf<br><sub>pdf2excel-flipkart</sub> | PASS | 1 sheets, 88 cells, coverage 1.00 | 1.9s, heap 7 MB |
| pdf2excel | camelot-bol.pdf<br><sub>pdf2excel-camelot-bol</sub> | PASS | 1 sheets, 70 cells, coverage 1.00 | 0.1s, heap 9 MB |
| pdf2excel | saeco.pdf<br><sub>pdf2excel-saeco</sub> | PASS | 1 sheets, 8 cells, coverage 1.00 | 0.1s, heap 9 MB |
| pdf2excel | free-fiber.pdf<br><sub>pdf2excel-free-fiber</sub> | PASS | 2 sheets, 43 cells, coverage 1.00 | 0.2s, heap 11 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>pdf2excel-fdic</sub> | FAIL | xlsx opens: Unsupported ZIP Compression method NaN | 343.7s, heap 19 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>pdf2ppt-tracemonkey</sub> | PASS | 14 slides, 15 images, 10.7 MB; warn: slides carry editable text (0 chars) | 7.0s, heap 42 MB |
| pdf2ppt | pdfjs-rotation.pdf<br><sub>pdf2ppt-rotation-mixed</sub> | PASS | 2 slides, 3 images, 108 KB; warn: slides carry editable text (0 chars); mixed page shapes each fit their slide (2 page aspects, one slide size) | 1.4s, heap 7 MB |
| pdf2ppt | rot90-cropbox-bert.pdf<br><sub>pdf2ppt-rot90-cropbox</sub> | PASS | 16 slides, 17 images, 8.5 MB; warn: slides carry editable text (0 chars) | 5.4s, heap 59 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 84797 chars, 18 headings, 6 tables | 5.1s, heap 11 MB |
| pdf2md | us-budget-2024.pdf<br><sub>pdf2md-budget</sub> | PASS | 567140 chars, 36 headings, 4 tables | 4.3s, heap 31 MB |
| pdf2md | aws-invoice.pdf<br><sub>pdf2md-aws-invoice</sub> | PASS | 2000 chars, 8 headings, 2 tables | 0.4s, heap 12 MB |
| pdf2md | udhr-chinese-simplified.pdf<br><sub>pdf2md-chinese</sub> | PASS | 5805 chars, 0 headings, 0 tables | 0.3s, heap 42 MB |
| pdf2md | udhr-japanese.pdf<br><sub>pdf2md-japanese</sub> | PASS | 4500 chars, 0 headings, 0 tables | 0.6s, heap 12 MB |
| pdf2md | pdfjs-noembed-sjis.pdf<br><sub>pdf2md-noembed-sjis</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.2s, heap 47 MB |
| pdf2md | pdfjs-noembed-eucjp.pdf<br><sub>pdf2md-noembed-eucjp</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.2s, heap 14 MB |
| pdf2md | pdfjs-vertical.pdf<br><sub>pdf2md-vertical</sub> | PASS | 20 chars, 0 headings, 0 tables | 0.1s, heap 47 MB |
| pdf2md | udhr-arabic.pdf<br><sub>pdf2md-arabic</sub> | PASS | 8587 chars, 0 headings, 0 tables | 0.5s, heap 14 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | FAIL | error: TypeError: Cannot read properties of undefined (reading 'indexOf') | 2.8s |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | PASS | 2 pages, 8 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.3s, heap 10 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>excel2pdf-quick-poi-Tables.xlsx</sub> | PASS | 12 pages, 4.8 MB, text coverage 0.00; warn: selectable text (coverage 0.00) | 39.6s, heap 27 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>word2pdf-quick-poi-VariousPictures.docx</sub> | PASS | 1 pages, 295 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.8s, heap 12 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>excel2pdf-quick-poi-WithThreeCharts.xlsx</sub> | FAIL | error: TypeError: Cannot read properties of undefined (reading 'indexOf') | 1.4s |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>ppt2pdf-quick-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 5 KB, text coverage undefined | 1.9s, heap 11 MB |
| word2pdf | poi-chartex.docx<br><sub>word2pdf-quick-poi-chartex.docx</sub> | PASS | 3 pages, 440 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 7.6s, heap 16 MB |
| excel2pdf | poi-picture.xlsx<br><sub>excel2pdf-quick-poi-picture.xlsx</sub> | FAIL | error: TypeError: Cannot read properties of undefined (reading 'indexOf') | 1.4s |
| ppt2pdf | poi-pie-chart.pptx<br><sub>ppt2pdf-quick-poi-pie-chart.pptx</sub> | PASS | 1 pages, 3 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 0.5s, heap 13 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | PASS | 1 pages, 251 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.4s, heap 15 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>word2pdf-quick-poi-table_footnotes.docx</sub> | PASS | 1 pages, 33 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.9s, heap 16 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>ppt2pdf-quick-poi-table_test.pptx</sub> | PASS | 1 pages, 2 KB, text coverage undefined | 0.2s, heap 13 MB |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | PASS | 1 page(s), 8.5x5.7 in, 455 KB | 3.2s, heap 10 MB |
| img2pdf | heic-nokia-C001.heic<br><sub>img2pdf-heic-nokia-C001.heic</sub> | PASS | 1 page(s), 8.5x4.8 in, 219 KB | 3.3s, heap 10 MB |
| img2pdf | photo-24MP-punjab-smartphone.jpg<br><sub>img2pdf-photo-24MP-punjab-smartphone.jpg</sub> | PASS | 1 page(s), 40.1x26.7 in, 13.9 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (40.1 x 26.7 in) | 6.7s, heap 10 MB |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | PASS | 1 page(s), 23.0x17.5 in, 5.4 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) | 1.4s, heap 7 MB |
| img2pdf | photo-portrait-sepia-1640x2268.jpg<br><sub>img2pdf-photo-portrait-sepia-1640x2268.jpg</sub> | PASS | 1 page(s), 10.9x15.1 in, 1.5 MB, EXIF 1 | 0.5s, heap 10 MB |
| img2pdf | png-alpha-transparency-demo.png<br><sub>img2pdf-png-alpha-transparency-demo.png</sub> | PASS | 1 page(s), 6.6x5.0 in, 424 KB | 0.4s, heap 7 MB |
| img2pdf | png-webp-comparison-2412x1500.png<br><sub>img2pdf-png-webp-comparison-2412x1500.png</sub> | PASS | 1 page(s), 16.1x10.0 in, 4.3 MB | 2.5s, heap 8 MB |
| img2pdf | tiff-multipage-mmap.tiff<br><sub>img2pdf-tiff-multipage-mmap.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB | 0.2s, heap 10 MB |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) | 0.2s, heap 7 MB |
| img2pdf | webp-chandrayaan-rover.webp<br><sub>img2pdf-webp-chandrayaan-rover.webp</sub> | PASS | 1 page(s), 3.7x2.9 in, 59 KB | 0.1s, heap 11 MB |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | PASS | 1 page(s), 0.9x0.9 in, 8 KB | 0.1s, heap 7 MB |
| img2pdf | photo-24MP-punjab-smartphone.jpg + photo-castle-3456x2628.jpg + photo-portrait-sepia-1640x2268.jpg<br><sub>img2pdf-three-photos-a4</sub> | PASS |  | 4.5s, heap 8 MB |
| pdf2img | pdfjs-tracemonkey.pdf<br><sub>pdf2img-tracemonkey</sub> | PASS | ink 10.8%, 13.3% | 2.2s, heap 8 MB |
| pdf2img | rot90-cropbox-bert.pdf<br><sub>pdf2img-rot90-cropbox</sub> | PASS | ink 16.3% | 1.6s, heap 7 MB |
| pdf2img | pdfjs-bug_jpx.pdf<br><sub>pdf2img-jpx</sub> | PASS | ink 1.7% | 0.2s, heap 7 MB |
| pdf2img | pdfjs-jpx_subsampling.pdf<br><sub>pdf2img-jpx-subsampling</sub> | PASS | ink 60.2% | 1.3s, heap 7 MB |
| pdf2img | pdfjs-jpx_smaskindata.pdf<br><sub>pdf2img-jpx-smask</sub> | PASS | ink 100.0% | 0.1s, heap 7 MB |
| pdf2img | pdfjs-jbig2_symbol_offset.pdf<br><sub>pdf2img-jbig2-symbol</sub> | PASS | ink 1.0% | 0.2s, heap 7 MB |
| pdf2img | pdfjs-jbig2_file_header.pdf<br><sub>pdf2img-jbig2-header</sub> | PASS | ink 41.0% | 1.0s, heap 7 MB |
| pdf2img | pdfjs-cmykjpeg.pdf<br><sub>pdf2img-cmyk-jpeg</sub> | PASS | ink 6.1% | 0.4s, heap 7 MB |
| pdf2img | pdfjs-devicen.pdf<br><sub>pdf2img-devicen</sub> | PASS | ink 5.8% | 0.2s, heap 8 MB |
| pdf2img | pdfjs-simpletype3font.pdf<br><sub>pdf2img-type3</sub> | PASS | ink 0.1% | 0.2s, heap 7 MB |
| pdf2img | pdfjs-noembed-sjis.pdf<br><sub>pdf2img-noembed-sjis</sub> | PASS | ink 0.1% | 0.3s, heap 8 MB |
| pdf2img | pdfjs-vertical.pdf<br><sub>pdf2img-vertical-cjk</sub> | PASS | ink 0.2% | 0.3s, heap 7 MB |
| pdf2img | udhr-hindi.pdf<br><sub>pdf2img-hindi</sub> | PASS | ink 10.2% | 0.8s, heap 8 MB |
| pdf2img | crooked-paths-1648-104MB.pdf<br><sub>pdf2img-crooked-104MB</sub> | PASS | ink 68.5%, 43.4%, 75.6% | 13.5s, heap 8 MB |
| pdf2img | explorations-bible-lands-956pp-62MB.pdf<br><sub>pdf2img-bible-62MB</sub> | PASS | ink 100.0%, 100.0% | 9.7s, heap 7 MB |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | PASS | 1 pages, 230 KB; warn: selectable text (coverage 0.00) | 2.4s, heap 10 MB |
