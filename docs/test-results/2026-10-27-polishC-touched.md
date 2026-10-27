# Corpus scorecard: 2026-10-27-run

Run: 2026-10-27 17:36 UTC, 10.8 min. Command: `npm run test:corpus -- --light --shards 2 --tool html2pdf,word2pdf,excel2pdf,ppt2pdf,img2pdf,pdf2excel,intake,unlock,merge`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **213 PASS, 0 FAIL, 0 SKIP** of 213 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 17 | 0 | 0 | 61.2s |
| excel2pdf | 12 | 0 | 0 | 49.3s |
| ppt2pdf | 12 | 0 | 0 | 9.0s |
| html2pdf | 5 | 0 | 0 | 32.9s |
| merge | 9 | 0 | 0 | 18.7s |
| unlock | 13 | 0 | 0 | 4.5s |
| pdf2excel | 12 | 0 | 0 | 8.1s |
| img2pdf | 11 | 0 | 0 | 10.6s |
| intake | 122 | 0 | 0 | 175.8s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT REPRODUCED | 32 linked check(s) passed, e.g. merge-owner-only: passed; intake-forms/uk-AFPS-Form-17.pdf: accepted |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT TESTED | no corpus case |
| 3 | Redact search misses phrases split across text items | NOT TESTED | no corpus case |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | NOT TESTED | no corpus case |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT REPRODUCED | 101 linked check(s) passed, e.g. merge-damaged-xref: passed; intake-forms/annotation-button-widget.pdf: accepted |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT TESTED | no corpus case |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT TESTED | no corpus case |
| 10 | OCR English only, assets from CDN (not offline) | NOT TESTED | no corpus case |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | NOT TESTED | no corpus case |
| 12 | Merge/split drop outlines, AcroForm, links | NOT REPRODUCED | 4 linked check(s) passed, e.g. merge-outlines: bookmarks kept; merge-forms: form fields kept |
| 13 | Crop rejects rotated, ignores box origin | NOT TESTED | no corpus case |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | NOT TESTED | no corpus case |
| 16 | PDF to Excel number parsing loses leading zeros / formats | SOFT WARN | soft only, 20 linked check(s) passed; warn: pdf2excel-aws-invoice: leading-zero / long ids kept as text (lost 0000) |
| 17 | PDF to PPT slides are flat images, fixed slide size | NOT TESTED | no corpus case |
| 18 | Office to PDF quick mode is screenshots (no text) | SOFT WARN | soft only, 15 linked check(s) passed; warn: excel2pdf-quick-poi-SampleSS.xlsx: selectable text (coverage 0.00); ppt2pdf-quick-poi-SampleShow.pptx: selectable text (coverage 0.00) (+7 more) |
| 19 | HiFi engine from unpinned CDN, font substitution | SOFT WARN | soft only, 19 linked check(s) passed; warn: office-engine-load: no fetches outside the page origin (cdn.zetaoffice.net) |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | NOT TESTED | no corpus case |
| 22 | Protect: comma in password splits MuPDF options | NOT TESTED | no corpus case |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | SOFT WARN | soft only, 21 linked check(s) passed; warn: img2pdf-photo-24MP-punjab-smartphone.jpg: fit page is a sane paper size (<= 17 in) (40.1 x 26.7 in); img2pdf-photo-castle-3456x2628.jpg: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) (+1 more) |
| 24 | Sign is visual only, one placement | NOT TESTED | feature gap (no PAdES / multi-place API to call) |
| 25 | Redact rasterizes whole pages (size balloons) | NOT TESTED | no corpus case |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT TESTED | no corpus case |
| 27 | Compare by page index only; inserted page breaks the rest | NOT TESTED | no corpus case |
| 28 | HTML to PDF is a screenshot, head styles dropped | SOFT WARN | soft only, 8 linked check(s) passed; warn: html2pdf-tracemonkey-text: selectable text (coverage 0.00) |
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
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 17.5s, heap 29 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 1.4s, heap 27 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 1.4s, heap 29 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>excel2pdf-hifi-poi-Tables.xlsx</sub> | PASS | 15 pages, 71 KB, text coverage 1.00 | 1.0s, heap 29 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>word2pdf-hifi-poi-VariousPictures.docx</sub> | PASS | 1 pages, 88 KB, text coverage 1.00 | 1.2s, heap 31 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>excel2pdf-hifi-poi-WithThreeCharts.xlsx</sub> | PASS | 3 pages, 27 KB, text coverage undefined | 0.8s, heap 31 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>ppt2pdf-hifi-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 157 KB, text coverage undefined | 1.1s, heap 31 MB |
| word2pdf | poi-chartex.docx<br><sub>word2pdf-hifi-poi-chartex.docx</sub> | PASS | 3 pages, 67 KB, text coverage 1.00 | 1.3s, heap 32 MB |
| excel2pdf | poi-picture.xlsx<br><sub>excel2pdf-hifi-poi-picture.xlsx</sub> | PASS | 3 pages, 315 KB, text coverage 1.00 | 0.6s, heap 26 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>ppt2pdf-hifi-poi-pie-chart.pptx</sub> | PASS | 1 pages, 15 KB, text coverage 1.00 | 0.5s, heap 26 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 0.3s, heap 26 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>word2pdf-hifi-poi-table_footnotes.docx</sub> | PASS | 1 pages, 11 KB, text coverage 1.00 | 0.4s, heap 26 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>ppt2pdf-hifi-poi-table_test.pptx</sub> | PASS | 1 pages, 7 KB, text coverage undefined | 0.7s, heap 26 MB |
| word2pdf | -<br><sub>i-engine-pinned-warm-boot</sub> | PASS | cold boot 10240 ms (download 3250 ms, cache false), warm boot 6458 ms | 16.8s, heap 41 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-convert-no-network</sub> | PASS |  | 1.1s, heap 40 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>i-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 961 ms, fonts Carlito-Bold Carlito | 1.1s, heap 41 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>i-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 1061 ms, fonts Carlito-Italic Carlito LiberationSans NotoSans-Regular | 1.1s, heap 42 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>i-hifi-poi-Tables.xlsx</sub> | PASS | 15 pages, 908 ms, fonts LiberationSerif-Bold LiberationSerif-Italic LiberationSerif | 1.0s, heap 44 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>i-hifi-poi-VariousPictures.docx</sub> | PASS | 1 pages, 421 ms, fonts Carlito | 0.5s, heap 44 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>i-hifi-poi-WithThreeCharts.xlsx</sub> | PASS | 3 pages, 472 ms, fonts Carlito-Bold Carlito | 0.5s, heap 44 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>i-hifi-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 809 ms, fonts Carlito | 0.9s, heap 45 MB |
| word2pdf | poi-chartex.docx<br><sub>i-hifi-poi-chartex.docx</sub> | PASS | 3 pages, 1178 ms, fonts Carlito LiberationSerif OpenSymbol | 1.3s, heap 22 MB |
| excel2pdf | poi-picture.xlsx<br><sub>i-hifi-poi-picture.xlsx</sub> | PASS | 3 pages, 446 ms, fonts Carlito LiberationSans-Bold LiberationSans-Italic LiberationSans | 0.5s, heap 22 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>i-hifi-poi-pie-chart.pptx</sub> | PASS | 1 pages, 460 ms, fonts Carlito-Bold Carlito | 0.5s, heap 23 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-poi-sample.docx</sub> | PASS | 1 pages, 222 ms, fonts Carlito | 0.3s, heap 22 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>i-hifi-poi-table_footnotes.docx</sub> | PASS | 1 pages, 216 ms, fonts Carlito | 0.3s, heap 22 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>i-hifi-poi-table_test.pptx</sub> | PASS | 1 pages, 530 ms, fonts none | 0.7s, heap 23 MB |
| word2pdf | -<br><sub>i-font-probe-docx</sub> | PASS | per line: Calibri=BAAAAA+Carlito, Calibri Light=BAAAAA+Carlito, Cambria=CAAAAA+Caladea-Regular, Aptos=DAAAAA+NotoSans-Regular, SimSun=EAAAAA+NotoSerif-Regular, MS Gothic=DAAAAA+NotoSans-Regular, Malgun Gothic=DAAAAA+NotoSans-Regular, Mangal=DAAAAA+NotoSans-Regular; embedded: Caladea-Regular, Carlito, NotoSans-Regular, NotoSansKR-Regular, NotoSansSC-Regular, NotoSerif-Regular; warn: Devanagari text | 0.9s, heap 22 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-styled-report</sub> | PASS | 1 page(s), 43 KB, 427 ms, coverage 0.98 | 3.6s, heap 25 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-long-page</sub> | PASS | 23 pages, 478 KB, 1356 ms | 1.5s, heap 26 MB |
| word2pdf | poi-sample.docx<br><sub>i-engine-hang-restart</sub> | PASS | reboot + convert 7430 ms | 7.6s, heap 43 MB |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf + arxiv-1512.03385-resnet.pdf<br><sub>merge-reports</sub> | PASS | 42 pages, 2.2 MB | 2.6s, heap 20 MB |
| merge | pdfjs-rotation.pdf + pdfjs-hello_world_rotated.pdf + rot90-cropbox-bert.pdf<br><sub>merge-rotated</sub> | PASS | 23 pages, 648 KB | 1.5s, heap 16 MB |
| merge | pdfjs-nested_outline.pdf + us-budget-2024.pdf<br><sub>merge-outlines</sub> | PASS | 193 pages, 1.9 MB | 3.2s, heap 27 MB |
| merge | irs-fw9.pdf + irs-f1040sa.pdf<br><sub>merge-forms</sub> | PASS | 7 pages, 89 KB | 0.4s, heap 43 MB |
| merge | 911-commission-report.pdf + us-economic-report-president-2024.pdf<br><sub>merge-large</sub> | PASS | 1072 pages, 7.0 MB | 5.1s, heap 56 MB |
| merge | owner-only-tracemonkey.pdf + pdfjs-TAMReview.pdf<br><sub>merge-owner-only</sub> | PASS | 37 pages, 1.5 MB | 0.9s, heap 61 MB |
| merge | pdfjs-xref_command_missing.pdf + pdfjs-tracemonkey.pdf<br><sub>merge-damaged-xref</sub> | PASS | 15 pages, 940 KB | 0.4s, heap 34 MB |
| merge | pdf20-simple.pdf + pdf20-offset-start.pdf + pdf20-incremental-save.pdf<br><sub>merge-pdf20</sub> | PASS | 3 pages, 5 KB | 0.1s, heap 43 MB |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | PASS | removed: none listed, had user password | 0.9s, heap 9 MB |
| unlock | pdfjs-issue6010_1.pdf<br><sub>unlock-issue6010_1</sub> | PASS | removed: none listed, had user password | 0.2s, heap 10 MB |
| unlock | pdfjs-issue6010_2.pdf<br><sub>unlock-issue6010_2</sub> | PASS | removed: none listed, had user password | 0.2s, heap 10 MB |
| unlock | pdfjs-bug1782186.pdf<br><sub>unlock-bug1782186</sub> | PASS | removed: none listed, had user password | 0.1s, heap 10 MB |
| unlock | pdfjs-issue21579.pdf<br><sub>unlock-issue21579</sub> | PASS | removed: copying text, editing, annotating, reordering pages, had user password | 0.1s, heap 10 MB |
| unlock | pdfjs-issue15893_reduced.pdf<br><sub>unlock-issue15893_reduced</sub> | PASS | removed: none listed, had user password | 0.1s, heap 10 MB |
| unlock | pdfjs-saslprep-r6.pdf<br><sub>unlock-saslprep-r6</sub> | PASS | removed: none listed, had user password | 0.2s, heap 11 MB |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | PASS | removed: none listed, had user password | 0.3s, heap 11 MB |
| unlock | pdfjs-empty_protected.pdf<br><sub>unlock-empty-protected</sub> | PASS | removed: copying text, editing, reordering pages | 0.2s, heap 11 MB |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 0.3s, heap 11 MB |
| unlock | owner-only-aws-invoice.pdf<br><sub>unlock-owner-only-invoice</sub> | PASS | removed: printing, high-quality printing, copying text | 0.2s, heap 9 MB |
| unlock | pdfjs-bug1782186.pdf<br><sub>unlock-wrong-password</sub> | PASS |  | 0.1s |
| unlock | a-owner-only-us-budget.pdf<br><sub>g2-unlock-owner-only-fast</sub> | PASS | 456 ms, removed: printing, copying text, editing | 1.4s, heap 9 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 73 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 1.7s, heap 9 MB |
| pdf2excel | flipkart-invoice.pdf<br><sub>pdf2excel-flipkart</sub> | PASS | 1 sheets, 36 cells, coverage 1.00 | 0.2s, heap 12 MB |
| pdf2excel | camelot-bol.pdf<br><sub>pdf2excel-camelot-bol</sub> | PASS | 1 sheets, 64 cells, coverage 1.00 | 0.1s, heap 14 MB |
| pdf2excel | saeco.pdf<br><sub>pdf2excel-saeco</sub> | PASS | 1 sheets, 53 cells, coverage 1.00 | 0.2s, heap 13 MB |
| pdf2excel | free-fiber.pdf<br><sub>pdf2excel-free-fiber</sub> | PASS | 2 sheets, 22 cells, coverage 1.00 | 0.2s, heap 14 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>pdf2excel-fdic</sub> | PASS | 44 sheets, 5302 cells, coverage 0.99 | 1.8s, heap 17 MB |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | PASS | 1 sheets, 22 numbers, 0 numeric text, 0.1 s | 0.2s, heap 48 MB |
| pdf2excel | camelot-bol.pdf<br><sub>h-excel-camelot-eu-typed</sub> | PASS | 1 sheets, 18 numbers, 0 numeric text, 0.0 s | 0.1s, heap 50 MB |
| pdf2excel | netpresse-invoice.pdf<br><sub>h-excel-netpresse-eu-typed</sub> | PASS | 1 sheets, 10 numbers, 0 numeric text, 0.2 s | 0.3s, heap 24 MB |
| pdf2excel | saeco.pdf<br><sub>h-excel-saeco-dates</sub> | PASS | 1 sheets, 14 numbers, 0 numeric text, 0.1 s | 0.1s, heap 25 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-speed-typed</sub> | PASS | 44 sheets, 2860 numbers, 2 numeric text, 1.3 s | 1.5s, heap 18 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-joined</sub> | PASS | 1 sheets, 2680 numbers, 2 numeric text, 1.3 s | 1.5s, heap 41 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 62 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.2s, heap 12 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | PASS | 2 pages, 8 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 1.3s, heap 16 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>excel2pdf-quick-poi-Tables.xlsx</sub> | PASS | 18 pages, 4.6 MB, text coverage 0.00; warn: selectable text (coverage 0.00) | 36.8s, heap 31 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>word2pdf-quick-poi-VariousPictures.docx</sub> | PASS | 1 pages, 295 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.2s, heap 15 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>excel2pdf-quick-poi-WithThreeCharts.xlsx</sub> | PASS | 1 pages, 31 KB, text coverage undefined | 1.2s, heap 16 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>ppt2pdf-quick-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 5 KB, text coverage undefined | 0.3s, heap 16 MB |
| word2pdf | poi-chartex.docx<br><sub>word2pdf-quick-poi-chartex.docx</sub> | PASS | 3 pages, 440 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 5.9s, heap 18 MB |
| excel2pdf | poi-picture.xlsx<br><sub>excel2pdf-quick-poi-picture.xlsx</sub> | PASS | 1 pages, 39 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 1.3s, heap 16 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>ppt2pdf-quick-poi-pie-chart.pptx</sub> | PASS | 1 pages, 3 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 0.3s, heap 16 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | PASS | 1 pages, 251 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 1.6s, heap 19 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>word2pdf-quick-poi-table_footnotes.docx</sub> | PASS | 1 pages, 33 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 1.9s, heap 16 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>ppt2pdf-quick-poi-table_test.pptx</sub> | PASS | 1 pages, 2 KB, text coverage undefined | 0.1s, heap 16 MB |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | PASS | 1 page(s), 8.5x5.7 in, 455 KB | 2.7s, heap 12 MB |
| img2pdf | heic-nokia-C001.heic<br><sub>img2pdf-heic-nokia-C001.heic</sub> | PASS | 1 page(s), 8.5x4.8 in, 219 KB | 0.4s, heap 13 MB |
| img2pdf | photo-24MP-punjab-smartphone.jpg<br><sub>img2pdf-photo-24MP-punjab-smartphone.jpg</sub> | PASS | 1 page(s), 40.1x26.7 in, 13.9 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (40.1 x 26.7 in) | 2.3s, heap 9 MB |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | PASS | 1 page(s), 23.0x17.5 in, 5.4 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) | 1.3s, heap 9 MB |
| img2pdf | photo-portrait-sepia-1640x2268.jpg<br><sub>img2pdf-photo-portrait-sepia-1640x2268.jpg</sub> | PASS | 1 page(s), 10.9x15.1 in, 1.5 MB, EXIF 1 | 0.5s, heap 9 MB |
| img2pdf | png-alpha-transparency-demo.png<br><sub>img2pdf-png-alpha-transparency-demo.png</sub> | PASS | 1 page(s), 6.6x5.0 in, 424 KB | 0.4s, heap 9 MB |
| img2pdf | png-webp-comparison-2412x1500.png<br><sub>img2pdf-png-webp-comparison-2412x1500.png</sub> | PASS | 1 page(s), 16.1x10.0 in, 4.3 MB | 2.4s, heap 10 MB |
| img2pdf | tiff-multipage-mmap.tiff<br><sub>img2pdf-tiff-multipage-mmap.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB | 0.2s, heap 9 MB |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) | 0.1s, heap 10 MB |
| img2pdf | webp-chandrayaan-rover.webp<br><sub>img2pdf-webp-chandrayaan-rover.webp</sub> | PASS | 1 page(s), 3.7x2.9 in, 59 KB | 0.1s, heap 10 MB |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | PASS | 1 page(s), 0.9x0.9 in, 8 KB | 0.1s, heap 10 MB |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | PASS | 1 pages, 230 KB; warn: selectable text (coverage 0.00) | 1.5s, heap 10 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-styled-report</sub> | PASS | 1 page(s), 152 KB, 549 ms | 0.8s, heap 11 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-long-page</sub> | PASS | 22 pages, 3.9 MB, 24580 ms | 25.5s, heap 47 MB |
| intake | annotation-button-widget.pdf<br><sub>intake-forms/annotation-button-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.2 KB" | 0.4s |
| intake | annotation-choice-widget.pdf<br><sub>intake-forms/annotation-choice-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 89.4 KB" | 0.4s |
| intake | annotation-text-widget.pdf<br><sub>intake-forms/annotation-text-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 91.0 KB" | 0.4s |
| intake | irs-f1040.pdf<br><sub>intake-forms/irs-f1040.pdf</sub> | PASS | expect accept (2 p): "2 pages, 215.1 KB" | 0.7s |
| intake | irs-f1040sa.pdf<br><sub>intake-forms/irs-f1040sa.pdf</sub> | PASS | expect accept (1 p): "1 page, 77.2 KB" | 0.7s |
| intake | irs-fw4.pdf<br><sub>intake-forms/irs-fw4.pdf</sub> | PASS | expect accept (5 p): "5 pages, 204.0 KB" | 0.7s |
| intake | irs-fw9.pdf<br><sub>intake-forms/irs-fw9.pdf</sub> | PASS | expect accept (6 p): "6 pages, 137.5 KB" | 1.1s |
| intake | uk-AFPS-Form-17.pdf<br><sub>intake-forms/uk-AFPS-Form-17.pdf</sub> | PASS | expect accept (5 p), encrypted: "5 pages, 978.1 KB" (Restrictions removed so the file can be edited) | 1.1s |
| intake | uk-IPPH353.pdf<br><sub>intake-forms/uk-IPPH353.pdf</sub> | PASS | expect accept (4 p), encrypted: "4 pages, 1.58 MB" (Restrictions removed so the file can be edited) | 0.7s |
| intake | uscis-i-485.pdf<br><sub>intake-forms/uscis-i-485.pdf</sub> | PASS | expect accept (24 p), encrypted: "24 pages, 2.55 MB" (Restrictions removed so the file can be edited) | 1.7s |
| intake | uscis-i-9.pdf<br><sub>intake-forms/uscis-i-9.pdf</sub> | PASS | expect accept (4 p): "4 pages, 511.8 KB" | 2.4s |
| intake | xfa-imm1344e-filled.pdf<br><sub>intake-forms/xfa-imm1344e-filled.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.88 MB" | 2.8s |
| intake | xfa-issue14315.pdf<br><sub>intake-forms/xfa-issue14315.pdf</sub> | PASS | expect accept (1 p): "1 page, 11.3 KB" | 2.8s |
| intake | fax-jean-schmidt-doe.pdf<br><sub>intake-scanned/fax-jean-schmidt-doe.pdf</sub> | PASS | expect accept (2 p): "2 pages, 186.4 KB" | 2.8s |
| intake | fips-document-facsimile-transmission.pdf<br><sub>intake-scanned/fips-document-facsimile-transmission.pdf</sub> | PASS | expect accept (72 p): "72 pages, 4.22 MB" | 3.1s |
| intake | handwritten-field-trips-notebook-1950.pdf<br><sub>intake-scanned/handwritten-field-trips-notebook-1950.pdf</sub> | PASS | expect accept (57 p): "57 pages, 5.69 MB" | 3.4s |
| intake | letter-to-benjamin-glover.pdf<br><sub>intake-scanned/letter-to-benjamin-glover.pdf</sub> | PASS | expect accept (2 p): "2 pages, 1.71 MB" | 0.5s |
| intake | lincoln-ellsworth-letter-1861.pdf<br><sub>intake-scanned/lincoln-ellsworth-letter-1861.pdf</sub> | PASS | expect accept (36 p): "36 pages, 528.6 KB" | 0.5s |
| intake | ndl-konoye-handwritten-request.pdf<br><sub>intake-scanned/ndl-konoye-handwritten-request.pdf</sub> | PASS | expect accept (37 p), encrypted: "37 pages, 13.79 MB" (Restrictions removed so the file can be edited) | 1.8s |
| intake | queen-victoria-peabody-letter-1866.pdf<br><sub>intake-scanned/queen-victoria-peabody-letter-1866.pdf</sub> | PASS | expect accept (38 p): "38 pages, 5.72 MB" | 2.1s |
| intake | arxiv-1512.03385-resnet.pdf<br><sub>intake-reports/arxiv-1512.03385-resnet.pdf</sub> | PASS | expect accept (12 p): "12 pages, 800.2 KB" | 2.1s |
| intake | arxiv-1706.03762-attention.pdf<br><sub>intake-reports/arxiv-1706.03762-attention.pdf</sub> | PASS | expect accept (15 p): "15 pages, 2.11 MB" | 3.4s |
| intake | arxiv-1810.04805-bert.pdf<br><sub>intake-reports/arxiv-1810.04805-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages, 757.0 KB" | 3.4s |
| intake | arxiv-2005.14165-gpt3.pdf<br><sub>intake-reports/arxiv-2005.14165-gpt3.pdf</sub> | PASS | expect accept (75 p): "75 pages, 6.45 MB" | 4.7s |
| intake | arxiv-2307.09288-llama2.pdf<br><sub>intake-reports/arxiv-2307.09288-llama2.pdf</sub> | PASS | expect accept (77 p): "77 pages, 13.03 MB" | 1.4s |
| intake | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>intake-reports/fdic-quarterly-banking-profile-2023q4.pdf</sub> | PASS | expect accept (44 p): "44 pages, 1.29 MB" | 2.6s |
| intake | ipcc-ar6-synthesis-longer-report.pdf<br><sub>intake-reports/ipcc-ar6-synthesis-longer-report.pdf</sub> | PASS | expect accept (81 p): "81 pages, 4.98 MB" | 3.3s |
| intake | pdfjs-TAMReview.pdf<br><sub>intake-reports/pdfjs-TAMReview.pdf</sub> | PASS | expect accept (23 p): "23 pages, 658.8 KB" | 3.3s |
| intake | pdfjs-tracemonkey.pdf<br><sub>intake-reports/pdfjs-tracemonkey.pdf</sub> | PASS | expect accept (14 p): "14 pages, 992.5 KB" | 3.3s |
| intake | us-budget-2024.pdf<br><sub>intake-reports/us-budget-2024.pdf</sub> | PASS | expect accept (184 p): "184 pages, 2.31 MB" | 5.1s |
| intake | us-economic-report-president-2024.pdf<br><sub>intake-reports/us-economic-report-president-2024.pdf</sub> | PASS | expect accept (487 p): "487 pages, 4.93 MB" | 6.1s |
| intake | 911-commission-report.pdf<br><sub>intake-large/911-commission-report.pdf</sub> | PASS | expect accept (585 p), encrypted: "585 pages, 2.36 MB" (Restrictions removed so the file can be edited) | 6.7s |
| intake | pdfjs-ArabicCIDTrueType.pdf<br><sub>intake-intl/pdfjs-ArabicCIDTrueType.pdf</sub> | PASS | expect accept (1 p): "1 page, 38.4 KB" | 0.4s |
| intake | pdfjs-ThuluthFeatures.pdf<br><sub>intake-intl/pdfjs-ThuluthFeatures.pdf</sub> | PASS | expect accept (1 p): "1 page, 114.9 KB" | 0.4s |
| intake | pdfjs-arial_unicode_ab_cidfont.pdf<br><sub>intake-intl/pdfjs-arial_unicode_ab_cidfont.pdf</sub> | PASS | expect accept (1 p): "1 page, 12.8 KB" | 0.4s |
| intake | pdfjs-noembed-eucjp.pdf<br><sub>intake-intl/pdfjs-noembed-eucjp.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.4 KB" | 0.4s |
| intake | pdfjs-noembed-sjis.pdf<br><sub>intake-intl/pdfjs-noembed-sjis.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.4 KB" | 0.4s |
| intake | pdfjs-vertical.pdf<br><sub>intake-intl/pdfjs-vertical.pdf</sub> | PASS | expect accept (3 p): "3 pages, 6.7 KB" | 0.4s |
| intake | udhr-arabic.pdf<br><sub>intake-intl/udhr-arabic.pdf</sub> | PASS | expect accept (5 p): "5 pages, 184.8 KB" | 0.4s |
| intake | udhr-chinese-simplified.pdf<br><sub>intake-intl/udhr-chinese-simplified.pdf</sub> | PASS | expect accept (7 p): "7 pages, 468.6 KB" | 0.8s |
| intake | udhr-hebrew.pdf<br><sub>intake-intl/udhr-hebrew.pdf</sub> | PASS | expect accept (4 p): "4 pages, 29.1 KB" | 0.4s |
| intake | udhr-hindi.pdf<br><sub>intake-intl/udhr-hindi.pdf</sub> | PASS | expect accept (5 p): "5 pages, 1.65 MB" | 0.4s |
| intake | udhr-japanese.pdf<br><sub>intake-intl/udhr-japanese.pdf</sub> | PASS | expect accept (9 p): "9 pages, 465.1 KB" | 0.4s |
| intake | udhr-korean.pdf<br><sub>intake-intl/udhr-korean.pdf</sub> | PASS | expect accept (7 p): "7 pages, 273.0 KB" | 0.4s |
| intake | pdf20-image-bpc.pdf<br><sub>intake-quirks/pdf20-image-bpc.pdf</sub> | PASS | expect accept (1 p): "1 page, 8.8 KB" | 0.4s |
| intake | pdf20-incremental-save.pdf<br><sub>intake-quirks/pdf20-incremental-save.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.5 KB" | 0.7s |
| intake | pdf20-offset-start.pdf<br><sub>intake-quirks/pdf20-offset-start.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.1 KB" | 0.7s |
| intake | pdf20-page-output-intent.pdf<br><sub>intake-quirks/pdf20-page-output-intent.pdf</sub> | PASS | expect accept (2 p): "2 pages, 10.3 KB" | 0.7s |
| intake | pdf20-simple.pdf<br><sub>intake-quirks/pdf20-simple.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.1 KB" | 0.4s |
| intake | pdf20-utf8-annotation.pdf<br><sub>intake-quirks/pdf20-utf8-annotation.pdf</sub> | PASS | expect accept (1 p): "1 page, 4.4 KB" | 0.4s |
| intake | pdf20-utf8-test.pdf<br><sub>intake-quirks/pdf20-utf8-test.pdf</sub> | PASS | expect accept (1 p): "1 page, 13.6 KB" | 0.4s |
| intake | pdfjs-Pages-tree-refs.pdf<br><sub>intake-quirks/pdfjs-Pages-tree-refs.pdf</sub> | PASS | expect accept (1 p): "1 page, 622 B" (File was damaged and has been repaired. 1 of 2 pages could not be recovered) | 1.0s |
| intake | pdfjs-Type3WordSpacing.pdf<br><sub>intake-quirks/pdfjs-Type3WordSpacing.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.6 KB" | 1.0s |
| intake | pdfjs-alphatrans.pdf<br><sub>intake-quirks/pdfjs-alphatrans.pdf</sub> | PASS | expect accept (1 p): "1 page, 16.5 KB" | 1.0s |
| intake | pdfjs-annotation-fileattachment.pdf<br><sub>intake-quirks/pdfjs-annotation-fileattachment.pdf</sub> | PASS | expect accept (1 p): "1 page, 91.1 KB" | 1.0s |
| intake | pdfjs-annotation-freetext.pdf<br><sub>intake-quirks/pdfjs-annotation-freetext.pdf</sub> | PASS | expect accept (1 p): "1 page, 84.0 KB" | 1.0s |
| intake | pdfjs-annotation-highlight-without-appearance.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight-without-appearance.pdf</sub> | PASS | expect accept (1 p): "1 page, 15.9 KB" | 0.4s |
| intake | pdfjs-annotation-highlight.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight.pdf</sub> | PASS | expect accept (1 p): "1 page, 90.2 KB" | 0.4s |
| intake | pdfjs-annotation-line.pdf<br><sub>intake-quirks/pdfjs-annotation-line.pdf</sub> | PASS | expect accept (1 p): "1 page, 83.0 KB" | 0.4s |
| intake | pdfjs-annotation-stamp.pdf<br><sub>intake-quirks/pdfjs-annotation-stamp.pdf</sub> | PASS | expect accept (1 p): "1 page, 86.8 KB" | 0.4s |
| intake | pdfjs-bitmap-symbol-empty.pdf<br><sub>intake-quirks/pdfjs-bitmap-symbol-empty.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.1 KB" | 0.4s |
| intake | pdfjs-blendmode.pdf<br><sub>intake-quirks/pdfjs-blendmode.pdf</sub> | PASS | expect accept (1 p): "1 page, 49.4 KB" | 0.4s |
| intake | pdfjs-bug1020226.pdf<br><sub>intake-quirks/pdfjs-bug1020226.pdf</sub> | PASS | expect reject: "Can't open this PDF. The file looks damaged or incomplete." | 0.7s |
| intake | pdfjs-bug1782186.pdf<br><sub>intake-quirks/pdfjs-bug1782186.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.7s |
| intake | pdfjs-bug_jpx.pdf<br><sub>intake-quirks/pdfjs-bug_jpx.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.3 KB" | 0.4s |
| intake | pdfjs-cmykjpeg.pdf<br><sub>intake-quirks/pdfjs-cmykjpeg.pdf</sub> | PASS | expect accept (1 p): "1 page, 365.3 KB" | 0.4s |
| intake | pdfjs-devicen.pdf<br><sub>intake-quirks/pdfjs-devicen.pdf</sub> | PASS | expect accept (1 p): "1 page, 15.4 KB" | 0.4s |
| intake | pdfjs-empty_protected.pdf<br><sub>intake-quirks/pdfjs-empty_protected.pdf</sub> | PASS | expect accept (1 p), encrypted: "1 page, 5.3 KB" (Restrictions removed so the file can be edited) | 0.7s |
| intake | pdfjs-encrypted-attachment.pdf<br><sub>intake-quirks/pdfjs-encrypted-attachment.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.7s |
| intake | pdfjs-function_based_shading_cmyk.pdf<br><sub>intake-quirks/pdfjs-function_based_shading_cmyk.pdf</sub> | PASS | expect accept (2 p): "2 pages, 3.2 KB" | 1.0s |
| intake | pdfjs-hello_world_rotated.pdf<br><sub>intake-quirks/pdfjs-hello_world_rotated.pdf</sub> | PASS | expect accept (5 p): "5 pages, 1.3 KB" | 1.0s |
| intake | pdfjs-issue11555.pdf<br><sub>intake-quirks/pdfjs-issue11555.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.1 KB" | 1.0s |
| intake | pdfjs-issue1155r.pdf<br><sub>intake-quirks/pdfjs-issue1155r.pdf</sub> | PASS | expect accept (1 p): "1 page, 776 B" | 0.5s |
| intake | pdfjs-issue15893_reduced.pdf<br><sub>intake-quirks/pdfjs-issue15893_reduced.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.8s |
| intake | pdfjs-issue21579.pdf<br><sub>intake-quirks/pdfjs-issue21579.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.8s |
| intake | pdfjs-issue3371.pdf<br><sub>intake-quirks/pdfjs-issue3371.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.8s |
| intake | pdfjs-issue6010_1.pdf<br><sub>intake-quirks/pdfjs-issue6010_1.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.1s |
| intake | pdfjs-issue6010_2.pdf<br><sub>intake-quirks/pdfjs-issue6010_2.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.1s |
| intake | pdfjs-jbig2_file_header.pdf<br><sub>intake-quirks/pdfjs-jbig2_file_header.pdf</sub> | PASS | expect accept (1 p): "1 page, 774 B" | 1.1s |
| intake | pdfjs-jbig2_symbol_offset.pdf<br><sub>intake-quirks/pdfjs-jbig2_symbol_offset.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.1 KB" | 1.1s |
| intake | pdfjs-jpx_smaskindata.pdf<br><sub>intake-quirks/pdfjs-jpx_smaskindata.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.5 KB" | 0.4s |
| intake | pdfjs-jpx_subsampling.pdf<br><sub>intake-quirks/pdfjs-jpx_subsampling.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.0 KB" | 0.4s |
| intake | pdfjs-nested_outline.pdf<br><sub>intake-quirks/pdfjs-nested_outline.pdf</sub> | PASS | expect accept (9 p): "9 pages, 5.8 KB" | 0.4s |
| intake | pdfjs-openoffice.pdf<br><sub>intake-quirks/pdfjs-openoffice.pdf</sub> | PASS | expect accept (1 p): "1 page, 10.1 KB" | 0.4s |
| intake | pdfjs-outline_goto_action.pdf<br><sub>intake-quirks/pdfjs-outline_goto_action.pdf</sub> | PASS | expect accept (2 p): "2 pages, 1.0 KB" | 0.4s |
| intake | pdfjs-outlines_se.pdf<br><sub>intake-quirks/pdfjs-outlines_se.pdf</sub> | PASS | expect accept (2 p): "2 pages, 29.7 KB" | 0.4s |
| intake | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-395-0-fuzzed.pdf</sub> | PASS | expect reject: "Can't open this PDF. The file looks damaged or incomplete." | 0.8s |
| intake | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-742-0-fuzzed.pdf</sub> | PASS | expect reject: "Can't open this PDF. The file looks damaged or incomplete." | 0.8s |
| intake | pdfjs-rotated.pdf<br><sub>intake-quirks/pdfjs-rotated.pdf</sub> | PASS | expect accept (1 p): "1 page, 12.7 KB" | 0.4s |
| intake | pdfjs-rotation.pdf<br><sub>intake-quirks/pdfjs-rotation.pdf</sub> | PASS | expect accept (2 p): "2 pages, 6.5 KB" | 0.4s |
| intake | pdfjs-saslprep-r6.pdf<br><sub>intake-quirks/pdfjs-saslprep-r6.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.7s |
| intake | pdfjs-simpletype3font.pdf<br><sub>intake-quirks/pdfjs-simpletype3font.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.6 KB" | 0.7s |
| intake | pdfjs-tracemonkey_with_annotations.pdf<br><sub>intake-quirks/pdfjs-tracemonkey_with_annotations.pdf</sub> | PASS | expect accept (14 p): "14 pages, 997.8 KB" | 0.7s |
| intake | pdfjs-xref_command_missing.pdf<br><sub>intake-quirks/pdfjs-xref_command_missing.pdf</sub> | PASS | expect accept (1 p): "1 page, 631 B" | 1.0s |
| intake | aws-invoice.pdf<br><sub>intake-invoices/aws-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 150.9 KB" | 1.0s |
| intake | azure-interior.pdf<br><sub>intake-invoices/azure-interior.pdf</sub> | PASS | expect accept (1 p): "1 page, 39.9 KB" | 1.0s |
| intake | camelot-bol.pdf<br><sub>intake-invoices/camelot-bol.pdf</sub> | PASS | expect accept (1 p): "1 page, 24.3 KB" | 0.4s |
| intake | coolblue.pdf<br><sub>intake-invoices/coolblue.pdf</sub> | PASS | expect accept (1 p): "1 page, 52.3 KB" | 0.4s |
| intake | flipkart-invoice.pdf<br><sub>intake-invoices/flipkart-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 43.7 KB" | 0.4s |
| intake | free-fiber.pdf<br><sub>intake-invoices/free-fiber.pdf</sub> | PASS | expect accept (2 p): "2 pages, 117.3 KB" | 0.4s |
| intake | netpresse-invoice.pdf<br><sub>intake-invoices/netpresse-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 72.7 KB" | 0.4s |
| intake | oyo.pdf<br><sub>intake-invoices/oyo.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.9 KB" | 0.4s |
| intake | quality-hosting.pdf<br><sub>intake-invoices/quality-hosting.pdf</sub> | PASS | expect accept (2 p): "2 pages, 53.1 KB" | 0.4s |
| intake | saeco.pdf<br><sub>intake-invoices/saeco.pdf</sub> | PASS | expect accept (1 p): "1 page, 48.1 KB" | 0.4s |
| intake | a-owner-only-attention.pdf<br><sub>intake-derived/a-owner-only-attention.pdf</sub> | PASS | expect accept (15 p), encrypted: "15 pages, 1.99 MB" (Restrictions removed so the file can be edited) | 1.4s |
| intake | a-owner-only-us-budget.pdf<br><sub>intake-derived/a-owner-only-us-budget.pdf</sub> | PASS | expect accept (184 p), encrypted: "184 pages, 10.15 MB" (Restrictions removed so the file can be edited) | 5.5s |
| intake | c-fw9-rot90.pdf<br><sub>intake-derived/c-fw9-rot90.pdf</sub> | PASS | expect accept (6 p): "6 pages, 131.4 KB" | 5.9s |
| intake | c-mixed.pdf<br><sub>intake-derived/c-mixed.pdf</sub> | PASS | expect accept (5 p): "5 pages, 477.6 KB" | 5.9s |
| intake | c-rot180-origin.pdf<br><sub>intake-derived/c-rot180-origin.pdf</sub> | PASS | expect accept (2 p): "2 pages, 205.9 KB" | 5.9s |
| intake | c-rot270-cropbox.pdf<br><sub>intake-derived/c-rot270-cropbox.pdf</sub> | PASS | expect accept (2 p): "2 pages, 205.1 KB" | 5.9s |
| intake | compare-tracemonkey-base.pdf<br><sub>intake-derived/compare-tracemonkey-base.pdf</sub> | PASS | expect accept (5 p): "5 pages, 456.2 KB" | 6.2s |
| intake | compare-tracemonkey-inserted.pdf<br><sub>intake-derived/compare-tracemonkey-inserted.pdf</sub> | PASS | expect accept (6 p): "6 pages, 527.5 KB" | 6.2s |
| intake | origin-shift-aws-invoice.pdf<br><sub>intake-derived/origin-shift-aws-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 147.8 KB" | 0.4s |
| intake | owner-only-aws-invoice.pdf<br><sub>intake-derived/owner-only-aws-invoice.pdf</sub> | PASS | expect accept (1 p), encrypted: "1 page, 150.4 KB" (Restrictions removed so the file can be edited) | 1.0s |
| intake | owner-only-irs-fw9.pdf<br><sub>intake-derived/owner-only-irs-fw9.pdf</sub> | PASS | expect accept (6 p), encrypted: "6 pages, 220.0 KB" (Restrictions removed so the file can be edited) | 1.4s |
| intake | owner-only-tracemonkey.pdf<br><sub>intake-derived/owner-only-tracemonkey.pdf</sub> | PASS | expect accept (14 p), encrypted: "14 pages, 975.7 KB" (Restrictions removed so the file can be edited) | 1.7s |
| intake | rot90-cropbox-bert.pdf<br><sub>intake-derived/rot90-cropbox-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages, 647.9 KB" | 1.7s |
| intake | sub-darwin-p10-11.pdf<br><sub>intake-derived/sub-darwin-p10-11.pdf</sub> | PASS | expect accept (2 p): "2 pages, 28.7 KB" | 2.0s |
| intake | sub-fips-p5-6.pdf<br><sub>intake-derived/sub-fips-p5-6.pdf</sub> | PASS | expect accept (2 p): "2 pages, 51.0 KB" | 2.0s |
| intake | sub-lincoln-p3-4.pdf<br><sub>intake-derived/sub-lincoln-p3-4.pdf</sub> | PASS | expect accept (2 p): "2 pages, 12.3 KB" | 2.0s |
| intake | sub-ndl-konoye-p1.pdf<br><sub>intake-derived/sub-ndl-konoye-p1.pdf</sub> | PASS | expect accept (1 p): "1 page, 235.5 KB" | 0.4s |
| intake | user-pw-TAMReview.pdf<br><sub>intake-derived/user-pw-TAMReview.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.7s |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf<br><sub>flow-merge</sub> | PASS | ready 1.7s, click to download 1.5s: merged.pdf: 30 pages, 1.55 MB | 4.4s, heap 13 MB |
