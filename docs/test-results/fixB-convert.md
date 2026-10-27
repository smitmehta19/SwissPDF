# Corpus scorecard: fixB-convert

Run: 2026-10-18 00:16 UTC, 2.6 min. Command: `npm run test:corpus -- --case html2pdf|img2pdf|pdf2excel|h-excel|2pdf-hifi|2pdf-quick|office-engine|i-hifi --name fixB-convert --shards 2`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **67 PASS, 0 FAIL, 0 SKIP** of 67 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 14 | 0 | 0 | 51.4s |
| excel2pdf | 12 | 0 | 0 | 67.9s |
| ppt2pdf | 12 | 0 | 0 | 11.1s |
| html2pdf | 5 | 0 | 0 | 58.2s |
| pdf2excel | 12 | 0 | 0 | 31.9s |
| img2pdf | 12 | 0 | 0 | 15.7s |

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
| 16 | PDF to Excel number parsing loses leading zeros / formats | SOFT WARN | soft only, 20 linked check(s) passed; warn: pdf2excel-aws-invoice: leading-zero / long ids kept as text (lost 0000) |
| 17 | PDF to PPT slides are flat images, fixed slide size | NOT TESTED | no corpus case |
| 18 | Office to PDF quick mode is screenshots (no text) | SOFT WARN | soft only, 15 linked check(s) passed; warn: excel2pdf-quick-poi-SampleSS.xlsx: selectable text (coverage 0.00); ppt2pdf-quick-poi-SampleShow.pptx: selectable text (coverage 0.00) (+7 more) |
| 19 | HiFi engine from unpinned CDN, font substitution | SOFT WARN | soft only, 12 linked check(s) passed; warn: office-engine-load: no fetches outside the page origin (cdn.zetaoffice.net) |
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
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 30.2s, heap 26 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 1.3s, heap 27 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 1.8s, heap 27 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>excel2pdf-hifi-poi-Tables.xlsx</sub> | PASS | 15 pages, 71 KB, text coverage 1.00 | 1.1s, heap 19 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>word2pdf-hifi-poi-VariousPictures.docx</sub> | PASS | 1 pages, 88 KB, text coverage 1.00 | 1.0s, heap 20 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>excel2pdf-hifi-poi-WithThreeCharts.xlsx</sub> | PASS | 3 pages, 27 KB, text coverage undefined | 1.0s, heap 20 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>ppt2pdf-hifi-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 157 KB, text coverage undefined | 1.1s, heap 20 MB |
| word2pdf | poi-chartex.docx<br><sub>word2pdf-hifi-poi-chartex.docx</sub> | PASS | 3 pages, 67 KB, text coverage 1.00 | 2.9s, heap 20 MB |
| excel2pdf | poi-picture.xlsx<br><sub>excel2pdf-hifi-poi-picture.xlsx</sub> | PASS | 3 pages, 315 KB, text coverage 1.00 | 1.3s, heap 20 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>ppt2pdf-hifi-poi-pie-chart.pptx</sub> | PASS | 1 pages, 15 KB, text coverage 1.00 | 1.2s, heap 20 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 0.3s, heap 20 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>word2pdf-hifi-poi-table_footnotes.docx</sub> | PASS | 1 pages, 11 KB, text coverage 1.00 | 0.3s, heap 20 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>ppt2pdf-hifi-poi-table_test.pptx</sub> | PASS | 1 pages, 7 KB, text coverage undefined | 0.7s, heap 20 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-convert-no-network</sub> | PASS |  | 0.2s, heap 20 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>i-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 198 ms, fonts Carlito-Bold Carlito | 0.3s, heap 20 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>i-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 596 ms, fonts Carlito-Italic Carlito LiberationSans NotoSans-Regular | 0.7s, heap 20 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>i-hifi-poi-Tables.xlsx</sub> | PASS | 15 pages, 853 ms, fonts LiberationSerif-Bold LiberationSerif-Italic LiberationSerif | 1.0s, heap 21 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>i-hifi-poi-VariousPictures.docx</sub> | PASS | 1 pages, 352 ms, fonts Carlito | 0.4s, heap 20 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>i-hifi-poi-WithThreeCharts.xlsx</sub> | PASS | 3 pages, 949 ms, fonts Carlito-Bold Carlito | 1.1s, heap 20 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>i-hifi-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 1619 ms, fonts Carlito | 1.8s, heap 20 MB |
| word2pdf | poi-chartex.docx<br><sub>i-hifi-poi-chartex.docx</sub> | PASS | 3 pages, 965 ms, fonts Carlito LiberationSerif OpenSymbol | 1.1s, heap 20 MB |
| excel2pdf | poi-picture.xlsx<br><sub>i-hifi-poi-picture.xlsx</sub> | PASS | 3 pages, 380 ms, fonts Carlito LiberationSans-Bold LiberationSans-Italic LiberationSans | 0.6s, heap 20 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>i-hifi-poi-pie-chart.pptx</sub> | PASS | 1 pages, 469 ms, fonts Carlito-Bold Carlito | 0.6s, heap 20 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-poi-sample.docx</sub> | PASS | 1 pages, 176 ms, fonts Carlito | 0.2s, heap 21 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>i-hifi-poi-table_footnotes.docx</sub> | PASS | 1 pages, 147 ms, fonts Carlito | 0.2s, heap 20 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>i-hifi-poi-table_test.pptx</sub> | PASS | 1 pages, 521 ms, fonts none | 0.6s, heap 20 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-styled-report</sub> | PASS | 1 page(s), 43 KB, 429 ms, coverage 0.98 | 1.6s, heap 21 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-long-page</sub> | PASS | 23 pages, 478 KB, 1636 ms | 1.9s, heap 22 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 73 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 17.1s, heap 8 MB |
| pdf2excel | flipkart-invoice.pdf<br><sub>pdf2excel-flipkart</sub> | PASS | 1 sheets, 36 cells, coverage 1.00 | 0.5s, heap 10 MB |
| pdf2excel | camelot-bol.pdf<br><sub>pdf2excel-camelot-bol</sub> | PASS | 1 sheets, 64 cells, coverage 1.00 | 1.6s, heap 9 MB |
| pdf2excel | saeco.pdf<br><sub>pdf2excel-saeco</sub> | PASS | 1 sheets, 53 cells, coverage 1.00 | 0.4s, heap 10 MB |
| pdf2excel | free-fiber.pdf<br><sub>pdf2excel-free-fiber</sub> | PASS | 2 sheets, 22 cells, coverage 1.00 | 0.4s, heap 11 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>pdf2excel-fdic</sub> | PASS | 44 sheets, 5302 cells, coverage 0.99 | 3.4s, heap 37 MB |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | PASS | 1 sheets, 22 numbers, 0 numeric text, 0.1 s | 0.2s, heap 20 MB |
| pdf2excel | camelot-bol.pdf<br><sub>h-excel-camelot-eu-typed</sub> | PASS | 1 sheets, 18 numbers, 0 numeric text, 0.1 s | 0.3s, heap 12 MB |
| pdf2excel | netpresse-invoice.pdf<br><sub>h-excel-netpresse-eu-typed</sub> | PASS | 1 sheets, 10 numbers, 0 numeric text, 0.2 s | 0.3s, heap 12 MB |
| pdf2excel | saeco.pdf<br><sub>h-excel-saeco-dates</sub> | PASS | 1 sheets, 14 numbers, 0 numeric text, 0.1 s | 0.1s, heap 23 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-speed-typed</sub> | PASS | 44 sheets, 2860 numbers, 2 numeric text, 3.6 s | 3.9s, heap 26 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-joined</sub> | PASS | 1 sheets, 2680 numbers, 2 numeric text, 3.7 s | 3.8s, heap 36 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 62 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.5s, heap 11 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | PASS | 2 pages, 8 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 1.4s, heap 14 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>excel2pdf-quick-poi-Tables.xlsx</sub> | PASS | 18 pages, 4.6 MB, text coverage 0.00; warn: selectable text (coverage 0.00) | 54.7s, heap 35 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>word2pdf-quick-poi-VariousPictures.docx</sub> | PASS | 1 pages, 295 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.5s, heap 13 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>excel2pdf-quick-poi-WithThreeCharts.xlsx</sub> | PASS | 1 pages, 31 KB, text coverage undefined | 1.5s, heap 16 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>ppt2pdf-quick-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 5 KB, text coverage undefined | 0.7s, heap 11 MB |
| word2pdf | poi-chartex.docx<br><sub>word2pdf-quick-poi-chartex.docx</sub> | PASS | 3 pages, 440 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 6.9s, heap 16 MB |
| excel2pdf | poi-picture.xlsx<br><sub>excel2pdf-quick-poi-picture.xlsx</sub> | PASS | 1 pages, 39 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 1.7s, heap 17 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>ppt2pdf-quick-poi-pie-chart.pptx</sub> | PASS | 1 pages, 3 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 0.5s, heap 14 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | PASS | 1 pages, 251 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.7s, heap 15 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>word2pdf-quick-poi-table_footnotes.docx</sub> | PASS | 1 pages, 33 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.2s, heap 17 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>ppt2pdf-quick-poi-table_test.pptx</sub> | PASS | 1 pages, 2 KB, text coverage undefined | 0.2s, heap 16 MB |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | PASS | 1 page(s), 8.5x5.7 in, 455 KB | 1.6s, heap 7 MB |
| img2pdf | heic-nokia-C001.heic<br><sub>img2pdf-heic-nokia-C001.heic</sub> | PASS | 1 page(s), 8.5x4.8 in, 219 KB | 0.3s, heap 10 MB |
| img2pdf | photo-24MP-punjab-smartphone.jpg<br><sub>img2pdf-photo-24MP-punjab-smartphone.jpg</sub> | PASS | 1 page(s), 40.1x26.7 in, 13.9 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (40.1 x 26.7 in) | 2.3s, heap 7 MB |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | PASS | 1 page(s), 23.0x17.5 in, 5.4 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) | 2.2s, heap 6 MB |
| img2pdf | photo-portrait-sepia-1640x2268.jpg<br><sub>img2pdf-photo-portrait-sepia-1640x2268.jpg</sub> | PASS | 1 page(s), 10.9x15.1 in, 1.5 MB, EXIF 1 | 0.5s, heap 8 MB |
| img2pdf | png-alpha-transparency-demo.png<br><sub>img2pdf-png-alpha-transparency-demo.png</sub> | PASS | 1 page(s), 6.6x5.0 in, 424 KB | 0.5s, heap 7 MB |
| img2pdf | png-webp-comparison-2412x1500.png<br><sub>img2pdf-png-webp-comparison-2412x1500.png</sub> | PASS | 1 page(s), 16.1x10.0 in, 4.3 MB | 2.8s, heap 8 MB |
| img2pdf | tiff-multipage-mmap.tiff<br><sub>img2pdf-tiff-multipage-mmap.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB | 0.1s, heap 8 MB |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) | 0.2s, heap 8 MB |
| img2pdf | webp-chandrayaan-rover.webp<br><sub>img2pdf-webp-chandrayaan-rover.webp</sub> | PASS | 1 page(s), 3.7x2.9 in, 59 KB | 0.1s, heap 9 MB |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | PASS | 1 page(s), 0.9x0.9 in, 8 KB | 0.1s, heap 9 MB |
| img2pdf | photo-24MP-punjab-smartphone.jpg + photo-castle-3456x2628.jpg + photo-portrait-sepia-1640x2268.jpg<br><sub>img2pdf-three-photos-a4</sub> | PASS |  | 5.0s, heap 9 MB |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | PASS | 1 pages, 230 KB; warn: selectable text (coverage 0.00) | 2.2s, heap 8 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-styled-report</sub> | PASS | 1 page(s), 152 KB, 353 ms | 0.6s, heap 8 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-long-page</sub> | PASS | 22 pages, 3.9 MB, 49065 ms | 51.9s, heap 44 MB |
