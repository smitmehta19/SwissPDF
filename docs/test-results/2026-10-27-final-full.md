# Corpus scorecard: 2026-10-27-final-full

Run: 2026-10-27 15:40 UTC, 39.7 min. Command: `npm run test:corpus -- --shards 4 --name 2026-10-27-final-full`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **829 PASS, 0 FAIL, 0 SKIP** of 829 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 17 | 0 | 0 | 51.2s |
| excel2pdf | 12 | 0 | 0 | 84.1s |
| ppt2pdf | 12 | 0 | 0 | 5.5s |
| html2pdf | 5 | 0 | 0 | 51.2s |
| merge | 9 | 0 | 0 | 15.4s |
| split | 8 | 0 | 0 | 26.9s |
| thumbs | 3 | 0 | 0 | 58.3s |
| extract | 3 | 0 | 0 | 2.8s |
| remove | 2 | 0 | 0 | 2.3s |
| rotate | 3 | 0 | 0 | 0.9s |
| organize | 2 | 0 | 0 | 1.8s |
| compress | 12 | 0 | 0 | 135.2s |
| repair | 11 | 0 | 0 | 17.8s |
| watermark | 67 | 0 | 0 | 16.6s |
| pagenumbers | 48 | 0 | 0 | 14.6s |
| sign | 16 | 0 | 0 | 3.1s |
| crop | 15 | 0 | 0 | 2.6s |
| edit | 38 | 0 | 0 | 9.8s |
| protect | 16 | 0 | 0 | 3.6s |
| unlock | 13 | 0 | 0 | 3.5s |
| ocr | 22 | 0 | 0 | 528.9s |
| pdf2word | 23 | 0 | 0 | 88.4s |
| pdf2excel | 12 | 0 | 0 | 9.1s |
| pdf2ppt | 6 | 0 | 0 | 14.5s |
| pdf2md | 12 | 0 | 0 | 14.9s |
| img2pdf | 12 | 0 | 0 | 15.0s |
| pdf2img | 15 | 0 | 0 | 24.7s |
| redact | 56 | 0 | 0 | 62.2s |
| forms | 40 | 0 | 0 | 25.7s |
| compare | 10 | 0 | 0 | 49.1s |
| health | 1 | 0 | 0 | 14.3s |
| automate | 21 | 0 | 0 | 118.8s |
| autorotate | 12 | 0 | 0 | 151.5s |
| nup | 11 | 0 | 0 | 22.8s |
| booklet | 8 | 0 | 0 | 23.2s |
| scale | 10 | 0 | 0 | 13.4s |
| singlepage | 7 | 0 | 0 | 20.0s |
| overlay | 5 | 0 | 0 | 7.2s |
| stamp | 9 | 0 | 0 | 6.8s |
| removeblank | 6 | 0 | 0 | 37.7s |
| linearize | 8 | 0 | 0 | 17.9s |
| adjustcolors | 5 | 0 | 0 | 44.5s |
| replacecolors | 8 | 0 | 0 | 14.5s |
| bookmarks | 6 | 0 | 0 | 8.5s |
| metadata | 7 | 0 | 0 | 16.4s |
| attachments | 8 | 0 | 0 | 10.3s |
| sanitize | 9 | 0 | 0 | 7.9s |
| removeannots | 4 | 0 | 0 | 2.2s |
| removeimages | 5 | 0 | 0 | 5.6s |
| extractimages | 5 | 0 | 0 | 3.8s |
| flatten | 7 | 0 | 0 | 9.8s |
| unlockforms | 5 | 0 | 0 | 3.1s |
| permissions | 4 | 0 | 0 | 4.8s |
| info | 4 | 0 | 0 | 4.1s |
| autorename | 3 | 0 | 0 | 5.5s |
| showjs | 5 | 0 | 0 | 2.7s |
| intake | 126 | 0 | 0 | 310.0s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT REPRODUCED | 32 linked check(s) passed, e.g. merge-owner-only: passed; intake-forms/uk-AFPS-Form-17.pdf: accepted |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT REPRODUCED | 25 linked check(s) passed, e.g. redact-tracemonkey: black box covers the word on screen; redact-aws-invoice: black box covers the word on screen |
| 3 | Redact search misses phrases split across text items | NOT REPRODUCED | 4 linked check(s) passed, e.g. redact-find-split-uk-IPPH353: search finds a phrase split across text items; redact-find-split-uk-AFPS-Form-17: search finds a phrase split across text items |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | SOFT WARN | soft only, 1 linked check(s) passed; warn: compress-lincoln-scan: shrinks a scanned/image-heavy file by 10%+ (saved 1%); compress-fips-scan: shrinks a scanned/image-heavy file by 10%+ (saved 0%) (+5 more) |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT REPRODUCED | 105 linked check(s) passed, e.g. merge-damaged-xref: passed; intake-forms/annotation-button-widget.pdf: accepted |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT REPRODUCED | 159 linked check(s) passed, e.g. watermark-tracemonkey: mark inside the visible page; watermark-rotation-quirk: mark inside the visible page |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT REPRODUCED | 120 linked check(s) passed, e.g. watermark-cyrillic: non-Latin mark present; c-watermark-text-zh: text extracts back (pdf.js) |
| 10 | OCR English only, assets from CDN (not offline) | NOT REPRODUCED | 24 linked check(s) passed, e.g. ocr-fax-printed: no network fetches outside the page origin; ocr-fips-printed: no network fetches outside the page origin |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | SOFT WARN | soft only, 8 linked check(s) passed; warn: ocr-darwin-with-text-layer: skips pages that already have text (33 words before, +33 added); ocr-born-digital-invoice: skips pages that already have text (105 words before, +105 added) (+1 more) |
| 12 | Merge/split drop outlines, AcroForm, links | NOT REPRODUCED | 6 linked check(s) passed, e.g. merge-outlines: bookmarks kept; merge-forms: form fields kept |
| 13 | Crop rejects rotated, ignores box origin | SOFT WARN | soft only, 34 linked check(s) passed; warn: c-crop-rot90-cropbox: content inside the box stays where it was seen (5 of 46 words off p3 "models" want (0.516, 0.210) got (0.516, 0.154); p3 "pre-trained" want (0.516, 0.357) got (0.516, 0.301); p3 "with" want (0.516, 0.565) got (0.516, 0.509)) |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | SOFT WARN | soft only, 36 linked check(s) passed; warn: pdf2word-tracemonkey-2col: column lines stay in reading order (30 of 43 line joins kept); pdf2word-bert-2col: column lines stay in reading order (35 of 59 line joins kept) |
| 16 | PDF to Excel number parsing loses leading zeros / formats | SOFT WARN | soft only, 20 linked check(s) passed; warn: pdf2excel-aws-invoice: leading-zero / long ids kept as text (lost 0000) |
| 17 | PDF to PPT slides are flat images, fixed slide size | SOFT WARN | soft only, 13 linked check(s) passed; warn: pdf2ppt-rotation-mixed: mixed page shapes each fit their slide (2 page aspects, one slide size) |
| 18 | Office to PDF quick mode is screenshots (no text) | SOFT WARN | soft only, 15 linked check(s) passed; warn: excel2pdf-quick-poi-SampleSS.xlsx: selectable text (coverage 0.00); ppt2pdf-quick-poi-SampleShow.pptx: selectable text (coverage 0.00) (+7 more) |
| 19 | HiFi engine from unpinned CDN, font substitution | SOFT WARN | soft only, 19 linked check(s) passed; warn: office-engine-load: no fetches outside the page origin (cdn.zetaoffice.net) |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT REPRODUCED | 15 linked check(s) passed, e.g. pdf2md-noembed-sjis: words carried over (85%+); pdf2md-noembed-eucjp: words carried over (85%+) |
| 21 | Forms: XFA not handled, slow widget map | NOT REPRODUCED | 35 linked check(s) passed, e.g. forms-list-irs-f1040: field scan under 10 s; forms-list-irs-fw9: field scan under 10 s |
| 22 | Protect: comma in password splits MuPDF options | NOT REPRODUCED | 7 linked check(s) passed, e.g. protect-comma-password: comma password refused with a clear message; g2-protect-permissions-only: printing and copying blocked |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | SOFT WARN | soft only, 21 linked check(s) passed; warn: img2pdf-photo-24MP-punjab-smartphone.jpg: fit page is a sane paper size (<= 17 in) (40.1 x 26.7 in); img2pdf-photo-castle-3456x2628.jpg: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) (+1 more) |
| 24 | Sign is visual only, one placement | NOT REPRODUCED | 3 linked check(s) passed, e.g. g3-sign-multi-rot90: signature and initials on page 1; g3-sign-multi-rot90: initials on every page, where placed |
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 28 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (5.9x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (10.8x input) (+1 more) |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT REPRODUCED | 6 linked check(s) passed, e.g. repair-budget-bookmarks: bookmarks kept; repair-fw9-form: form fields kept |
| 27 | Compare by page index only; inserted page breaks the rest | NOT REPRODUCED | 6 linked check(s) passed, e.g. compare-inserted-page: only the inserted page differs; compare-911-self: passed |
| 28 | HTML to PDF is a screenshot, head styles dropped | SOFT WARN | soft only, 8 linked check(s) passed; warn: html2pdf-tracemonkey-text: selectable text (coverage 0.00) |
| 29 | Split/batch outputs and ZIP all in memory | NOT TESTED | memory profile of very large splits not measured in U0 |
| 30 | assertValidOutput re-parses outputs with pdf-lib | NOT TESTED | internal double parse; see timings |
| 31 | Unlock: one password per batch, MuPDF docs not destroyed | NOT TESTED | per-file password is UI only; destroy() leak not measured |
| 32 | Watermark centring is a 45 degree approximation | NOT TESTED | centring at non-45 angles not measured |
| 33 | Page numbers: no skip/template/Bates | NOT REPRODUCED | 5 linked check(s) passed, e.g. g3-pagenumbers-template-skip: skipped pages carry no number; g3-pagenumbers-template-skip: page 3 reads "Seite 1 von 12" |
| 34 | Organize renders all thumbnails at once | NOT TESTED | UI thumbnail batching not driven in U0 |
| 35 | Upload grid: no rotate/sort/add | NOT TESTED | UI feature gap |
| 36 | No result screen / chaining | NOT TESTED | UI feature gap |
| 37 | Files lost on tool switch / Escape | NOT TESTED | UI navigation behaviour not driven in U0 |
| 38 | No cancel, no progress bar | NOT TESTED | UI feature gap |
| 39 | Single-file tools have no batch | NOT TESTED | UI feature gap |
| 40 | Thumbnail cache never evicted | NOT REPRODUCED | 2 linked check(s) passed, e.g. thumbs-cancel-on-remove-956p: rendering stops when the file is released; thumbs-cancel-on-remove-956p: stops within 5 s |
| 41 | Single pdf.js queue delays user ops | NOT TESTED | queue contention not measured |
| 42 | Self-test uses only synthetic fixtures | SOFT WARN | soft only, 0 linked check(s) passed; warn: health-selftest: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) |

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 15.1s, heap 28 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 0.8s, heap 26 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 0.8s, heap 27 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>excel2pdf-hifi-poi-Tables.xlsx</sub> | PASS | 15 pages, 71 KB, text coverage 1.00 | 0.5s, heap 29 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>word2pdf-hifi-poi-VariousPictures.docx</sub> | PASS | 1 pages, 88 KB, text coverage 1.00 | 0.5s, heap 29 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>excel2pdf-hifi-poi-WithThreeCharts.xlsx</sub> | PASS | 3 pages, 27 KB, text coverage undefined | 0.4s, heap 31 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>ppt2pdf-hifi-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 157 KB, text coverage undefined | 0.5s, heap 31 MB |
| word2pdf | poi-chartex.docx<br><sub>word2pdf-hifi-poi-chartex.docx</sub> | PASS | 3 pages, 67 KB, text coverage 1.00 | 0.7s, heap 31 MB |
| excel2pdf | poi-picture.xlsx<br><sub>excel2pdf-hifi-poi-picture.xlsx</sub> | PASS | 3 pages, 315 KB, text coverage 1.00 | 0.3s, heap 26 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>ppt2pdf-hifi-poi-pie-chart.pptx</sub> | PASS | 1 pages, 15 KB, text coverage 1.00 | 0.3s, heap 26 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 0.1s, heap 26 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>word2pdf-hifi-poi-table_footnotes.docx</sub> | PASS | 1 pages, 11 KB, text coverage 1.00 | 0.2s, heap 26 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>ppt2pdf-hifi-poi-table_test.pptx</sub> | PASS | 1 pages, 7 KB, text coverage undefined | 0.3s, heap 27 MB |
| word2pdf | -<br><sub>i-engine-pinned-warm-boot</sub> | PASS | cold boot 4269 ms (download 1843 ms, cache false), warm boot 3190 ms | 7.5s, heap 41 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-convert-no-network</sub> | PASS |  | 0.3s, heap 44 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>i-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 334 ms, fonts Carlito-Bold Carlito | 0.4s, heap 39 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>i-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 346 ms, fonts Carlito-Italic Carlito LiberationSans NotoSans-Regular | 0.4s, heap 40 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>i-hifi-poi-Tables.xlsx</sub> | PASS | 15 pages, 435 ms, fonts LiberationSerif-Bold LiberationSerif-Italic LiberationSerif | 0.6s, heap 42 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>i-hifi-poi-VariousPictures.docx</sub> | PASS | 1 pages, 131 ms, fonts Carlito | 0.2s, heap 42 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>i-hifi-poi-WithThreeCharts.xlsx</sub> | PASS | 3 pages, 186 ms, fonts Carlito-Bold Carlito | 0.2s, heap 42 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>i-hifi-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 445 ms, fonts Carlito | 0.5s, heap 43 MB |
| word2pdf | poi-chartex.docx<br><sub>i-hifi-poi-chartex.docx</sub> | PASS | 3 pages, 422 ms, fonts Carlito LiberationSerif OpenSymbol | 0.5s, heap 43 MB |
| excel2pdf | poi-picture.xlsx<br><sub>i-hifi-poi-picture.xlsx</sub> | PASS | 3 pages, 238 ms, fonts Carlito LiberationSans-Bold LiberationSans-Italic LiberationSans | 0.3s, heap 43 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>i-hifi-poi-pie-chart.pptx</sub> | PASS | 1 pages, 205 ms, fonts Carlito-Bold Carlito | 0.3s, heap 44 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-poi-sample.docx</sub> | PASS | 1 pages, 106 ms, fonts Carlito | 0.2s, heap 44 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>i-hifi-poi-table_footnotes.docx</sub> | PASS | 1 pages, 74 ms, fonts Carlito | 0.1s, heap 44 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>i-hifi-poi-table_test.pptx</sub> | PASS | 1 pages, 238 ms, fonts none | 0.3s, heap 44 MB |
| word2pdf | -<br><sub>i-font-probe-docx</sub> | PASS | per line: Calibri=BAAAAA+Carlito, Calibri Light=BAAAAA+Carlito, Cambria=CAAAAA+Caladea-Regular, Aptos=DAAAAA+NotoSans-Regular, SimSun=EAAAAA+NotoSerif-Regular, MS Gothic=DAAAAA+NotoSans-Regular, Malgun Gothic=DAAAAA+NotoSans-Regular, Mangal=DAAAAA+NotoSans-Regular; embedded: Caladea-Regular, Carlito, NotoSans-Regular, NotoSansKR-Regular, NotoSansSC-Regular, NotoSerif-Regular; warn: Devanagari text | 0.4s, heap 45 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-styled-report</sub> | PASS | 1 page(s), 43 KB, 301 ms, coverage 0.98 | 1.4s, heap 24 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-long-page</sub> | PASS | 23 pages, 478 KB, 682 ms | 0.8s, heap 25 MB |
| word2pdf | poi-sample.docx<br><sub>i-engine-hang-restart</sub> | PASS | reboot + convert 3377 ms | 3.5s, heap 51 MB |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf + arxiv-1512.03385-resnet.pdf<br><sub>merge-reports</sub> | PASS | 42 pages, 2.2 MB | 1.5s, heap 9 MB |
| merge | pdfjs-rotation.pdf + pdfjs-hello_world_rotated.pdf + rot90-cropbox-bert.pdf<br><sub>merge-rotated</sub> | PASS | 23 pages, 648 KB | 0.3s, heap 19 MB |
| merge | pdfjs-nested_outline.pdf + us-budget-2024.pdf<br><sub>merge-outlines</sub> | PASS | 193 pages, 1.9 MB | 2.2s, heap 25 MB |
| merge | irs-fw9.pdf + irs-f1040sa.pdf<br><sub>merge-forms</sub> | PASS | 7 pages, 89 KB | 0.2s, heap 34 MB |
| merge | 911-commission-report.pdf + us-economic-report-president-2024.pdf<br><sub>merge-large</sub> | PASS | 1072 pages, 7.0 MB | 3.7s, heap 86 MB |
| merge | owner-only-tracemonkey.pdf + pdfjs-TAMReview.pdf<br><sub>merge-owner-only</sub> | PASS | 37 pages, 1.5 MB | 0.7s, heap 50 MB |
| merge | pdfjs-xref_command_missing.pdf + pdfjs-tracemonkey.pdf<br><sub>merge-damaged-xref</sub> | PASS | 15 pages, 940 KB | 0.3s, heap 49 MB |
| merge | pdf20-simple.pdf + pdf20-offset-start.pdf + pdf20-incremental-save.pdf<br><sub>merge-pdf20</sub> | PASS | 3 pages, 5 KB | 0.1s, heap 57 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | PASS | 14 pages -> 7 + 7 | 0.8s, heap 9 MB |
| split | us-budget-2024.pdf<br><sub>split-budget-bookmarks</sub> | PASS | 184 pages -> 92 + 92 | 3.8s, heap 48 MB |
| split | 911-commission-report.pdf<br><sub>split-911-large</sub> | PASS | 585 pages -> 292 + 293 | 1.9s, heap 58 MB |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 0.3s, heap 53 MB |
| split | irs-f1040.pdf<br><sub>split-form-f1040</sub> | PASS | 2 pages -> 1 + 1 | 0.4s, heap 63 MB |
| split | crooked-paths-1648-104MB.pdf<br><sub>split-crooked-104MB</sub> | PASS | 255 pages -> 127 + 128 | 8.6s, heap 24 MB |
| split | explorations-bible-lands-956pp-62MB.pdf<br><sub>split-bible-956p-62MB</sub> | PASS | 956 pages -> 478 + 478 | 7.7s, heap 24 MB |
| thumbs | 911-commission-report.pdf<br><sub>thumbs-911-585p</sub> | PASS | 100 previews in 1.0 s | 1.7s, heap 11 MB |
| thumbs | explorations-bible-lands-956pp-62MB.pdf<br><sub>thumbs-bible-956p-62MB</sub> | PASS | 100 previews in 53.0 s | 53.4s, heap 14 MB |
| thumbs | explorations-bible-lands-956pp-62MB.pdf<br><sub>thumbs-cancel-on-remove-956p</sub> | PASS |  | 3.2s, heap 9 MB |
| extract | us-budget-2024.pdf<br><sub>extract-budget-1-3-5</sub> | PASS | 3 pages out | 2.2s, heap 18 MB |
| extract | pdfjs-rotation.pdf<br><sub>extract-rotation-2</sub> | PASS | 1 pages out | 0.1s, heap 26 MB |
| extract | darwin-origin-of-species-ia.pdf<br><sub>extract-darwin-scan</sub> | PASS | 3 pages out | 0.5s, heap 26 MB |
| remove | pdfjs-tracemonkey.pdf<br><sub>remove-tracemonkey-p1</sub> | PASS | 13 pages out | 0.8s, heap 9 MB |
| remove | 911-commission-report.pdf<br><sub>remove-911-first10</sub> | PASS | 575 pages out | 1.5s, heap 22 MB |
| rotate | pdfjs-rotation.pdf<br><sub>rotate-rotation-quirk</sub> | PASS | 2 pages out | 0.5s, heap 9 MB |
| rotate | rot90-cropbox-bert.pdf<br><sub>rotate-rot90-cropbox</sub> | PASS | 16 pages out | 0.3s, heap 9 MB |
| rotate | pdfjs-hello_world_rotated.pdf<br><sub>rotate-hello-rotated</sub> | PASS | 5 pages out | 0.1s, heap 11 MB |
| organize | pdfjs-tracemonkey.pdf<br><sub>organize-reverse-tracemonkey</sub> | PASS | 14 pages out | 1.3s, heap 9 MB |
| organize | irs-fw4.pdf<br><sub>organize-reverse-fw4</sub> | PASS | 5 pages out | 0.5s, heap 14 MB |
| compress | lincoln-ellsworth-letter-1861.pdf<br><sub>compress-lincoln-scan</sub> | PASS | 529 KB -> 526 KB (99%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 1%) | 0.7s, heap 9 MB |
| compress | fips-document-facsimile-transmission.pdf<br><sub>compress-fips-scan</sub> | PASS | 4.2 MB -> 4.2 MB (100%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 0%) | 1.0s, heap 10 MB |
| compress | queen-victoria-peabody-letter-1866.pdf<br><sub>compress-queen-victoria-scan</sub> | PASS | 5.7 MB -> 5.7 MB (100%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 0%) | 1.1s, heap 9 MB |
| compress | darwin-origin-of-species-ia.pdf<br><sub>compress-darwin-24MB</sub> | PASS | 24.2 MB -> 24.0 MB (99%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 1%) | 5.3s, heap 9 MB |
| compress | 19th-century-young-man-57MB.pdf<br><sub>compress-young-man-57MB</sub> | PASS | 54.8 MB -> 54.7 MB (100%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 0%) | 7.3s, heap 9 MB |
| compress | explorations-bible-lands-956pp-62MB.pdf<br><sub>compress-bible-lands-62MB</sub> | PASS | 59.8 MB -> 59.8 MB (100%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 0%) | 11.6s, heap 9 MB |
| compress | crooked-paths-1648-104MB.pdf<br><sub>compress-crooked-104MB</sub> | PASS | 99.3 MB -> 99.1 MB (100%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 0%) | 9.9s, heap 9 MB |
| compress | arxiv-2307.09288-llama2.pdf<br><sub>compress-llama2</sub> | PASS | 13.0 MB -> 12.6 MB (97%) | 2.0s, heap 9 MB |
| compress | ipcc-ar6-synthesis-longer-report.pdf<br><sub>compress-ipcc</sub> | PASS | 5.0 MB -> 3.2 MB (65%) | 2.6s, heap 9 MB |
| compress | us-economic-report-president-2024.pdf<br><sub>compress-econ-report</sub> | PASS | 4.9 MB -> 4.9 MB (100%), already optimized, kept the original | 7.2s, heap 9 MB |
| compress | pdfjs-tracemonkey.pdf<br><sub>compress-raster-tracemonkey</sub> | PASS | 992 KB -> 992 KB (100%), kept original | 1.3s, heap 10 MB |
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | PASS | recovered 1, rasterized 0, lost 0 | 0.8s, heap 9 MB |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | PASS |  | 0.1s |
| repair | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>repair-fuzzed-395</sub> | PASS |  | 0.1s |
| repair | pdfjs-bug1020226.pdf<br><sub>repair-bug1020226</sub> | PASS |  | 0.1s |
| repair | pdfjs-Pages-tree-refs.pdf<br><sub>repair-pages-tree-refs</sub> | PASS | recovered 1, rasterized 0, lost 1 | 0.1s, heap 10 MB |
| repair | pdf20-offset-start.pdf<br><sub>repair-offset-start</sub> | PASS | recovered 1, rasterized 0, lost 0 | 0.1s, heap 10 MB |
| repair | us-budget-2024.pdf<br><sub>repair-budget-bookmarks</sub> | PASS | recovered 184, rasterized 0, lost 0 | 2.8s, heap 30 MB |
| repair | irs-fw9.pdf<br><sub>repair-fw9-form</sub> | PASS | recovered 6, rasterized 0, lost 0 | 0.1s, heap 44 MB |
| repair | us-budget-2024.pdf<br><sub>g2-repair-keeps-structure</sub> | PASS | rewrite, 27 of 27 bookmarks | 2.4s, heap 48 MB |
| repair | irs-fw9.pdf<br><sub>g2-repair-keeps-fields</sub> | PASS | rewrite, 23 of 23 fields | 0.2s, heap 46 MB |
| repair | us-budget-2024.pdf<br><sub>g2-repair-truncated-bookmarks</sub> | PASS | rebuild, 183 pages, 27/27 bookmarks, intake: File was damaged and has been repaired. 1 of 184 pages could not be recovered | 10.8s, heap 78 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-tracemonkey</sub> | PASS | 14 marks | 0.7s, heap 9 MB |
| watermark | pdfjs-rotation.pdf<br><sub>watermark-rotation-quirk</sub> | PASS | 2 marks | 0.1s, heap 13 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>watermark-rot90-cropbox</sub> | PASS | 16 marks | 0.2s, heap 14 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>watermark-origin-shift</sub> | PASS | 1 marks | 0.1s, heap 14 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>watermark-issue1155r-origin</sub> | PASS | 1 marks | 0.1s, heap 15 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-cyrillic</sub> | PASS |  | 0.5s, heap 15 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-0</sub> | PASS | 16 marks | 0.2s, heap 20 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-45</sub> | PASS | 16 marks | 0.3s, heap 13 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-90</sub> | PASS | 16 marks | 0.2s, heap 19 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox--30</sub> | PASS | 16 marks | 0.2s, heap 18 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-0</sub> | PASS | 5 marks | 0.1s, heap 18 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-45</sub> | PASS | 5 marks | 0.1s, heap 19 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-90</sub> | PASS | 5 marks | 0.1s, heap 19 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90--30</sub> | PASS | 5 marks | 0.1s, heap 19 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-0</sub> | PASS | 2 marks | 0.1s, heap 20 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-45</sub> | PASS | 2 marks | 0.1s, heap 20 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-90</sub> | PASS | 2 marks | 0.1s, heap 20 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk--30</sub> | PASS | 2 marks | 0.1s, heap 20 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-0</sub> | PASS | 1 marks | 0.1s, heap 21 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-45</sub> | PASS | 1 marks | 0.1s, heap 21 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-90</sub> | PASS | 1 marks | 0.1s, heap 12 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop--30</sub> | PASS | 1 marks | 0.1s, heap 12 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-0</sub> | PASS | 1 marks | 0.1s, heap 12 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-45</sub> | PASS | 1 marks | 0.1s, heap 13 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-90</sub> | PASS | 1 marks | 0.1s, heap 13 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift--30</sub> | PASS | 1 marks | 0.1s, heap 13 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-0</sub> | PASS | 1 marks | 0.4s, heap 14 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-45</sub> | PASS | 1 marks | 0.2s, heap 16 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-90</sub> | PASS | 1 marks | 0.2s, heap 17 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin--30</sub> | PASS | 1 marks | 0.2s, heap 19 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-0</sub> | PASS | 2 marks | 0.1s, heap 12 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-45</sub> | PASS | 2 marks | 0.1s, heap 13 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-90</sub> | PASS | 2 marks | 0.1s, heap 15 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin--30</sub> | PASS | 2 marks | 0.1s, heap 16 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-0</sub> | PASS | 2 marks | 0.1s, heap 17 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-45</sub> | PASS | 2 marks | 0.1s, heap 18 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-90</sub> | PASS | 2 marks | 0.1s, heap 19 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox--30</sub> | PASS | 2 marks | 0.1s, heap 21 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-0</sub> | PASS | 5 marks | 0.1s, heap 22 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-45</sub> | PASS | 5 marks | 0.1s, heap 23 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-90</sub> | PASS | 5 marks | 0.1s, heap 25 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed--30</sub> | PASS | 5 marks | 0.1s, heap 12 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-0</sub> | PASS | 2 marks | 0.1s, heap 14 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-45</sub> | PASS | 2 marks | 0.1s, heap 14 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-90</sub> | PASS | 2 marks | 0.1s, heap 14 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed--30</sub> | PASS | 2 marks | 0.1s, heap 14 MB |
| watermark | us-budget-2024.pdf<br><sub>c-watermark-budget-mixed-rot-45</sub> | PASS | 40 marks | 2.5s, heap 53 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-tile-c-mixed</sub> | PASS |  | 0.1s, heap 53 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-tile-rot90-cropbox</sub> | PASS |  | 0.2s, heap 56 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-zh</sub> | PASS |  | 0.4s, heap 41 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ja</sub> | PASS |  | 0.3s, heap 50 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ko</sub> | PASS |  | 0.3s, heap 58 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar</sub> | PASS |  | 0.3s, heap 45 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar-mixed</sub> | PASS |  | 0.3s, heap 56 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar-decimal</sub> | PASS |  | 0.5s, heap 45 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar-digits</sub> | PASS |  | 0.3s, heap 57 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-he-date</sub> | PASS |  | 0.3s, heap 47 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-zh-hant</sub> | PASS |  | 0.3s, heap 55 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ko-hanja</sub> | PASS |  | 0.4s, heap 63 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-bn</sub> | PASS |  | 0.3s, heap 20 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ta</sub> | PASS |  | 0.3s, heap 27 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-th</sub> | PASS |  | 0.3s, heap 36 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-symbols</sub> | PASS |  | 0.3s, heap 43 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-he</sub> | PASS |  | 0.3s, heap 28 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-hi</sub> | PASS |  | 0.3s, heap 36 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ru</sub> | PASS |  | 0.3s, heap 48 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-mixed</sub> | PASS |  | 0.3s, heap 41 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>pagenumbers-tracemonkey</sub> | PASS |  | 0.8s, heap 9 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>pagenumbers-rotation-quirk</sub> | PASS |  | 0.1s, heap 13 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>pagenumbers-rot90-cropbox</sub> | PASS |  | 0.4s, heap 14 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>pagenumbers-origin-shift</sub> | PASS |  | 0.1s, heap 14 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>pagenumbers-issue1155r-origin</sub> | PASS |  | 0.1s, heap 15 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>c-pagenumbers-rot90-cropbox-bottom-center</sub> | PASS |  | 0.2s, heap 15 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>c-pagenumbers-rot90-cropbox-top-right</sub> | PASS |  | 0.2s, heap 15 MB |
| pagenumbers | pdfjs-hello_world_rotated.pdf<br><sub>c-pagenumbers-hello-rot90-bottom-center</sub> | PASS |  | 0.1s, heap 16 MB |
| pagenumbers | pdfjs-hello_world_rotated.pdf<br><sub>c-pagenumbers-hello-rot90-top-right</sub> | PASS |  | 0.1s, heap 17 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>c-pagenumbers-rotation-quirk-bottom-center</sub> | PASS |  | 0.1s, heap 17 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>c-pagenumbers-rotation-quirk-top-right</sub> | PASS |  | 0.1s, heap 17 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>c-pagenumbers-issue1155r-crop-bottom-center</sub> | PASS |  | 0.1s, heap 10 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>c-pagenumbers-issue1155r-crop-top-right</sub> | PASS |  | 0.1s, heap 10 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>c-pagenumbers-origin-shift-bottom-center</sub> | PASS |  | 0.1s, heap 10 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>c-pagenumbers-origin-shift-top-right</sub> | PASS |  | 0.1s, heap 10 MB |
| pagenumbers | xfa-imm1344e-filled.pdf<br><sub>c-pagenumbers-xfa-origin-bottom-center</sub> | PASS |  | 0.2s, heap 11 MB |
| pagenumbers | xfa-imm1344e-filled.pdf<br><sub>c-pagenumbers-xfa-origin-top-right</sub> | PASS |  | 0.2s, heap 13 MB |
| pagenumbers | c-rot180-origin.pdf<br><sub>c-pagenumbers-c-rot180-origin-bottom-center</sub> | PASS |  | 0.1s, heap 14 MB |
| pagenumbers | c-rot180-origin.pdf<br><sub>c-pagenumbers-c-rot180-origin-top-right</sub> | PASS |  | 0.1s, heap 16 MB |
| pagenumbers | c-rot270-cropbox.pdf<br><sub>c-pagenumbers-c-rot270-cropbox-bottom-center</sub> | PASS |  | 0.1s, heap 11 MB |
| pagenumbers | c-rot270-cropbox.pdf<br><sub>c-pagenumbers-c-rot270-cropbox-top-right</sub> | PASS |  | 0.1s, heap 12 MB |
| pagenumbers | c-mixed.pdf<br><sub>c-pagenumbers-c-mixed-bottom-center</sub> | PASS |  | 0.1s, heap 13 MB |
| pagenumbers | c-mixed.pdf<br><sub>c-pagenumbers-c-mixed-top-right</sub> | PASS |  | 0.1s, heap 15 MB |
| pagenumbers | fax-jean-schmidt-doe.pdf<br><sub>c-pagenumbers-fax-mixed-bottom-center</sub> | PASS |  | 0.1s, heap 10 MB |
| pagenumbers | fax-jean-schmidt-doe.pdf<br><sub>c-pagenumbers-fax-mixed-top-right</sub> | PASS |  | 0.1s, heap 10 MB |
| pagenumbers | us-budget-2024.pdf<br><sub>c-pagenumbers-budget-mixed-rot-bottom-center</sub> | PASS |  | 3.0s, heap 35 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-zh</sub> | PASS |  | 0.4s, heap 53 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ja</sub> | PASS |  | 0.3s, heap 38 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ko</sub> | PASS |  | 0.3s, heap 48 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar</sub> | PASS |  | 0.3s, heap 57 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar-mixed</sub> | PASS |  | 0.3s, heap 49 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar-decimal</sub> | PASS |  | 0.3s, heap 62 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar-digits</sub> | PASS |  | 0.6s, heap 55 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-he-date</sub> | PASS |  | 0.3s, heap 47 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-zh-hant</sub> | PASS |  | 0.3s, heap 55 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ko-hanja</sub> | PASS |  | 0.3s, heap 17 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-bn</sub> | PASS |  | 0.3s, heap 29 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ta</sub> | PASS |  | 0.3s, heap 17 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-th</sub> | PASS |  | 0.3s, heap 29 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-symbols</sub> | PASS |  | 0.3s, heap 37 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-he</sub> | PASS |  | 0.3s, heap 22 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-hi</sub> | PASS |  | 0.3s, heap 31 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ru</sub> | PASS |  | 0.3s, heap 32 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-mixed</sub> | PASS |  | 0.3s, heap 27 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-template-skip</sub> | PASS |  | 0.3s, heap 39 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-facing</sub> | PASS |  | 0.3s, heap 18 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>g3-pagenumbers-bates-rot90</sub> | PASS |  | 0.2s, heap 24 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-margin-big</sub> | PASS |  | 0.3s, heap 30 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 0.7s, heap 9 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 0.1s, heap 12 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | PASS | centre (0.50, 0.85) | 0.2s, heap 13 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>sign-origin-shift</sub> | PASS | centre (0.50, 0.85) | 0.1s, heap 13 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>sign-issue1155r-origin</sub> | PASS | centre (0.50, 0.85) | 0.1s, heap 13 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>c-sign-rot90-cropbox</sub> | PASS |  | 0.3s, heap 13 MB |
| sign | pdfjs-hello_world_rotated.pdf<br><sub>c-sign-hello-rot90</sub> | PASS |  | 0.1s, heap 16 MB |
| sign | pdfjs-rotation.pdf<br><sub>c-sign-rotation-quirk</sub> | PASS |  | 0.1s, heap 14 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>c-sign-issue1155r-crop</sub> | PASS |  | 0.1s, heap 14 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>c-sign-origin-shift</sub> | PASS |  | 0.1s, heap 14 MB |
| sign | xfa-imm1344e-filled.pdf<br><sub>c-sign-xfa-origin</sub> | PASS |  | 0.2s, heap 14 MB |
| sign | c-rot180-origin.pdf<br><sub>c-sign-c-rot180-origin</sub> | PASS |  | 0.1s, heap 9 MB |
| sign | c-rot270-cropbox.pdf<br><sub>c-sign-c-rot270-cropbox</sub> | PASS |  | 0.1s, heap 11 MB |
| sign | c-mixed.pdf<br><sub>c-sign-c-mixed</sub> | PASS |  | 0.1s, heap 12 MB |
| sign | fax-jean-schmidt-doe.pdf<br><sub>c-sign-fax-mixed</sub> | PASS |  | 0.1s, heap 13 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>g3-sign-multi-rot90</sub> | PASS |  | 0.3s, heap 14 MB |
| crop | pdfjs-tracemonkey.pdf<br><sub>crop-tracemonkey</sub> | PASS | CropBox 61,317,367,713 | 0.7s, heap 9 MB |
| crop | pdfjs-rotation.pdf<br><sub>crop-rotation-quirk</sub> | PASS | CropBox 61,317,367,713 | 0.1s, heap 11 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>crop-rot90-cropbox</sub> | PASS | CropBox 93,135,358,511 | 0.2s, heap 11 MB |
| crop | origin-shift-aws-invoice.pdf<br><sub>crop-origin-shift</sub> | PASS | CropBox 261,617,567,1013 | 0.1s, heap 12 MB |
| crop | pdfjs-issue1155r.pdf<br><sub>crop-issue1155r-origin</sub> | PASS | CropBox 60,337,357,758 | 0.1s, heap 13 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>c-crop-rot90-cropbox</sub> | PASS | 46 words checked; warn: content inside the box stays where it was seen (5 of 46 words off p3 "models" want (0.516, 0.210) got (0.516, 0.154); p3 "pre-trained" want (0.516, 0.357) got (0.516, 0.301); p3 "with" want (0.516, 0.565) got (0.516, 0.509)) | 0.2s, heap 13 MB |
| crop | pdfjs-hello_world_rotated.pdf<br><sub>c-crop-hello-rot90</sub> | PASS | 0 words checked | 0.1s, heap 15 MB |
| crop | pdfjs-rotation.pdf<br><sub>c-crop-rotation-quirk</sub> | PASS | 2 words checked | 0.1s, heap 13 MB |
| crop | pdfjs-issue1155r.pdf<br><sub>c-crop-issue1155r-crop</sub> | PASS | 0 words checked | 0.1s, heap 13 MB |
| crop | origin-shift-aws-invoice.pdf<br><sub>c-crop-origin-shift</sub> | PASS | 3 words checked | 0.1s, heap 14 MB |
| crop | xfa-imm1344e-filled.pdf<br><sub>c-crop-xfa-origin</sub> | PASS | 0 words checked | 0.2s, heap 14 MB |
| crop | c-rot180-origin.pdf<br><sub>c-crop-c-rot180-origin</sub> | PASS | 6 words checked | 0.1s, heap 16 MB |
| crop | c-rot270-cropbox.pdf<br><sub>c-crop-c-rot270-cropbox</sub> | PASS | 6 words checked | 0.1s, heap 17 MB |
| crop | c-mixed.pdf<br><sub>c-crop-c-mixed</sub> | PASS | 15 words checked | 0.1s, heap 18 MB |
| crop | fax-jean-schmidt-doe.pdf<br><sub>c-crop-fax-mixed</sub> | PASS | 6 words checked | 0.1s, heap 19 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>edit-tracemonkey</sub> | PASS |  | 0.8s, heap 9 MB |
| edit | pdfjs-rotation.pdf<br><sub>edit-rotation-quirk</sub> | PASS |  | 0.1s, heap 13 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>edit-rot90-cropbox</sub> | PASS |  | 0.2s, heap 13 MB |
| edit | origin-shift-aws-invoice.pdf<br><sub>edit-origin-shift</sub> | PASS |  | 0.1s, heap 13 MB |
| edit | pdfjs-issue1155r.pdf<br><sub>edit-issue1155r-origin</sub> | PASS |  | 0.1s, heap 13 MB |
| edit | udhr-chinese-simplified.pdf<br><sub>edit-cjk-text</sub> | PASS |  | 0.4s, heap 13 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>c-edit-rot90-cropbox-p1</sub> | PASS |  | 0.2s, heap 18 MB |
| edit | pdfjs-hello_world_rotated.pdf<br><sub>c-edit-hello-rot90-p1</sub> | PASS |  | 0.1s, heap 15 MB |
| edit | pdfjs-rotation.pdf<br><sub>c-edit-rotation-quirk-p1</sub> | PASS |  | 0.1s, heap 15 MB |
| edit | pdfjs-issue1155r.pdf<br><sub>c-edit-issue1155r-crop-p1</sub> | PASS |  | 0.1s, heap 16 MB |
| edit | origin-shift-aws-invoice.pdf<br><sub>c-edit-origin-shift-p1</sub> | PASS |  | 0.1s, heap 16 MB |
| edit | xfa-imm1344e-filled.pdf<br><sub>c-edit-xfa-origin-p1</sub> | PASS |  | 0.2s, heap 17 MB |
| edit | c-rot180-origin.pdf<br><sub>c-edit-c-rot180-origin-p1</sub> | PASS |  | 0.1s, heap 18 MB |
| edit | c-rot270-cropbox.pdf<br><sub>c-edit-c-rot270-cropbox-p1</sub> | PASS |  | 0.1s, heap 14 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p1</sub> | PASS |  | 0.1s, heap 15 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p2</sub> | PASS |  | 0.1s, heap 17 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p3</sub> | PASS |  | 0.1s, heap 18 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p4</sub> | PASS |  | 0.1s, heap 15 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p5</sub> | PASS |  | 0.1s, heap 16 MB |
| edit | fax-jean-schmidt-doe.pdf<br><sub>c-edit-fax-mixed-p1</sub> | PASS |  | 0.1s, heap 18 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-zh</sub> | PASS |  | 0.3s, heap 18 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ja</sub> | PASS |  | 0.3s, heap 17 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ko</sub> | PASS |  | 0.3s, heap 18 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar</sub> | PASS |  | 0.5s, heap 17 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar-mixed</sub> | PASS |  | 0.3s, heap 25 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar-decimal</sub> | PASS |  | 0.3s, heap 20 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar-digits</sub> | PASS |  | 0.3s, heap 19 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-he-date</sub> | PASS |  | 0.4s, heap 26 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-zh-hant</sub> | PASS |  | 0.3s, heap 23 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ko-hanja</sub> | PASS |  | 0.4s, heap 30 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-bn</sub> | PASS |  | 0.3s, heap 18 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ta</sub> | PASS |  | 0.3s, heap 17 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-th</sub> | PASS |  | 0.3s, heap 24 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-symbols</sub> | PASS |  | 0.3s, heap 17 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-he</sub> | PASS |  | 0.3s, heap 24 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-hi</sub> | PASS |  | 0.3s, heap 31 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ru</sub> | PASS |  | 0.3s, heap 19 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-mixed</sub> | PASS |  | 0.3s, heap 30 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | PASS | Standard V5 R6 256-bit AES | 0.8s, heap 9 MB |
| protect | 911-commission-report.pdf<br><sub>protect-911-large</sub> | PASS | Standard V5 R6 256-bit AES | 0.5s, heap 10 MB |
| protect | owner-only-irs-fw9.pdf<br><sub>protect-owner-only-input</sub> | PASS | Standard V5 R6 256-bit AES | 0.3s, heap 9 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 0.1s |
| protect | aws-invoice.pdf<br><sub>protect-unicode-password</sub> | PASS | Standard V5 R6 256-bit AES | 0.1s, heap 9 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-permissions-only</sub> | PASS | Standard V5 R6 256-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 0.3s, heap 9 MB |
| protect | irs-fw9.pdf<br><sub>g2-protect-open-and-owner</sub> | PASS | {"print":true,"copy":true,"edit":false,"annotate":true,"form":true,"assemble":false,"print-hq":true} | 0.2s, heap 9 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-aes128-tracemonkey</sub> | PASS | Standard V4 R4 128-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":false,"assemble":true,"print-hq":false} | 0.2s, heap 9 MB |
| protect | aws-invoice.pdf<br><sub>g2-protect-rc4-40-invoice</sub> | PASS | Standard V1 R2 40-bit RC4, {"print":false,"copy":true,"edit":false,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 0.1s, heap 9 MB |
| protect | irs-fw9.pdf<br><sub>g2-protect-aes256-fw9</sub> | PASS | Standard V5 R6 256-bit AES, {"print":true,"copy":true,"edit":true,"annotate":true,"form":false,"assemble":false,"print-hq":false} | 0.2s, heap 9 MB |
| protect | aws-invoice.pdf<br><sub>g2-protect-aes256-unicode-pdfjs</sub> | PASS |  | 0.1s, heap 9 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes128-emoji-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-rc4-nbsp-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes128-cjk-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes256-softhyphen-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes256-fullwidth-refused</sub> | PASS |  | 0.1s |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | PASS | removed: none listed, had user password | 0.6s, heap 9 MB |
| unlock | pdfjs-issue6010_1.pdf<br><sub>unlock-issue6010_1</sub> | PASS | removed: none listed, had user password | 0.1s, heap 10 MB |
| unlock | pdfjs-issue6010_2.pdf<br><sub>unlock-issue6010_2</sub> | PASS | removed: none listed, had user password | 0.2s, heap 10 MB |
| unlock | pdfjs-bug1782186.pdf<br><sub>unlock-bug1782186</sub> | PASS | removed: none listed, had user password | 0.1s, heap 10 MB |
| unlock | pdfjs-issue21579.pdf<br><sub>unlock-issue21579</sub> | PASS | removed: copying text, editing, annotating, reordering pages, had user password | 0.1s, heap 10 MB |
| unlock | pdfjs-issue15893_reduced.pdf<br><sub>unlock-issue15893_reduced</sub> | PASS | removed: none listed, had user password | 0.1s, heap 10 MB |
| unlock | pdfjs-saslprep-r6.pdf<br><sub>unlock-saslprep-r6</sub> | PASS | removed: none listed, had user password | 0.2s, heap 10 MB |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | PASS | removed: none listed, had user password | 0.2s, heap 10 MB |
| unlock | pdfjs-empty_protected.pdf<br><sub>unlock-empty-protected</sub> | PASS | removed: copying text, editing, reordering pages | 0.1s, heap 10 MB |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 0.4s, heap 10 MB |
| unlock | owner-only-aws-invoice.pdf<br><sub>unlock-owner-only-invoice</sub> | PASS | removed: printing, high-quality printing, copying text | 0.1s, heap 9 MB |
| unlock | pdfjs-bug1782186.pdf<br><sub>unlock-wrong-password</sub> | PASS |  | 0.1s |
| unlock | a-owner-only-us-budget.pdf<br><sub>g2-unlock-owner-only-fast</sub> | PASS | 297 ms, removed: printing, copying text, editing | 1.0s, heap 9 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 397 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc" | 11.2s, heap 12 MB |
| ocr | sub-fips-p5-6.pdf<br><sub>ocr-fips-printed</sub> | PASS | 91 words, sample "N RS-466 PROCEDURES FOR DOCUMENT FACSIMILE TRANSMI" | 6.5s, heap 11 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>ocr-darwin-with-text-layer</sub> | PASS | 97 words, sample " CONTENTS PAGE EDITOR'S INTRODUCTION . 5 5 3 e o "; warn: skips pages that already have text (33 words before, +33 added) | 3.6s, heap 10 MB |
| ocr | sub-lincoln-p3-4.pdf<br><sub>ocr-lincoln-letter</sub> | PASS | 0 words, sample " "; warn: some text recognised (+0 words (OCR saw nothing: page renders blank, JPX scan)) | 1.6s, heap 10 MB |
| ocr | letter-to-benjamin-glover.pdf<br><sub>ocr-glover-handwritten</sub> | PASS | 449 words, sample "Tl , AR caiksie feATT \| \| i RE 0 ie \| \| Aili i pT " | 47.3s, heap 10 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>ocr-ndl-japanese-scan</sub> | PASS | 20 words, sample "¢- © - REN gE RTT ERY A TR a A RY A SN a IPS EVIDE" | 6.2s, heap 12 MB |
| ocr | oyo.pdf<br><sub>ocr-born-digital-invoice</sub> | PASS | 183 words, sample "OoYO PAYMENT RECEIPT Guest Name: Sanjay Date: 31/1"; warn: skips pages that already have text (105 words before, +105 added) | 3.4s, heap 10 MB |
| ocr | udhr-korean.pdf<br><sub>ocr-intl-korean</sub> | PASS | 376 words, sample "MA Ql MA ME DE QR FHM MEO EYE S551 FTE + gle HEE"; warn: skips pages that already have text (0 words before, +36 added) | 47.0s, heap 12 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-geometry</sub> | PASS | upright 45/46 median 1.7pt; turned 45/46 median 1.6pt; rot90crop 46/47 median 1.5pt; skew 41/43 median 1.8pt | 83.5s, heap 13 MB |
| ocr | udhr-chinese-simplified.pdf<br><sub>g2-ocr-scan-chinese</sub> | PASS | 451 words, 0 without a font, coverage 0.92, "世界 人 权 宣 告 联合 国 大 会 一 九 四 八 年 十 二 月 十 日" | 11.6s, heap 11 MB |
| ocr | udhr-japanese.pdf<br><sub>g2-ocr-scan-japanese</sub> | PASS | 399 words, 0 without a font, coverage 0.96, "『 世 界 人 権 宣言 』 ( 1948.12.10 第 3 回 国連 総会" | 16.6s, heap 17 MB |
| ocr | udhr-korean.pdf<br><sub>g2-ocr-scan-korean</sub> | PASS | 460 words, 0 without a font, coverage 0.99, "세계인권선언 전 문 모든 인류 구성원의 천부의 존엄성과 동등하고 양도" | 21.0s, heap 16 MB |
| ocr | udhr-arabic.pdf<br><sub>g2-ocr-scan-arabic</sub> | PASS | 290 words, 1 without a font, coverage 1.00, "UDHR - Arabic, Standard https://unicode." | 26.8s, heap 16 MB |
| ocr | udhr-hindi.pdf<br><sub>g2-ocr-scan-hindi</sub> | PASS | 547 words, 8 without a font, coverage undefined, "ह्ड - प़ंएतां मानव अधिकारों की सार्वमौम " | 33.2s, heap 18 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-scan-mixed-eng-deu</sub> | PASS | 724 words, 0 without a font, coverage 0.97, ". . . . . . Trace-based Just-in-Time Typ" | 34.9s, heap 16 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-fax-force</sub> | PASS | 397 words on 2 pages (0 skipped), turned 0, "10/25/2008 15:38 FAX 202 225 1992 Congre" | 21.3s, heap 15 MB |
| ocr | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-ocr-lincoln-36p</sub> | PASS | 80 words on 24 pages (12 skipped), turned 0, " TEL ey +o '] i ¥ 7, x - 3 - a, )" | 81.5s, heap 16 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-konoye-jpn</sub> | PASS | 21 words on 1 pages (0 skipped), turned 0, "ii \| TPS EVIDENTIARY DOCUMENT wo ンズ の 村 " | 21.4s, heap 15 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-ndl-japanese-handwritten</sub> | PASS | 21 words, 2 CJK characters; warn: Japanese characters recognised (2 CJK characters) | 20.9s, heap 15 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>g2-ocr-skip-text-pages</sub> | PASS | read 1, skipped 2 | 2.6s, heap 15 MB |
| ocr | oyo.pdf<br><sub>g2-ocr-force-text-pages</sub> | PASS | 183 words | 9.7s, heap 16 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-cancel</sub> | PASS | stopped at 3004 ms during "Page 1 of 2, recognizing", next run 334 words | 17.0s, heap 15 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>pdf2word-tracemonkey-2col</sub> | PASS | coverage 0.94, 11 tables, 88 images; warn: column lines stay in reading order (30 of 43 line joins kept) | 5.0s, heap 20 MB |
| pdf2word | arxiv-1810.04805-bert.pdf<br><sub>pdf2word-bert-2col</sub> | PASS | coverage 0.86, 14 tables, 38 images; warn: column lines stay in reading order (35 of 59 line joins kept) | 2.4s, heap 55 MB |
| pdf2word | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>pdf2word-fdic</sub> | PASS | coverage 0.98, 60 tables, 43 images | 2.8s, heap 76 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice</sub> | PASS | coverage 1.00, 3 tables, 1 images | 0.3s, heap 28 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice-exact</sub> | PASS | coverage 1.00, 0 tables, 1 images | 0.2s, heap 34 MB |
| pdf2word | flipkart-invoice.pdf<br><sub>pdf2word-flipkart</sub> | PASS | coverage 1.00, 1 tables, 6 images | 0.2s, heap 39 MB |
| pdf2word | udhr-arabic.pdf<br><sub>pdf2word-arabic</sub> | PASS | coverage 1.00, 0 tables, 0 images | 0.3s, heap 43 MB |
| pdf2word | udhr-chinese-simplified.pdf<br><sub>pdf2word-chinese</sub> | PASS | coverage 1.00, 0 tables, 0 images | 0.4s, heap 34 MB |
| pdf2word | fax-jean-schmidt-doe.pdf<br><sub>pdf2word-scanned-fax</sub> | PASS |  | 0.4s, heap 50 MB |
| pdf2word | 911-commission-report.pdf<br><sub>pdf2word-911-large</sub> | PASS | coverage 0.97, 16 tables, 34 images | 11.0s, heap 158 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>h-word-tracemonkey-columns</sub> | PASS | 108/109 joins, 2 broken hyphens, 11 tables, 2641 ms | 2.9s, heap 201 MB |
| pdf2word | arxiv-1810.04805-bert.pdf<br><sub>h-word-bert-columns</sub> | PASS | 127/135 joins, 3 broken hyphens, 14 tables, 1887 ms | 2.1s, heap 235 MB |
| pdf2word | arxiv-1706.03762-attention.pdf<br><sub>h-word-attention-columns</sub> | PASS | 48/50 joins, 4 broken hyphens, 9 tables, 1563 ms | 1.9s, heap 222 MB |
| pdf2word | arxiv-1512.03385-resnet.pdf<br><sub>h-word-resnet-columns</sub> | PASS | 110/110 joins, 4 broken hyphens, 24 tables, 774 ms | 0.9s, heap 216 MB |
| pdf2word | aws-invoice.pdf<br><sub>h-word-aws-tables</sub> | PASS | 3 tables, 22 rows, 115 ms | 0.2s, heap 211 MB |
| pdf2word | saeco.pdf<br><sub>h-word-saeco-tables</sub> | PASS | 3 tables, 11 rows, 92 ms | 0.2s, heap 216 MB |
| pdf2word | camelot-bol.pdf<br><sub>h-word-camelot-tables</sub> | PASS | 5 tables, 11 rows, 48 ms | 0.1s, heap 221 MB |
| pdf2word | netpresse-invoice.pdf<br><sub>h-word-netpresse-tables</sub> | PASS | 2 tables, 7 rows, 284 ms | 0.4s, heap 224 MB |
| pdf2word | pdfjs-ArabicCIDTrueType.pdf<br><sub>h-word-arabic-cid-logical</sub> | PASS | 4/4 RTL lines in reading order | 0.2s, heap 227 MB |
| pdf2word | udhr-arabic.pdf<br><sub>h-word-udhr-arabic-logical</sub> | PASS | 278/281 three-word runs in order | 0.3s, heap 228 MB |
| pdf2word | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-word-fdic-speed-furniture</sub> | PASS | 3.1 s, 60 tables, coverage 1.00 | 3.2s, heap 238 MB |
| pdf2word | sub-ndl-konoye-p1.pdf<br><sub>h-word-jpeg-scan-ndl</sub> | PASS | 1 OCR pages, 0 images, 13 words, 3.5 s | 3.6s, heap 267 MB |
| pdf2word | letter-to-benjamin-glover.pdf<br><sub>h-word-jpeg-scan-glover</sub> | PASS | 2 OCR pages, 0 images, 24 words, 49.3 s | 49.4s, heap 268 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 73 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 1.1s, heap 9 MB |
| pdf2excel | flipkart-invoice.pdf<br><sub>pdf2excel-flipkart</sub> | PASS | 1 sheets, 36 cells, coverage 1.00 | 0.2s, heap 11 MB |
| pdf2excel | camelot-bol.pdf<br><sub>pdf2excel-camelot-bol</sub> | PASS | 1 sheets, 64 cells, coverage 1.00 | 0.1s, heap 13 MB |
| pdf2excel | saeco.pdf<br><sub>pdf2excel-saeco</sub> | PASS | 1 sheets, 53 cells, coverage 1.00 | 0.1s, heap 12 MB |
| pdf2excel | free-fiber.pdf<br><sub>pdf2excel-free-fiber</sub> | PASS | 2 sheets, 22 cells, coverage 1.00 | 0.1s, heap 13 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>pdf2excel-fdic</sub> | PASS | 44 sheets, 5302 cells, coverage 0.99 | 1.3s, heap 26 MB |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | PASS | 1 sheets, 22 numbers, 0 numeric text, 0.1 s | 0.2s, heap 23 MB |
| pdf2excel | camelot-bol.pdf<br><sub>h-excel-camelot-eu-typed</sub> | PASS | 1 sheets, 18 numbers, 0 numeric text, 0.0 s | 0.1s, heap 26 MB |
| pdf2excel | netpresse-invoice.pdf<br><sub>h-excel-netpresse-eu-typed</sub> | PASS | 1 sheets, 10 numbers, 0 numeric text, 0.4 s | 0.6s, heap 28 MB |
| pdf2excel | saeco.pdf<br><sub>h-excel-saeco-dates</sub> | PASS | 1 sheets, 14 numbers, 0 numeric text, 0.1 s | 0.2s, heap 13 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-speed-typed</sub> | PASS | 44 sheets, 2860 numbers, 2 numeric text, 2.2 s | 2.5s, heap 48 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-joined</sub> | PASS | 1 sheets, 2680 numbers, 2 numeric text, 2.3 s | 2.5s, heap 49 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>pdf2ppt-tracemonkey</sub> | PASS | 14 slides, 99 images, 2.0 MB | 5.7s, heap 19 MB |
| pdf2ppt | pdfjs-rotation.pdf<br><sub>pdf2ppt-rotation-mixed</sub> | PASS | 2 slides, 1 images, 50 KB; warn: mixed page shapes each fit their slide (2 page aspects, one slide size) | 0.1s, heap 11 MB |
| pdf2ppt | rot90-cropbox-bert.pdf<br><sub>pdf2ppt-rot90-cropbox</sub> | PASS | 16 slides, 50 images, 2.2 MB | 3.9s, heap 26 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>h-ppt-tracemonkey-editable</sub> | PASS | 14 slides, 83231 chars, 99 media, 2.0 MB, 4.1 s | 4.3s, heap 32 MB |
| pdf2ppt | pdfjs-rotation.pdf<br><sub>h-ppt-rotation-mixed-editable</sub> | PASS | 2 slides, 152 chars, 1 media, 50 KB, 0.0 s | 0.1s, heap 30 MB |
| pdf2ppt | aws-invoice.pdf<br><sub>h-ppt-aws-editable</sub> | PASS | 1 slides, 1853 chars, 3 media, 152 KB, 0.3 s | 0.4s, heap 30 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 85800 chars, 14 headings, 11 tables | 2.9s, heap 12 MB |
| pdf2md | us-budget-2024.pdf<br><sub>pdf2md-budget</sub> | PASS | 596818 chars, 29 headings, 125 tables | 5.4s, heap 32 MB |
| pdf2md | aws-invoice.pdf<br><sub>pdf2md-aws-invoice</sub> | PASS | 2076 chars, 5 headings, 3 tables | 0.2s, heap 34 MB |
| pdf2md | udhr-chinese-simplified.pdf<br><sub>pdf2md-chinese</sub> | PASS | 5895 chars, 0 headings, 0 tables | 0.3s, heap 35 MB |
| pdf2md | udhr-japanese.pdf<br><sub>pdf2md-japanese</sub> | PASS | 4587 chars, 0 headings, 0 tables | 0.3s, heap 44 MB |
| pdf2md | pdfjs-noembed-sjis.pdf<br><sub>pdf2md-noembed-sjis</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.2s, heap 47 MB |
| pdf2md | pdfjs-noembed-eucjp.pdf<br><sub>pdf2md-noembed-eucjp</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.1s, heap 47 MB |
| pdf2md | pdfjs-vertical.pdf<br><sub>pdf2md-vertical</sub> | PASS | 20 chars, 0 headings, 0 tables | 0.1s, heap 47 MB |
| pdf2md | udhr-arabic.pdf<br><sub>pdf2md-arabic</sub> | PASS | 8269 chars, 0 headings, 0 tables | 0.4s, heap 47 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | PASS | 85800 chars, 11 tables, 14 headings | 2.6s, heap 34 MB |
| pdf2md | arxiv-1810.04805-bert.pdf<br><sub>h-md-bert-columns</sub> | PASS | 68234 chars, 14 tables, 17 headings | 1.8s, heap 21 MB |
| pdf2md | netpresse-invoice.pdf<br><sub>h-md-netpresse-tables</sub> | PASS | 1472 chars, 2 tables, 0 headings | 0.4s, heap 36 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 62 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.1s, heap 13 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | PASS | 2 pages, 8 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 0.8s, heap 12 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>excel2pdf-quick-poi-Tables.xlsx</sub> | PASS | 18 pages, 4.6 MB, text coverage 0.00; warn: selectable text (coverage 0.00) | 74.3s, heap 43 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>word2pdf-quick-poi-VariousPictures.docx</sub> | PASS | 1 pages, 295 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.9s, heap 15 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>excel2pdf-quick-poi-WithThreeCharts.xlsx</sub> | PASS | 1 pages, 31 KB, text coverage undefined | 1.8s, heap 15 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>ppt2pdf-quick-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 5 KB, text coverage undefined | 0.5s, heap 15 MB |
| word2pdf | poi-chartex.docx<br><sub>word2pdf-quick-poi-chartex.docx</sub> | PASS | 3 pages, 440 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 10.6s, heap 18 MB |
| excel2pdf | poi-picture.xlsx<br><sub>excel2pdf-quick-poi-picture.xlsx</sub> | PASS | 1 pages, 39 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.4s, heap 17 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>ppt2pdf-quick-poi-pie-chart.pptx</sub> | PASS | 1 pages, 3 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 0.3s, heap 17 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | PASS | 1 pages, 251 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.6s, heap 19 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>word2pdf-quick-poi-table_footnotes.docx</sub> | PASS | 1 pages, 33 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.7s, heap 17 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>ppt2pdf-quick-poi-table_test.pptx</sub> | PASS | 1 pages, 2 KB, text coverage undefined | 0.2s, heap 16 MB |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | PASS | 1 page(s), 8.5x5.7 in, 455 KB | 1.6s, heap 9 MB |
| img2pdf | heic-nokia-C001.heic<br><sub>img2pdf-heic-nokia-C001.heic</sub> | PASS | 1 page(s), 8.5x4.8 in, 219 KB | 0.4s, heap 12 MB |
| img2pdf | photo-24MP-punjab-smartphone.jpg<br><sub>img2pdf-photo-24MP-punjab-smartphone.jpg</sub> | PASS | 1 page(s), 40.1x26.7 in, 13.9 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (40.1 x 26.7 in) | 2.7s, heap 9 MB |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | PASS | 1 page(s), 23.0x17.5 in, 5.4 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) | 1.8s, heap 9 MB |
| img2pdf | photo-portrait-sepia-1640x2268.jpg<br><sub>img2pdf-photo-portrait-sepia-1640x2268.jpg</sub> | PASS | 1 page(s), 10.9x15.1 in, 1.5 MB, EXIF 1 | 0.4s, heap 9 MB |
| img2pdf | png-alpha-transparency-demo.png<br><sub>img2pdf-png-alpha-transparency-demo.png</sub> | PASS | 1 page(s), 6.6x5.0 in, 424 KB | 0.4s, heap 9 MB |
| img2pdf | png-webp-comparison-2412x1500.png<br><sub>img2pdf-png-webp-comparison-2412x1500.png</sub> | PASS | 1 page(s), 16.1x10.0 in, 4.3 MB | 3.0s, heap 10 MB |
| img2pdf | tiff-multipage-mmap.tiff<br><sub>img2pdf-tiff-multipage-mmap.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB | 0.2s, heap 9 MB |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) | 0.1s, heap 9 MB |
| img2pdf | webp-chandrayaan-rover.webp<br><sub>img2pdf-webp-chandrayaan-rover.webp</sub> | PASS | 1 page(s), 3.7x2.9 in, 59 KB | 0.1s, heap 10 MB |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | PASS | 1 page(s), 0.9x0.9 in, 8 KB | 0.1s, heap 10 MB |
| img2pdf | photo-24MP-punjab-smartphone.jpg + photo-castle-3456x2628.jpg + photo-portrait-sepia-1640x2268.jpg<br><sub>img2pdf-three-photos-a4</sub> | PASS |  | 4.0s, heap 9 MB |
| pdf2img | pdfjs-tracemonkey.pdf<br><sub>pdf2img-tracemonkey</sub> | PASS | ink 10.8%, 13.3% | 1.2s, heap 9 MB |
| pdf2img | rot90-cropbox-bert.pdf<br><sub>pdf2img-rot90-cropbox</sub> | PASS | ink 16.3% | 0.5s, heap 9 MB |
| pdf2img | pdfjs-bug_jpx.pdf<br><sub>pdf2img-jpx</sub> | PASS | ink 1.7% | 0.2s, heap 10 MB |
| pdf2img | pdfjs-jpx_subsampling.pdf<br><sub>pdf2img-jpx-subsampling</sub> | PASS | ink 19.9% | 0.2s, heap 8 MB |
| pdf2img | pdfjs-jpx_smaskindata.pdf<br><sub>pdf2img-jpx-smask</sub> | PASS | ink 100.0% | 0.2s, heap 9 MB |
| pdf2img | pdfjs-jbig2_symbol_offset.pdf<br><sub>pdf2img-jbig2-symbol</sub> | PASS | ink 1.0% | 0.2s, heap 9 MB |
| pdf2img | pdfjs-jbig2_file_header.pdf<br><sub>pdf2img-jbig2-header</sub> | PASS | ink 41.0% | 0.5s, heap 8 MB |
| pdf2img | pdfjs-cmykjpeg.pdf<br><sub>pdf2img-cmyk-jpeg</sub> | PASS | ink 6.1% | 0.4s, heap 10 MB |
| pdf2img | pdfjs-devicen.pdf<br><sub>pdf2img-devicen</sub> | PASS | ink 5.8% | 0.3s, heap 10 MB |
| pdf2img | pdfjs-simpletype3font.pdf<br><sub>pdf2img-type3</sub> | PASS | ink 0.1% | 0.2s, heap 10 MB |
| pdf2img | pdfjs-noembed-sjis.pdf<br><sub>pdf2img-noembed-sjis</sub> | PASS | ink 0.1% | 0.3s, heap 10 MB |
| pdf2img | pdfjs-vertical.pdf<br><sub>pdf2img-vertical-cjk</sub> | PASS | ink 0.2% | 0.2s, heap 10 MB |
| pdf2img | udhr-hindi.pdf<br><sub>pdf2img-hindi</sub> | PASS | ink 10.2% | 0.7s, heap 10 MB |
| pdf2img | crooked-paths-1648-104MB.pdf<br><sub>pdf2img-crooked-104MB</sub> | PASS | ink 68.5%, 43.4%, 75.6% | 14.1s, heap 10 MB |
| pdf2img | explorations-bible-lands-956pp-62MB.pdf<br><sub>pdf2img-bible-62MB</sub> | PASS | ink 100.0%, 100.0% | 5.2s, heap 10 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.9x size; warn: size stays reasonable (<= 3x) (5.9x input) | 4.8s, heap 12 MB |
| redact | aws-invoice.pdf<br><sub>redact-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 1.9s, heap 14 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.8x size; warn: size stays reasonable (<= 3x) (10.8x input) | 7.0s, heap 29 MB |
| redact | pdfjs-rotation.pdf<br><sub>redact-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 4.4x size; warn: size stays reasonable (<= 3x) (4.4x input) | 0.7s, heap 12 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>redact-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 1.6s, heap 13 MB |
| redact | uk-IPPH353.pdf<br><sub>redact-find-split-uk-IPPH353</sub> | PASS |  | 0.3s, heap 11 MB |
| redact | uk-AFPS-Form-17.pdf<br><sub>redact-find-split-uk-AFPS-Form-17</sub> | PASS |  | 0.2s, heap 12 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.94x size, 604 ms | 1.9s, heap 31 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.00x size, 1155 ms | 2.3s, heap 30 MB |
| redact | pdfjs-rotation.pdf<br><sub>g3-redact-remove-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 0.83x size, 10 ms | 0.3s, heap 13 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 72 ms | 0.7s, heap 14 MB |
| redact | c-rot270-cropbox.pdf<br><sub>g3-redact-remove-rot270-cropbox</sub> | PASS | 16 boxes on 2 page(s), 0.99x size, 243 ms | 1.1s, heap 23 MB |
| redact | c-rot180-origin.pdf<br><sub>g3-redact-remove-rot180-origin</sub> | PASS | 16 boxes on 2 page(s), 0.99x size, 112 ms | 0.5s, heap 14 MB |
| redact | aws-invoice.pdf<br><sub>g3-redact-remove-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 0.96x size, 73 ms | 0.5s, heap 14 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-image-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.77x size, 4088 ms | 8.3s, heap 50 MB |
| redact | flipkart-invoice.pdf<br><sub>g3-redact-remove-flipkart</sub> | PASS | 6 boxes on 1 page(s), 1.01x size, 36 ms | 0.6s, heap 13 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-image-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.93x size, 3112 ms | 6.8s, heap 41 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | PASS |  | 0.1s, heap 12 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | PASS |  | 0.5s, heap 13 MB |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | PASS |  | 0.3s, heap 13 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-remove</sub> | PASS | review #1, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-image</sub> | PASS | review #1, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-remove</sub> | PASS | review #2, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-image</sub> | PASS | review #2, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-image</sub> | PASS | review #3, raster pages 1 | 0.4s, heap 12 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-image</sub> | PASS | review #3, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-remove</sub> | PASS | review #4, raster pages none | 0.3s, heap 12 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-image</sub> | PASS | review #4, raster pages 1 | 0.7s, heap 12 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-remove</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-image</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-remove</sub> | PASS | review #6, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-image</sub> | PASS | review #6, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-remove</sub> | PASS | review #7, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-image</sub> | PASS | review #7, raster pages 1 | 0.4s, heap 12 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-remove</sub> | PASS | review #8, raster pages none | 0.2s, heap 12 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-image</sub> | PASS | review #8, raster pages 1 | 0.4s, heap 12 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-remove</sub> | PASS | review #r2-2, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-image</sub> | PASS | review #r2-2, raster pages 1 | 0.3s, heap 12 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-image</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-image</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-remove</sub> | PASS | review #r2-3, raster pages none | 0.2s, heap 12 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-image</sub> | PASS | review #r2-3, raster pages 1 | 0.5s, heap 13 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-remove</sub> | PASS | review #r2-6, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-image</sub> | PASS | review #r2-6, raster pages 1 | 0.9s, heap 12 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-remove</sub> | PASS |  | 0.4s, heap 12 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-image</sub> | PASS |  | 1.1s, heap 13 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-actualtext-us-budget</sub> | PASS |  | 4.6s, heap 98 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 165 ms | 0.8s, heap 13 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.2s, heap 24 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-regex-budget-phones</sub> | PASS | 6 boxes, (202) 512-1530, (888) 293-6498, (202) 512-1800 | 5.5s, heap 87 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.5s, heap 12 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 1.0s, heap 12 MB |
| forms | irs-f1040.pdf<br><sub>forms-list-irs-f1040</sub> | PASS | 199 fields (199 widgets) in 142 ms, pdf.js 199, has XFA | 0.7s, heap 9 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 31 ms, pdf.js 23, has XFA | 0.1s, heap 11 MB |
| forms | irs-fw4.pdf<br><sub>forms-list-irs-fw4</sub> | PASS | 48 fields (48 widgets) in 181 ms, pdf.js 48, has XFA | 0.3s, heap 12 MB |
| forms | irs-f1040sa.pdf<br><sub>forms-list-irs-f1040sa</sub> | PASS | 33 fields (33 widgets) in 9 ms, pdf.js 33, has XFA | 0.1s, heap 14 MB |
| forms | uscis-i-9.pdf<br><sub>forms-list-uscis-i-9</sub> | PASS | 128 fields (130 widgets) in 79 ms, pdf.js 128 | 0.2s, heap 16 MB |
| forms | uscis-i-485.pdf<br><sub>forms-list-uscis-i-485</sub> | PASS | 730 fields (730 widgets) in 1960 ms, pdf.js 730, has XFA | 2.1s, heap 24 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-list-uk-IPPH353</sub> | PASS | 92 fields (92 widgets) in 327 ms, pdf.js 92 | 0.4s, heap 27 MB |
| forms | uk-AFPS-Form-17.pdf<br><sub>forms-list-uk-AFPS-Form-17</sub> | PASS | 24 fields (24 widgets) in 47 ms, pdf.js 24 | 0.1s, heap 38 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-list-xfa-imm1344e-filled</sub> | PASS | 1 fields (1 widgets) in 8 ms, pdf.js 1, has XFA | 0.1s, heap 11 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 1 ms, pdf.js 0, has XFA | 0.1s, heap 13 MB |
| forms | annotation-button-widget.pdf<br><sub>forms-list-annotation-button-widget</sub> | PASS | 6 fields (9 widgets) in 6 ms, pdf.js 6, has XFA | 0.1s, heap 13 MB |
| forms | annotation-choice-widget.pdf<br><sub>forms-list-annotation-choice-widget</sub> | PASS | 5 fields (5 widgets) in 5 ms, pdf.js 5, has XFA | 0.1s, heap 14 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-list-annotation-text-widget</sub> | PASS | 7 fields (7 widgets) in 4 ms, pdf.js 7, has XFA | 0.1s, heap 14 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 1.8s, heap 21 MB |
| forms | irs-fw9.pdf<br><sub>forms-fill-fw9</sub> | PASS | 3 filled | 0.4s, heap 21 MB |
| forms | uscis-i-9.pdf<br><sub>forms-fill-i9</sub> | PASS | 3 filled | 1.1s, heap 36 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-fill-xfa-imm1344e</sub> | PASS |  | 0.1s, heap 36 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 1.3s, heap 51 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-fill-flatten-ipph353</sub> | PASS | 3 filled, flattened | 1.6s, heap 34 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-fill-flatten-text-widget</sub> | PASS | 3 filled, flattened | 0.1s, heap 14 MB |
| forms | uscis-i-485.pdf<br><sub>forms-flatten-i485</sub> | PASS | 730 fields flattened | 3.7s, heap 29 MB |
| forms | c-fw9-rot90.pdf<br><sub>c-forms-add-fw9-rot90</sub> | PASS |  | 0.5s, heap 28 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>c-forms-add-xfa-origin</sub> | PASS |  | 0.1s, heap 31 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-add-fw9</sub> | PASS |  | 0.2s, heap 34 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh</sub> | PASS |  | 0.8s, heap 27 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh-flat</sub> | PASS |  | 0.5s, heap 43 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar</sub> | PASS |  | 0.8s, heap 38 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar-flat</sub> | PASS |  | 0.4s, heap 17 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi</sub> | PASS |  | 0.7s, heap 35 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi-flat</sub> | PASS |  | 0.4s, heap 34 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja</sub> | PASS |  | 0.6s, heap 39 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja-flat</sub> | PASS |  | 0.4s, heap 34 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru</sub> | PASS |  | 0.7s, heap 51 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru-flat</sub> | PASS |  | 0.4s, heap 48 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-inspect-irs-fw9</sub> | PASS | 23 fields, 23 widgets, 65 ms | 0.1s, heap 47 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 1 ms | 0.1s, heap 50 MB |
| forms | uscis-i-9.pdf<br><sub>g3-forms-inspect-uscis-i-9</sub> | PASS | 128 fields, 130 widgets, 150 ms | 0.2s, heap 50 MB |
| forms | uscis-i-485.pdf<br><sub>g3-forms-inspect-uscis-i-485</sub> | PASS | 730 fields, 730 widgets, 2454 ms | 2.5s, heap 48 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 0.3s, heap 48 MB |
| forms | irs-f1040.pdf<br><sub>g3-forms-fill-xfa-irs-f1040-flat</sub> | PASS |  | 0.9s, heap 36 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 1.0s, heap 9 MB |
| compare | pdfjs-tracemonkey.pdf + pdfjs-tracemonkey_with_annotations.pdf<br><sub>compare-with-annotations</sub> | PASS | +0 -0, changed pages none | 0.4s, heap 11 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | PASS | +1213 -0, changed pages 3 | 0.3s, heap 20 MB |
| compare | 911-commission-report.pdf + 911-commission-report.pdf<br><sub>compare-911-self</sub> | PASS | +0 -0, changed pages none | 8.6s, heap 94 MB |
| compare | us-economic-report-president-2024.pdf + us-economic-report-president-2024.pdf<br><sub>compare-dense-econ-self</sub> | PASS | +0 -0, changed pages none | 13.2s, heap 236 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>g2-compare-inserted-overlay</sub> | PASS | 301 ms, +1213 -0, changed 3, overlay max 0.00% | 1.6s, heap 95 MB |
| compare | pdfjs-TAMReview.pdf + pdfjs-TAMReview.pdf<br><sub>g2-compare-tamreview-self</sub> | PASS | 467 ms, +0 -0, changed none, overlay max 0.00% | 4.4s, heap 96 MB |
| compare | aws-invoice.pdf + origin-shift-aws-invoice.pdf<br><sub>g2-compare-origin-shift</sub> | PASS | 90 ms, +0 -0, changed none, overlay max 0.00% | 0.3s, heap 10 MB |
| compare | pdfjs-tracemonkey.pdf<br><sub>g2-compare-removed-page</sub> | PASS | 591 ms, -1260 words, changed pairs 4 | 1.1s, heap 13 MB |
| compare | us-economic-report-president-2024.pdf<br><sub>g2-compare-dense-removed-page</sub> | PASS | 15438 ms, -251 words, changed pairs 10 | 18.2s, heap 145 MB |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | PASS | 1 pages, 230 KB; warn: selectable text (coverage 0.00) | 1.5s, heap 9 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-styled-report</sub> | PASS | 1 page(s), 152 KB, 381 ms | 0.6s, heap 10 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-long-page</sub> | PASS | 22 pages, 3.9 MB, 45721 ms | 46.9s, heap 49 MB |
| health | -<br><sub>health-selftest</sub> | PASS | 49 checks, 0 failed; warn: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) | 14.3s, heap 20 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-share-pdfjs-tracemonkey</sub> | PASS | run 985 ms; Sanitize nochange, Flatten nochange, Remove annotations nochange, Metadata 339ms, Compress 352ms | 1.8s, heap 12 MB |
| automate | aws-invoice.pdf<br><sub>s3-share-aws-invoice</sub> | PASS | run 28 ms; Sanitize nochange, Flatten nochange, Remove annotations nochange, Metadata 9ms, Compress nochange | 0.1s, heap 13 MB |
| automate | irs-fw9.pdf<br><sub>s3-share-irs-fw9</sub> | PASS | run 419 ms; Sanitize 85ms, Flatten 173ms, Remove annotations nochange, Metadata 83ms, Compress nochange | 0.6s, heap 11 MB |
| automate | pdfjs-tracemonkey_with_annotations.pdf<br><sub>s3-share-pdfjs-tracemonkey-with-a</sub> | PASS | run 551 ms; Sanitize nochange, Flatten nochange, Remove annotations 33ms, Metadata 190ms, Compress 275ms | 0.9s, heap 12 MB |
| automate | arxiv-1706.03762-attention.pdf<br><sub>s3-share-arxiv-1706-03762-attenti</sub> | PASS | run 3274 ms; Sanitize nochange, Flatten nochange, Remove annotations nochange, Metadata 1534ms, Compress nochange | 4.4s, heap 26 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-mail-pdfjs-tracemonkey</sub> | PASS | run 1068 ms; Compress 397ms, Protect 671ms | 1.4s, heap 26 MB |
| automate | aws-invoice.pdf<br><sub>s3-mail-aws-invoice</sub> | PASS | run 479 ms; Compress 8ms, Protect 471ms | 0.6s, heap 12 MB |
| automate | irs-fw9.pdf<br><sub>s3-mail-irs-fw9</sub> | PASS | run 516 ms; Compress nochange, Protect 464ms | 0.6s, heap 12 MB |
| automate | fax-jean-schmidt-doe.pdf<br><sub>s3-scan-fax-jean-schmidt-doe</sub> | PASS | run 1499 ms; Auto rotate nochange, OCR skipped, Compress 7ms | 1.6s, heap 15 MB |
| automate | sub-ndl-konoye-p1.pdf<br><sub>s3-scan-sub-ndl-konoye-p1</sub> | PASS | run 8776 ms; Auto rotate nochange, OCR 6501ms, Compress 7ms | 8.9s, heap 11 MB |
| automate | lincoln-ellsworth-letter-1861.pdf<br><sub>s3-scan-lincoln-ellsworth-letter</sub> | PASS | run 50064 ms; Auto rotate nochange, OCR 34231ms, Compress nochange | 50.2s, heap 13 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-draft-pdfjs-tracemonkey</sub> | PASS | run 898 ms; Page numbers 377ms, Watermark 511ms | 1.4s, heap 14 MB |
| automate | aws-invoice.pdf<br><sub>s3-draft-aws-invoice</sub> | PASS | run 33 ms; Page numbers 18ms, Watermark 13ms | 0.1s, heap 14 MB |
| automate | irs-fw9.pdf<br><sub>s3-draft-irs-fw9</sub> | PASS | run 224 ms; Page numbers 93ms, Watermark 127ms | 0.4s, heap 14 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-archive-pdfjs-tracemonkey</sub> | PASS | run 188 ms; Repair 49ms, Fast web view 135ms | 0.5s, heap 15 MB |
| automate | aws-invoice.pdf<br><sub>s3-archive-aws-invoice</sub> | PASS | run 18 ms; Repair 5ms, Fast web view 12ms | 0.1s, heap 17 MB |
| automate | irs-fw9.pdf<br><sub>s3-archive-irs-fw9</sub> | PASS | run 228 ms; Repair 93ms, Fast web view 132ms | 0.4s, heap 18 MB |
| automate | pdfjs-tracemonkey.pdf + aws-invoice.pdf + irs-fw9.pdf<br><sub>s3-batch-draft-3</sub> | PASS | batch run 993 ms for 3 files | 1.5s, heap 22 MB |
| automate | pdfjs-tracemonkey.pdf + xfa-imm1344e-filled.pdf + aws-invoice.pdf<br><sub>s3-batch-share-one-fails</sub> | PASS | batch run 1179 ms; failed: This is a dynamic XFA form: the form exists only as XFA, and this change would l | 1.8s, heap 23 MB |
| automate | lincoln-ellsworth-letter-1861.pdf<br><sub>s3-cancel-scan</sub> | PASS |  | 4.1s, heap 24 MB |
| automate | lincoln-ellsworth-letter-1861.pdf<br><sub>s3-cancel-in-ocr</sub> | PASS | stopped 0 ms after Cancel inside OCR | 37.3s, heap 14 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-0</sub> | PASS | 1447 ms, turned 0 of 2, osd 0/4.9 0/5.5 | 2.2s, heap 10 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-90</sub> | PASS | 1082 ms, turned 2 of 2, osd 270/0.4 270/2.2 | 1.2s, heap 10 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-180</sub> | PASS | 2053 ms, turned 2 of 2, osd 180/3.4 180/5.3 | 2.2s, heap 11 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-270</sub> | PASS | 2054 ms, turned 2 of 2, osd 90/0.3 90/2.3 | 2.2s, heap 9 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-0</sub> | PASS | 32545 ms, turned 0 of 36, osd 0/0.0 180/0.1 180/0.6 0/0.0 0/0.0 0/4.3 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/20.4 0/30.3 0/0.0 0/0.0 180/1.0 180/0.8 0/0.0 0/0.0 0/0.0 0/0.0 0/9.6 0/1.3 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/0.5 0/0.0 180/0.2 | 32.9s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-90</sub> | PASS | 20869 ms, turned 36 of 36, osd 0/0.0 90/0.1 0/0.0 0/0.0 0/0.0 270/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/21.2 270/27.6 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/6.5 270/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/1.0 0/0.4 180/0.9 | 21.2s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-180</sub> | PASS | 33275 ms, turned 36 of 36, osd 0/0.0 0/0.0 0/0.7 0/0.0 0/0.0 180/3.5 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/18.5 180/30.7 0/0.0 0/0.0 0/1.0 0/0.6 0/0.0 0/0.0 0/0.0 0/0.0 180/8.4 180/1.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.5 0/0.0 0/0.4 | 33.5s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-270</sub> | PASS | 40191 ms, turned 36 of 36, osd 0/0.0 180/0.1 0/0.0 0/0.0 0/0.0 90/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 90/22.3 90/28.7 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 90/7.0 90/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/1.0 270/0.3 0/0.6 | 40.5s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-0</sub> | PASS | 4260 ms, turned 0 of 1, osd 0/0.4 | 4.6s, heap 11 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-90</sub> | PASS | 3755 ms, turned 0 of 1, osd 270/1.2; warn: every page back upright (not detected: p1) | 4.0s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-180</sub> | PASS | 3106 ms, turned 0 of 1, osd 180/0.4; warn: every page back upright (not detected: p1) | 3.3s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-270</sub> | PASS | 3734 ms, turned 0 of 1, osd 90/1.1; warn: every page back upright (not detected: p1) | 3.9s, heap 10 MB |
| nup | pdfjs-tracemonkey.pdf<br><sub>u5a-nup4-tracemonkey</sub> | PASS | 14 pages on 4 sheets, 2x2, 1.0 MB | 1.2s, heap 9 MB |
| nup | aws-invoice.pdf<br><sub>u5a-nup2-aws-invoice</sub> | PASS | 1 pages on 1 sheets, 2x1, 0.1 MB | 0.1s, heap 19 MB |
| nup | arxiv-1706.03762-attention.pdf<br><sub>u5a-nup6-cols-rtl-attention</sub> | PASS | 15 pages on 3 sheets, 3x2, 1.8 MB | 6.3s, heap 43 MB |
| nup | rot90-cropbox-bert.pdf<br><sub>u5a-nup9-a4-rot90-cropbox</sub> | PASS | 16 pages on 2 sheets, 3x3, 0.7 MB | 0.7s, heap 36 MB |
| nup | c-rot270-cropbox.pdf<br><sub>u5a-nup4-rot270-cropbox</sub> | PASS | 2 pages on 1 sheets, 2x2, 0.2 MB | 0.1s, heap 34 MB |
| nup | origin-shift-aws-invoice.pdf<br><sub>u5a-nup2-origin-shift</sub> | PASS | 1 pages on 1 sheets, 2x1, 0.1 MB | 0.1s, heap 38 MB |
| nup | c-mixed.pdf<br><sub>u5a-nup3x2-custom-mixed</sub> | PASS | 5 pages on 1 sheets, 3x2, 0.5 MB | 0.2s, heap 39 MB |
| nup | arxiv-2307.09288-llama2.pdf<br><sub>u5a-nup16-llama2</sub> | PASS | 77 pages on 5 sheets, 4x4, 13.2 MB | 6.8s, heap 45 MB |
| nup | arxiv-1706.03762-attention.pdf<br><sub>u5a-nup2-raw-attention</sub> | PASS | 15 pages on 8 sheets, 2x1, 1.8 MB | 4.9s, heap 42 MB |
| nup | irs-fw9.pdf<br><sub>u5a-nup2-filled-fw9</sub> | PASS | 6 pages on 3 sheets, 2x1, 0.1 MB | 0.8s, heap 34 MB |
| nup | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5a-nup4-comments-tracemonkey</sub> | PASS | 14 pages on 4 sheets, 2x2, 1.0 MB | 1.5s, heap 49 MB |
| booklet | pdfjs-tracemonkey.pdf<br><sub>u5a-booklet-tracemonkey</sub> | PASS | 14 pages on 4 sheets, first sides -\|1 / 2\|- | 1.2s, heap 9 MB |
| booklet | aws-invoice.pdf<br><sub>u5a-booklet-aws-invoice</sub> | PASS | 1 pages on 1 sheets, first sides -\|1 / -\|- | 0.2s, heap 19 MB |
| booklet | arxiv-1706.03762-attention.pdf<br><sub>u5a-booklet-attention-spine-right-gutter</sub> | PASS | 15 pages on 4 sheets, first sides 1\|- / 15\|2 | 7.3s, heap 43 MB |
| booklet | c-mixed.pdf<br><sub>u5a-booklet-mixed-fronts</sub> | PASS | 5 pages on 2 sheets, first sides -\|1 / -\|3 | 0.2s, heap 36 MB |
| booklet | rot90-cropbox-bert.pdf<br><sub>u5a-booklet-long-edge-rot90-a4</sub> | PASS | 16 pages on 4 sheets, first sides 16\|1 / 2\|15 | 0.9s, heap 42 MB |
| booklet | arxiv-2307.09288-llama2.pdf<br><sub>u5a-booklet-llama2</sub> | PASS | 77 pages on 20 sheets, first sides -\|1 / 2\|- | 7.5s, heap 32 MB |
| booklet | arxiv-1706.03762-attention.pdf<br><sub>u5a-booklet-raw-attention</sub> | PASS | 15 pages on 4 sheets, first sides -\|1 / 2\|15 | 5.1s, heap 44 MB |
| booklet | irs-fw9.pdf<br><sub>u5a-booklet-filled-fw9</sub> | PASS | 6 pages on 2 sheets, first sides -\|1 / 2\|- | 0.8s, heap 36 MB |
| scale | pdfjs-tracemonkey.pdf<br><sub>u5a-scale-a4-fit-tracemonkey</sub> | PASS | 14 pages, first 595x842 pt | 1.4s, heap 9 MB |
| scale | aws-invoice.pdf<br><sub>u5a-scale-half-aws-invoice</sub> | PASS | 1 pages, first 306x396 pt | 0.1s, heap 16 MB |
| scale | arxiv-1706.03762-attention.pdf<br><sub>u5a-scale-a3-attention</sub> | PASS | 15 pages, first 842x1191 pt | 5.9s, heap 38 MB |
| scale | c-rot270-cropbox.pdf<br><sub>u5a-scale-letter-landscape-rot270</sub> | PASS | 2 pages, first 792x612 pt | 0.1s, heap 27 MB |
| scale | rot90-cropbox-bert.pdf<br><sub>u5a-scale-a4-rot90-cropbox</sub> | PASS | 16 pages, first 842x595 pt | 0.5s, heap 31 MB |
| scale | origin-shift-aws-invoice.pdf<br><sub>u5a-scale-a5-origin-shift</sub> | PASS | 1 pages, first 420x595 pt | 0.1s, heap 23 MB |
| scale | c-mixed.pdf<br><sub>u5a-scale-150pc-mixed</sub> | PASS | 5 pages, first 918x1188 pt | 0.2s, heap 24 MB |
| scale | arxiv-1706.03762-attention.pdf<br><sub>u5a-scale-half-raw-attention</sub> | PASS | 15 pages, first 306x396 pt | 3.9s, heap 41 MB |
| scale | irs-fw9.pdf<br><sub>u5a-scale-a4-filled-fw9</sub> | PASS | 6 pages, first 595x842 pt | 0.5s, heap 31 MB |
| scale | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5a-scale-a4-comments-tracemonkey</sub> | PASS | 14 pages, first 595x842 pt | 0.7s, heap 23 MB |
| singlepage | pdfjs-tracemonkey.pdf<br><sub>u5a-single-tracemonkey</sub> | PASS | 14 pages, 612 x 11088 pt | 1.2s, heap 9 MB |
| singlepage | aws-invoice.pdf<br><sub>u5a-single-aws-invoice</sub> | PASS | 1 pages, 612 x 792 pt | 0.1s, heap 18 MB |
| singlepage | arxiv-1706.03762-attention.pdf<br><sub>u5a-single-attention</sub> | PASS | 15 pages, 612 x 11880 pt | 6.8s, heap 40 MB |
| singlepage | c-mixed.pdf<br><sub>u5a-single-mixed</sub> | PASS | 5 pages, 792 x 2902 pt | 0.3s, heap 36 MB |
| singlepage | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-single-lincoln-scan-scaled</sub> | PASS | 36 pages, 330 x 14399 pt, scaled 79% | 0.4s, heap 42 MB |
| singlepage | arxiv-2307.09288-llama2.pdf<br><sub>u5a-single-llama2-scaled</sub> | PASS | 77 pages, 145 x 14399 pt, scaled 24% | 6.1s, heap 35 MB |
| singlepage | arxiv-1706.03762-attention.pdf<br><sub>u5a-single-raw-attention</sub> | PASS | 15 pages, 612 x 11880 pt | 5.0s, heap 44 MB |
| overlay | pdfjs-tracemonkey.pdf + aws-invoice.pdf<br><sub>u5a-overlay-interleaved-tracemonkey-aws</sub> | PASS | 14 pages, interleaved, foreground | 1.5s, heap 9 MB |
| overlay | c-rot270-cropbox.pdf + aws-invoice.pdf<br><sub>u5a-overlay-background-rot270</sub> | PASS | 2 pages, interleaved, background | 0.2s, heap 12 MB |
| overlay | arxiv-1706.03762-attention.pdf + aws-invoice.pdf<br><sub>u5a-overlay-sequential-attention-aws</sub> | PASS | 15 pages, sequential, foreground | 3.9s, heap 22 MB |
| overlay | rot90-cropbox-bert.pdf + origin-shift-aws-invoice.pdf<br><sub>u5a-overlay-repeat3-rot90-origin</sub> | PASS | 16 pages, repeat, foreground | 0.4s, heap 26 MB |
| overlay | pdfjs-tracemonkey.pdf + aws-invoice.pdf<br><sub>u5a-overlay-background-empty-page</sub> | PASS | 15 pages, interleaved, background | 1.1s, heap 24 MB |
| stamp | pdfjs-tracemonkey.pdf<br><sub>u5a-stamp-topright-tokens-tracemonkey</sub> | PASS |  | 1.4s, heap 9 MB |
| stamp | aws-invoice.pdf<br><sub>u5a-stamp-arabic-aws</sub> | PASS |  | 0.4s, heap 14 MB |
| stamp | arxiv-1706.03762-attention.pdf<br><sub>u5a-stamp-pages-2-3-attention</sub> | PASS |  | 3.7s, heap 31 MB |
| stamp | rot90-cropbox-bert.pdf<br><sub>u5a-stamp-bottomleft-rot90-cropbox</sub> | PASS |  | 0.4s, heap 33 MB |
| stamp | c-rot270-cropbox.pdf<br><sub>u5a-stamp-cjk-rot270</sub> | PASS |  | 0.2s, heap 32 MB |
| stamp | origin-shift-aws-invoice.pdf<br><sub>u5a-stamp-turned45-origin-shift</sub> | PASS |  | 0.1s, heap 35 MB |
| stamp | c-rot270-cropbox.pdf<br><sub>u5a-stamp-image-centre-rot270</sub> | PASS |  | 0.2s, heap 35 MB |
| stamp | c-mixed.pdf<br><sub>u5a-stamp-mixed-rotations</sub> | PASS |  | 0.2s, heap 13 MB |
| stamp | aws-invoice.pdf<br><sub>u5a-stamp-long-text-aws</sub> | PASS |  | 0.2s, heap 16 MB |
| removeblank | fax-jean-schmidt-doe.pdf<br><sub>u5a-blank-fax-inserted</sub> | PASS | found 1, 3 (inserted 1, 3) in 0.2 s | 1.1s, heap 9 MB |
| removeblank | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-blank-lincoln-real</sub> | PASS | found 4, 7, 8, 9, 12, 16, 20, 22, 25, 26, 27, 28, 29, 30, 31, 32 (inserted none) in 14.5 s | 14.6s, heap 11 MB |
| removeblank | c-mixed.pdf<br><sub>u5a-blank-mixed-inserted</sub> | PASS | found 3, 6 (inserted 3, 6) in 0.8 s | 1.7s, heap 12 MB |
| removeblank | pdfjs-tracemonkey.pdf<br><sub>u5a-blank-tracemonkey-none</sub> | PASS | found none (inserted none) in 0.3 s | 0.4s, heap 12 MB |
| removeblank | handwritten-field-trips-notebook-1950.pdf<br><sub>u5a-blank-notebook-handwriting-none</sub> | PASS | found none (inserted none) in 5.6 s | 5.8s, heap 15 MB |
| removeblank | fips-document-facsimile-transmission.pdf<br><sub>u5a-blank-fips-real</sub> | PASS | found 6, 71 (inserted none) in 11.6 s | 14.1s, heap 16 MB |
| linearize | pdfjs-tracemonkey.pdf<br><sub>u5a-lin-tracemonkey</sub> | PASS | 14 pages, 5 packed objects, 0.95 MB from 0.97 MB (0.98x), page 1 loads 177 -> 153 KB, 100 ms | 1.1s, heap 9 MB |
| linearize | aws-invoice.pdf<br><sub>u5a-lin-aws-invoice</sub> | PASS | 1 pages, 3 packed objects, 0.15 MB from 0.15 MB (1.00x), 80 ms | 0.2s, heap 13 MB |
| linearize | arxiv-1706.03762-attention.pdf<br><sub>u5a-lin-attention</sub> | PASS | 15 pages, 193 packed objects, 1.94 MB from 2.11 MB (0.92x), page 1 loads 340 -> 166 KB, 1508 ms | 1.9s, heap 21 MB |
| linearize | rot90-cropbox-bert.pdf<br><sub>u5a-lin-rot90-cropbox</sub> | PASS | 16 pages, 178 packed objects, 0.69 MB from 0.63 MB (1.09x), 200 ms | 0.7s, heap 10 MB |
| linearize | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-lin-lincoln-relinearize</sub> | PASS | 36 pages, 6 packed objects, 0.52 MB from 0.52 MB (1.00x), 45 ms | 0.3s, heap 20 MB |
| linearize | arxiv-2307.09288-llama2.pdf<br><sub>u5a-lin-llama2</sub> | PASS | 77 pages, 653 packed objects, 12.88 MB from 13.03 MB (0.99x), page 1 loads 366 -> 232 KB, 1247 ms | 3.6s, heap 22 MB |
| linearize | us-budget-2024.pdf<br><sub>u5a-lin-us-budget-objstm</sub> | PASS | 184 pages, 25770 packed objects, 2.57 MB from 2.31 MB (1.11x), page 1 loads 313 -> 295 KB, 4946 ms | 5.9s, heap 42 MB |
| linearize | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>u5a-lin-fdic-objstm</sub> | PASS | 44 pages, 20859 packed objects, 1.31 MB from 1.29 MB (1.02x), page 1 loads 250 -> 258 KB, 3443 ms | 4.1s, heap 63 MB |
| adjustcolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-adjust-contrast-fax</sub> | PASS | layers, change 21/24, worst MuPDF p2 mean 1.02 p99 2, 186 KB from 186 KB, 18 ms | 1.1s, heap 9 MB |
| adjustcolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-adjust-desat-lincoln</sub> | PASS | layers, change 17, worst MuPDF p1 mean 0.76 p99 2, 537 KB from 529 KB, 51 ms | 1.4s, heap 12 MB |
| adjustcolors | c-mixed.pdf<br><sub>u5a-adjust-bright-mixed</sub> | PASS | layers, change 36/37, worst MuPDF p1 mean 0.18 p99 1, 480 KB from 478 KB, 34 ms | 1.2s, heap 11 MB |
| adjustcolors | pdfjs-tracemonkey.pdf<br><sub>u5a-adjust-dark-tracemonkey</sub> | PASS | layers, change 72, worst pdf.js p1 mean 0.1 p99 1, 946 KB from 992 KB, 469 ms | 1.1s, heap 12 MB |
| adjustcolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-adjust-saturate-images-lincoln</sub> | PASS | images, change 16/20, worst MuPDF p2 mean 2.06 p99 8, 1949 KB from 529 KB, 36925 ms | 39.8s, heap 21 MB |
| replacecolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-replace-invert-fax</sub> | PASS | layers, change 224/243, worst pdf.js p2 mean 0.52 p99 0, 186 KB from 186 KB, 16 ms | 1.0s, heap 9 MB |
| replacecolors | pdfjs-tracemonkey.pdf<br><sub>u5a-replace-invert-tracemonkey</sub> | PASS | layers, change 228, worst MuPDF p1 mean 0.37 p99 0, 946 KB from 992 KB, 162 ms | 0.6s, heap 12 MB |
| replacecolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-replace-yellow-on-black-lincoln</sub> | PASS | layers, change 96/83, worst pdf.js p3 mean 0.37 p99 2, 537 KB from 529 KB, 194 ms | 4.9s, heap 14 MB |
| replacecolors | c-mixed.pdf<br><sub>u5a-replace-white-on-black-mixed</sub> | PASS | layers, change 234/234/227, worst MuPDF p1 mean 0.29 p99 1, 480 KB from 478 KB, 54 ms | 1.1s, heap 10 MB |
| replacecolors | aws-invoice.pdf<br><sub>u5a-replace-custom-aws</sub> | PASS | layers, change 12, worst MuPDF p1 mean 0.4 p99 1, 148 KB from 151 KB, 28 ms | 0.4s, heap 11 MB |
| replacecolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-replace-grayscale-lincoln</sub> | PASS | layers, change 29/27, worst MuPDF p1 mean 0.02 p99 1, 533 KB from 529 KB, 164 ms | 4.9s, heap 12 MB |
| replacecolors | c-rot270-cropbox.pdf<br><sub>u5a-replace-green-on-black-rot270</sub> | PASS | layers, change 234, worst pdf.js p1 mean 0.03 p99 1, 206 KB from 205 KB, 39 ms | 1.1s, heap 11 MB |
| replacecolors | aws-invoice.pdf<br><sub>u5a-replace-invert-empty-page</sub> | PASS | layers, change 255/238, worst MuPDF p1 mean 0.37 p99 0, 148 KB from 147 KB, 12 ms | 0.4s, heap 12 MB |
| bookmarks | pdfjs-outlines_se.pdf<br><sub>u5b-bookmarks-outlines-se</sub> | PASS | run to result 479 ms: 6 bookmarks. | 1.3s, heap 9 MB |
| bookmarks | pdfjs-nested_outline.pdf<br><sub>u5b-bookmarks-nested</sub> | PASS | run to result 20 ms: 12 bookmarks. | 0.2s, heap 11 MB |
| bookmarks | pdfjs-outline_goto_action.pdf<br><sub>u5b-bookmarks-goto-action</sub> | PASS | run to result 6 ms: 5 bookmarks. | 0.1s, heap 11 MB |
| bookmarks | pdfjs-tracemonkey.pdf<br><sub>u5b-bookmarks-tracemonkey</sub> | PASS | run to result 190 ms: 3 bookmarks. | 0.4s, heap 11 MB |
| bookmarks | arxiv-1706.03762-attention.pdf<br><sub>u5b-bookmarks-headings-attention</sub> | PASS | run to result 3505 ms: 13 bookmarks. | 5.9s, heap 24 MB |
| bookmarks | xfa-imm1344e-filled.pdf<br><sub>u5b-bookmarks-xfa-imm1344e</sub> | PASS | run to result 157 ms: 21 bookmarks. | 0.6s, heap 24 MB |
| metadata | pdfjs-tracemonkey.pdf<br><sub>u5b-metadata-tracemonkey</sub> | PASS | run to result 549 ms: Info and XMP updated. | 1.5s, heap 9 MB |
| metadata | pdfjs-tracemonkey.pdf<br><sub>u5b-metadata-tracemonkey-delete-all</sub> | PASS | run to result 441 ms: Document info and XMP removed. | 1.1s, heap 11 MB |
| metadata | aws-invoice.pdf<br><sub>u5b-metadata-aws</sub> | PASS | run to result 27 ms: Info and XMP updated. | 0.2s, heap 13 MB |
| metadata | aws-invoice.pdf<br><sub>u5b-metadata-aws-delete-all</sub> | PASS | run to result 31 ms: Document info and XMP removed. | 0.2s, heap 13 MB |
| metadata | arxiv-1706.03762-attention.pdf<br><sub>u5b-metadata-attention</sub> | PASS | run to result 3446 ms: Info and XMP updated. | 6.0s, heap 28 MB |
| metadata | arxiv-1706.03762-attention.pdf<br><sub>u5b-metadata-attention-delete-all</sub> | PASS | run to result 4213 ms: Document info and XMP removed. | 7.0s, heap 36 MB |
| metadata | xfa-imm1344e-filled.pdf<br><sub>u5b-metadata-xfa-imm1344e</sub> | PASS | run to result 191 ms: Info and XMP updated. | 0.4s, heap 10 MB |
| attachments | pdfjs-tracemonkey.pdf<br><sub>u5b-attachments-tracemonkey</sub> | PASS | run to result 387 ms: 2 files attached. | 1.7s, heap 9 MB |
| attachments | aws-invoice.pdf<br><sub>u5b-attachments-aws</sub> | PASS | run to result 12 ms: 2 files attached. | 0.2s, heap 10 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-fileattachment</sub> | PASS | run to result 20 ms: 2 files attached. | 0.2s, heap 11 MB |
| attachments | aws-invoice.pdf<br><sub>u5b-attachments-big-aws</sub> | PASS | run to result 1027 ms: 4 files attached. | 7.6s, heap 12 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-remove-annotation</sub> | PASS | run to result 10 ms, 1 attachment(s) | 0.1s, heap 10 MB |
| attachments | aws-invoice.pdf<br><sub>u5b-attachments-facturx</sub> | PASS | run to result 7 ms, 2 attachment(s) | 0.1s, heap 11 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-tagged-annotation</sub> | PASS | run to result 7 ms, 1 attachment(s) | 0.1s, heap 10 MB |
| attachments | pdfjs-encrypted-attachment.pdf<br><sub>u5b-attachments-encrypted</sub> | PASS |  | 0.2s |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-facturx</sub> | PASS | run to result 825 ms: Removed 1 attached file. | 2.5s, heap 11 MB |
| sanitize | xfa-imm1344e-filled.pdf<br><sub>u5b-sanitize-xfa-imm1344e</sub> | PASS | run to result 74 ms: Removed 42 scripts, 355 XFA scripts. | 0.2s, heap 11 MB |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | PASS | run to result 68 ms: Removed 6 scripts, 1 XFA form. | 0.2s, heap 12 MB |
| sanitize | uscis-i-9.pdf<br><sub>u5b-sanitize-i9</sub> | PASS | run to result 270 ms: Removed 28 scripts, 32 triggers. | 0.8s, heap 11 MB |
| sanitize | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-sanitize-fileattachment</sub> | PASS | run to result 27 ms: Removed 1 attached file. | 0.2s, heap 14 MB |
| sanitize | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-sanitize-all-tracemonkey</sub> | PASS | run to result 215 ms: Removed 1 info dictionary, 24 embedded fonts. | 1.1s, heap 14 MB |
| sanitize | pdfjs-tracemonkey.pdf<br><sub>u5b-sanitize-tracemonkey</sub> | PASS | run to result 87 ms: Nothing found to remove. | 0.4s, heap 19 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-aws</sub> | PASS | run to result 6 ms: Nothing found to remove. | 0.2s, heap 12 MB |
| sanitize | arxiv-1706.03762-attention.pdf<br><sub>u5b-sanitize-attention</sub> | PASS | run to result 605 ms: Nothing found to remove. | 2.2s, heap 17 MB |
| removeannots | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-removeannots-tracemonkey</sub> | PASS | run to result 375 ms: 4 annotations removed. | 1.2s, heap 9 MB |
| removeannots | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-removeannots-fileattachment</sub> | PASS | run to result 17 ms: 1 annotation removed. | 0.2s, heap 10 MB |
| removeannots | irs-fw9.pdf<br><sub>u5b-removeannots-fw9-fields</sub> | PASS | run to result 321 ms: 23 annotations removed. | 0.6s, heap 11 MB |
| removeannots | xfa-imm1344e-filled.pdf<br><sub>u5b-removeannots-fields-xfa-imm1344e</sub> | PASS |  | 0.2s |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | PASS | run to result 396 ms: Images removed on 3 pages, 177.9 KB saved. | 1.4s, heap 9 MB |
| removeimages | aws-invoice.pdf<br><sub>u5b-removeimages-aws</sub> | PASS | run to result 8 ms: Images removed on 1 page, 66.6 KB saved. | 0.1s, heap 12 MB |
| removeimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-removeimages-attention</sub> | PASS | run to result 935 ms: Images removed on 2 pages, 604.8 KB saved. | 2.7s, heap 22 MB |
| removeimages | udhr-hebrew.pdf<br><sub>u5b-removeimages-inline-hebrew</sub> | PASS | run to result 19 ms: No images found, the file is unchanged. | 0.6s, heap 22 MB |
| removeimages | arxiv-2005.14165-gpt3.pdf<br><sub>u5b-removeimages-inline-gpt3</sub> | PASS | run to result 128 ms: Images removed on 26 pages, 5.97 MB saved. | 0.9s, heap 22 MB |
| extractimages | pdfjs-tracemonkey.pdf<br><sub>u5b-extractimages-tracemonkey</sub> | PASS | run to result 288 ms: 90 images. | 1.1s, heap 9 MB |
| extractimages | aws-invoice.pdf<br><sub>u5b-extractimages-aws</sub> | PASS | run to result 6 ms: 1 image, 1 kept as JPEG. | 0.3s, heap 10 MB |
| extractimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-extractimages-attention</sub> | PASS | run to result 556 ms: 3 images. | 2.1s, heap 19 MB |
| extractimages | pdfjs-cmykjpeg.pdf<br><sub>u5b-extractimages-cmyk-png</sub> | PASS | run to result 115 ms: 1 image. | 0.2s, heap 23 MB |
| extractimages | pdfjs-cmykjpeg.pdf<br><sub>u5b-extractimages-cmyk-jpg</sub> | PASS | run to result 24 ms: 1 image. | 0.1s, heap 10 MB |
| flatten | xfa-issue14315.pdf<br><sub>u5b-flatten-xfa-dynamic</sub> | PASS |  | 1.2s |
| flatten | xfa-imm1344e-filled.pdf<br><sub>u5b-flatten-xfa-imm1344e</sub> | PASS |  | 0.2s |
| flatten | xfa-imm1344e-filled.pdf<br><sub>u5b-flatten-full-xfa-imm1344e</sub> | PASS |  | 0.2s |
| flatten | irs-fw9.pdf<br><sub>u5b-flatten-fw9</sub> | PASS | run to result 515 ms: 23 fields flattened. | 1.1s, heap 12 MB |
| flatten | uscis-i-9.pdf<br><sub>u5b-flatten-i9</sub> | PASS | run to result 2218 ms: 128 fields flattened. | 3.3s, heap 26 MB |
| flatten | irs-fw4.pdf<br><sub>u5b-flatten-fw4</sub> | PASS | run to result 1173 ms: 48 fields flattened. | 2.6s, heap 26 MB |
| flatten | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-flatten-full-tracemonkey</sub> | PASS | run to result 363 ms: 4 annotations flattened. | 1.2s, heap 25 MB |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-fw9</sub> | PASS | run to result 461 ms: Unlocked 23 fields, 23 XFA locks. | 1.4s, heap 9 MB |
| unlockforms | uscis-i-9.pdf<br><sub>u5b-unlockforms-i9</sub> | PASS | run to result 126 ms: Unlocked 128 fields. | 0.7s, heap 14 MB |
| unlockforms | xfa-imm1344e-filled.pdf<br><sub>u5b-unlockforms-xfa</sub> | PASS | run to result 117 ms: Unlocked 1 field, 299 XFA locks. | 0.4s, heap 10 MB |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-xfa-single-stream</sub> | PASS | run to result 63 ms: Unlocked 23 fields, 23 XFA locks. | 0.3s, heap 15 MB |
| unlockforms | xfa-issue14315.pdf<br><sub>u5b-unlockforms-xfa-nothing-locked</sub> | PASS | run to result 18 ms: No read-only fields, the file is unchanged. | 0.2s, heap 20 MB |
| permissions | owner-only-aws-invoice.pdf<br><sub>u5b-permissions-owner-only-aws</sub> | PASS | run to result 500 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 3.0s, heap 9 MB |
| permissions | pdfjs-tracemonkey.pdf<br><sub>u5b-permissions-tracemonkey</sub> | PASS | run to result 285 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 0.7s, heap 11 MB |
| permissions | irs-fw9.pdf<br><sub>u5b-permissions-fw9</sub> | PASS | run to result 469 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 0.8s, heap 12 MB |
| permissions | aws-invoice.pdf<br><sub>u5b-permissions-orphan-aws</sub> | PASS | run to result 225 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 0.3s, heap 13 MB |
| info | pdfjs-tracemonkey.pdf<br><sub>u5b-info-tracemonkey</sub> | PASS | run to result 299 ms: 14 pages, 24 fonts, 90 images. | 1.1s, heap 9 MB |
| info | aws-invoice.pdf<br><sub>u5b-info-aws</sub> | PASS | run to result 15 ms: 1 page, 3 fonts, 1 image. | 0.1s, heap 12 MB |
| info | irs-fw9.pdf<br><sub>u5b-info-fw9</sub> | PASS | run to result 81 ms: 6 pages, 6 fonts, 0 images. | 0.2s, heap 10 MB |
| info | arxiv-1706.03762-attention.pdf<br><sub>u5b-info-attention</sub> | PASS | run to result 1879 ms: 15 pages, 34 fonts, 3 images. | 2.7s, heap 14 MB |
| autorename | pdfjs-tracemonkey.pdf<br><sub>u5b-autorename-tracemonkey</sub> | PASS | run to result 507 ms: Named after its heading. Was pdfjs-tracemonkey.pdf. | 2.3s, heap 9 MB |
| autorename | arxiv-1706.03762-attention.pdf<br><sub>u5b-autorename-attention</sub> | PASS | run to result 1302 ms: Named after its heading. Was arxiv-1706.03762-attention.pdf. | 2.7s, heap 24 MB |
| autorename | aws-invoice.pdf<br><sub>u5b-autorename-aws</sub> | PASS | run to result 233 ms: Named after its heading. Was aws-invoice.pdf. | 0.5s, heap 23 MB |
| showjs | pdfjs-outlines_se.pdf<br><sub>u5b-showjs-none-outlines</sub> | PASS |  | 2.0s |
| showjs | irs-fw9.pdf<br><sub>u5b-showjs-fw9</sub> | PASS | run to result 13 ms: 3 XFA <script> tags, 0 self-closing, 0 empty | 0.2s, heap 10 MB |
| showjs | uscis-i-9.pdf<br><sub>u5b-showjs-i9</sub> | PASS | run to result 19 ms: 0 XFA <script> tags, 0 self-closing, 0 empty | 0.2s, heap 12 MB |
| showjs | xfa-issue14315.pdf<br><sub>u5b-showjs-xfa</sub> | PASS | run to result 1 ms: 0 XFA <script> tags, 0 self-closing, 0 empty | 0.1s, heap 17 MB |
| showjs | xfa-imm1344e-filled.pdf<br><sub>u5b-showjs-xfa-imm1344e</sub> | PASS | run to result 31 ms: 1437 XFA <script> tags, 1082 self-closing, 0 empty | 0.2s, heap 17 MB |
| intake | annotation-button-widget.pdf<br><sub>intake-forms/annotation-button-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.2 KB" | 1.1s |
| intake | annotation-choice-widget.pdf<br><sub>intake-forms/annotation-choice-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 89.4 KB" | 1.1s |
| intake | annotation-text-widget.pdf<br><sub>intake-forms/annotation-text-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 91.0 KB" | 1.1s |
| intake | irs-f1040.pdf<br><sub>intake-forms/irs-f1040.pdf</sub> | PASS | expect accept (2 p): "2 pages, 215.1 KB" | 1.1s |
| intake | irs-f1040sa.pdf<br><sub>intake-forms/irs-f1040sa.pdf</sub> | PASS | expect accept (1 p): "1 page, 77.2 KB" | 1.1s |
| intake | irs-fw4.pdf<br><sub>intake-forms/irs-fw4.pdf</sub> | PASS | expect accept (5 p): "5 pages, 204.0 KB" | 1.1s |
| intake | irs-fw9.pdf<br><sub>intake-forms/irs-fw9.pdf</sub> | PASS | expect accept (6 p): "6 pages, 137.5 KB" | 1.1s |
| intake | uk-AFPS-Form-17.pdf<br><sub>intake-forms/uk-AFPS-Form-17.pdf</sub> | PASS | expect accept (5 p), encrypted: "5 pages, 978.1 KB" (Restrictions removed so the file can be edited) | 1.7s |
| intake | darwin-origin-of-species-ia.pdf<br><sub>intake-scanned/darwin-origin-of-species-ia.pdf</sub> | PASS | expect accept (568 p): "568 pages, 24.20 MB" | 1.4s, heap 9 MB |
| intake | uk-IPPH353.pdf<br><sub>intake-forms/uk-IPPH353.pdf</sub> | PASS | expect accept (4 p), encrypted: "4 pages, 1.58 MB" (Restrictions removed so the file can be edited) | 1.6s |
| intake | uscis-i-485.pdf<br><sub>intake-forms/uscis-i-485.pdf</sub> | PASS | expect accept (24 p), encrypted: "24 pages, 2.55 MB" (Restrictions removed so the file can be edited) | 1.9s |
| intake | uscis-i-9.pdf<br><sub>intake-forms/uscis-i-9.pdf</sub> | PASS | expect accept (4 p): "4 pages, 511.8 KB" | 2.2s |
| intake | xfa-imm1344e-filled.pdf<br><sub>intake-forms/xfa-imm1344e-filled.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.88 MB" | 2.2s |
| intake | xfa-issue14315.pdf<br><sub>intake-forms/xfa-issue14315.pdf</sub> | PASS | expect accept (1 p): "1 page, 11.3 KB" | 2.2s |
| intake | fax-jean-schmidt-doe.pdf<br><sub>intake-scanned/fax-jean-schmidt-doe.pdf</sub> | PASS | expect accept (2 p): "2 pages, 186.4 KB" | 2.2s |
| intake | fips-document-facsimile-transmission.pdf<br><sub>intake-scanned/fips-document-facsimile-transmission.pdf</sub> | PASS | expect accept (72 p): "72 pages, 4.22 MB" | 2.6s |
| intake | handwritten-field-trips-notebook-1950.pdf<br><sub>intake-scanned/handwritten-field-trips-notebook-1950.pdf</sub> | PASS | expect accept (57 p): "57 pages, 5.69 MB" | 3.3s |
| intake | letter-to-benjamin-glover.pdf<br><sub>intake-scanned/letter-to-benjamin-glover.pdf</sub> | PASS | expect accept (2 p): "2 pages, 1.71 MB" | 0.7s |
| intake | lincoln-ellsworth-letter-1861.pdf<br><sub>intake-scanned/lincoln-ellsworth-letter-1861.pdf</sub> | PASS | expect accept (36 p): "36 pages, 528.6 KB" | 0.7s |
| intake | ndl-konoye-handwritten-request.pdf<br><sub>intake-scanned/ndl-konoye-handwritten-request.pdf</sub> | PASS | expect accept (37 p), encrypted: "37 pages, 13.79 MB" (Restrictions removed so the file can be edited) | 1.5s |
| intake | queen-victoria-peabody-letter-1866.pdf<br><sub>intake-scanned/queen-victoria-peabody-letter-1866.pdf</sub> | PASS | expect accept (38 p): "38 pages, 5.72 MB" | 1.5s |
| intake | arxiv-1512.03385-resnet.pdf<br><sub>intake-reports/arxiv-1512.03385-resnet.pdf</sub> | PASS | expect accept (12 p): "12 pages, 800.2 KB" | 2.2s |
| intake | arxiv-1706.03762-attention.pdf<br><sub>intake-reports/arxiv-1706.03762-attention.pdf</sub> | PASS | expect accept (15 p): "15 pages, 2.11 MB" | 2.8s |
| intake | arxiv-1810.04805-bert.pdf<br><sub>intake-reports/arxiv-1810.04805-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages, 757.0 KB" | 3.5s |
| intake | arxiv-2005.14165-gpt3.pdf<br><sub>intake-reports/arxiv-2005.14165-gpt3.pdf</sub> | PASS | expect accept (75 p): "75 pages, 6.45 MB" | 4.5s |
| intake | 19th-century-young-man-57MB.pdf<br><sub>intake-large/19th-century-young-man-57MB.pdf</sub> | PASS | expect accept (178 p): "178 pages, 54.76 MB" | 1.9s, heap 9 MB |
| intake | arxiv-2307.09288-llama2.pdf<br><sub>intake-reports/arxiv-2307.09288-llama2.pdf</sub> | PASS | expect accept (77 p): "77 pages, 13.03 MB" | 1.0s |
| intake | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>intake-reports/fdic-quarterly-banking-profile-2023q4.pdf</sub> | PASS | expect accept (44 p): "44 pages, 1.29 MB" | 3.0s |
| intake | ipcc-ar6-synthesis-longer-report.pdf<br><sub>intake-reports/ipcc-ar6-synthesis-longer-report.pdf</sub> | PASS | expect accept (81 p): "81 pages, 4.98 MB" | 3.4s |
| intake | pdfjs-TAMReview.pdf<br><sub>intake-reports/pdfjs-TAMReview.pdf</sub> | PASS | expect accept (23 p): "23 pages, 658.8 KB" | 3.7s |
| intake | pdfjs-tracemonkey.pdf<br><sub>intake-reports/pdfjs-tracemonkey.pdf</sub> | PASS | expect accept (14 p): "14 pages, 992.5 KB" | 4.1s |
| intake | us-budget-2024.pdf<br><sub>intake-reports/us-budget-2024.pdf</sub> | PASS | expect accept (184 p): "184 pages, 2.31 MB" | 9.3s |
| intake | us-economic-report-president-2024.pdf<br><sub>intake-reports/us-economic-report-president-2024.pdf</sub> | PASS | expect accept (487 p): "487 pages, 4.93 MB" | 12.0s |
| intake | 911-commission-report.pdf<br><sub>intake-large/911-commission-report.pdf</sub> | PASS | expect accept (585 p), encrypted: "585 pages, 2.36 MB" (Restrictions removed so the file can be edited) | 13.0s |
| intake | crooked-paths-1648-104MB.pdf<br><sub>intake-large/crooked-paths-1648-104MB.pdf</sub> | PASS | expect accept (255 p): "255 pages, 99.26 MB" | 5.1s, heap 11 MB |
| intake | explorations-bible-lands-956pp-62MB.pdf<br><sub>intake-large/explorations-bible-lands-956pp-62MB.pdf</sub> | PASS | expect accept (956 p): "956 pages, 59.84 MB" | 4.3s, heap 11 MB |
| intake | pdfjs-ArabicCIDTrueType.pdf<br><sub>intake-intl/pdfjs-ArabicCIDTrueType.pdf</sub> | PASS | expect accept (1 p): "1 page, 38.4 KB" | 0.4s |
| intake | pdfjs-ThuluthFeatures.pdf<br><sub>intake-intl/pdfjs-ThuluthFeatures.pdf</sub> | PASS | expect accept (1 p): "1 page, 114.9 KB" | 0.4s |
| intake | pdfjs-arial_unicode_ab_cidfont.pdf<br><sub>intake-intl/pdfjs-arial_unicode_ab_cidfont.pdf</sub> | PASS | expect accept (1 p): "1 page, 12.8 KB" | 0.4s |
| intake | pdfjs-noembed-eucjp.pdf<br><sub>intake-intl/pdfjs-noembed-eucjp.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.4 KB" | 0.4s |
| intake | pdfjs-noembed-sjis.pdf<br><sub>intake-intl/pdfjs-noembed-sjis.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.4 KB" | 0.4s |
| intake | pdfjs-vertical.pdf<br><sub>intake-intl/pdfjs-vertical.pdf</sub> | PASS | expect accept (3 p): "3 pages, 6.7 KB" | 0.4s |
| intake | udhr-arabic.pdf<br><sub>intake-intl/udhr-arabic.pdf</sub> | PASS | expect accept (5 p): "5 pages, 184.8 KB" | 0.4s |
| intake | udhr-chinese-simplified.pdf<br><sub>intake-intl/udhr-chinese-simplified.pdf</sub> | PASS | expect accept (7 p): "7 pages, 468.6 KB" | 0.4s |
| intake | udhr-hebrew.pdf<br><sub>intake-intl/udhr-hebrew.pdf</sub> | PASS | expect accept (4 p): "4 pages, 29.1 KB" | 0.4s |
| intake | udhr-hindi.pdf<br><sub>intake-intl/udhr-hindi.pdf</sub> | PASS | expect accept (5 p): "5 pages, 1.65 MB" | 0.4s |
| intake | udhr-japanese.pdf<br><sub>intake-intl/udhr-japanese.pdf</sub> | PASS | expect accept (9 p): "9 pages, 465.1 KB" | 0.4s |
| intake | udhr-korean.pdf<br><sub>intake-intl/udhr-korean.pdf</sub> | PASS | expect accept (7 p): "7 pages, 273.0 KB" | 0.4s |
| intake | pdf20-image-bpc.pdf<br><sub>intake-quirks/pdf20-image-bpc.pdf</sub> | PASS | expect accept (1 p): "1 page, 8.8 KB" | 0.4s |
| intake | pdf20-incremental-save.pdf<br><sub>intake-quirks/pdf20-incremental-save.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.5 KB" | 0.4s |
| intake | pdf20-offset-start.pdf<br><sub>intake-quirks/pdf20-offset-start.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.1 KB" | 0.4s |
| intake | pdf20-page-output-intent.pdf<br><sub>intake-quirks/pdf20-page-output-intent.pdf</sub> | PASS | expect accept (2 p): "2 pages, 10.3 KB" | 0.4s |
| intake | pdf20-simple.pdf<br><sub>intake-quirks/pdf20-simple.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.1 KB" | 1.2s |
| intake | pdf20-utf8-annotation.pdf<br><sub>intake-quirks/pdf20-utf8-annotation.pdf</sub> | PASS | expect accept (1 p): "1 page, 4.4 KB" | 1.2s |
| intake | pdf20-utf8-test.pdf<br><sub>intake-quirks/pdf20-utf8-test.pdf</sub> | PASS | expect accept (1 p): "1 page, 13.6 KB" | 1.2s |
| intake | pdfjs-Pages-tree-refs.pdf<br><sub>intake-quirks/pdfjs-Pages-tree-refs.pdf</sub> | PASS | expect accept (1 p): "1 page, 622 B" (File was damaged and has been repaired. 1 of 2 pages could not be recovered) | 1.9s |
| intake | pdfjs-Type3WordSpacing.pdf<br><sub>intake-quirks/pdfjs-Type3WordSpacing.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.6 KB" | 1.9s |
| intake | pdfjs-alphatrans.pdf<br><sub>intake-quirks/pdfjs-alphatrans.pdf</sub> | PASS | expect accept (1 p): "1 page, 16.5 KB" | 1.9s |
| intake | pdfjs-annotation-fileattachment.pdf<br><sub>intake-quirks/pdfjs-annotation-fileattachment.pdf</sub> | PASS | expect accept (1 p): "1 page, 91.1 KB" | 1.9s |
| intake | pdfjs-annotation-freetext.pdf<br><sub>intake-quirks/pdfjs-annotation-freetext.pdf</sub> | PASS | expect accept (1 p): "1 page, 84.0 KB" | 1.9s |
| intake | pdfjs-annotation-highlight-without-appearance.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight-without-appearance.pdf</sub> | PASS | expect accept (1 p): "1 page, 15.9 KB" | 1.5s |
| intake | pdfjs-annotation-highlight.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight.pdf</sub> | PASS | expect accept (1 p): "1 page, 90.2 KB" | 1.5s |
| intake | pdfjs-annotation-line.pdf<br><sub>intake-quirks/pdfjs-annotation-line.pdf</sub> | PASS | expect accept (1 p): "1 page, 83.0 KB" | 1.5s |
| intake | pdfjs-annotation-stamp.pdf<br><sub>intake-quirks/pdfjs-annotation-stamp.pdf</sub> | PASS | expect accept (1 p): "1 page, 86.8 KB" | 1.5s |
| intake | pdfjs-bitmap-symbol-empty.pdf<br><sub>intake-quirks/pdfjs-bitmap-symbol-empty.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.1 KB" | 1.5s |
| intake | pdfjs-blendmode.pdf<br><sub>intake-quirks/pdfjs-blendmode.pdf</sub> | PASS | expect accept (1 p): "1 page, 49.4 KB" | 1.5s |
| intake | pdfjs-bug1020226.pdf<br><sub>intake-quirks/pdfjs-bug1020226.pdf</sub> | PASS | expect reject: "Can't open this PDF. The file looks damaged or incomplete." | 2.5s |
| intake | pdfjs-bug1782186.pdf<br><sub>intake-quirks/pdfjs-bug1782186.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.5s |
| intake | pdfjs-bug_jpx.pdf<br><sub>intake-quirks/pdfjs-bug_jpx.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.3 KB" | 0.4s |
| intake | pdfjs-cmykjpeg.pdf<br><sub>intake-quirks/pdfjs-cmykjpeg.pdf</sub> | PASS | expect accept (1 p): "1 page, 365.3 KB" | 0.4s |
| intake | pdfjs-devicen.pdf<br><sub>intake-quirks/pdfjs-devicen.pdf</sub> | PASS | expect accept (1 p): "1 page, 15.4 KB" | 0.4s |
| intake | pdfjs-empty_protected.pdf<br><sub>intake-quirks/pdfjs-empty_protected.pdf</sub> | PASS | expect accept (1 p), encrypted: "1 page, 5.3 KB" (Restrictions removed so the file can be edited) | 0.7s |
| intake | pdfjs-encrypted-attachment.pdf<br><sub>intake-quirks/pdfjs-encrypted-attachment.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.0s |
| intake | pdfjs-function_based_shading_cmyk.pdf<br><sub>intake-quirks/pdfjs-function_based_shading_cmyk.pdf</sub> | PASS | expect accept (2 p): "2 pages, 3.2 KB" | 1.0s |
| intake | pdfjs-hello_world_rotated.pdf<br><sub>intake-quirks/pdfjs-hello_world_rotated.pdf</sub> | PASS | expect accept (5 p): "5 pages, 1.3 KB" | 1.0s |
| intake | pdfjs-issue11555.pdf<br><sub>intake-quirks/pdfjs-issue11555.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.1 KB" | 1.0s |
| intake | pdfjs-issue1155r.pdf<br><sub>intake-quirks/pdfjs-issue1155r.pdf</sub> | PASS | expect accept (1 p): "1 page, 776 B" | 1.3s |
| intake | pdfjs-issue15893_reduced.pdf<br><sub>intake-quirks/pdfjs-issue15893_reduced.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.2s |
| intake | pdfjs-issue21579.pdf<br><sub>intake-quirks/pdfjs-issue21579.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.2s |
| intake | pdfjs-issue3371.pdf<br><sub>intake-quirks/pdfjs-issue3371.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.2s |
| intake | pdfjs-issue6010_1.pdf<br><sub>intake-quirks/pdfjs-issue6010_1.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.2s |
| intake | pdfjs-issue6010_2.pdf<br><sub>intake-quirks/pdfjs-issue6010_2.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.5s |
| intake | pdfjs-jbig2_file_header.pdf<br><sub>intake-quirks/pdfjs-jbig2_file_header.pdf</sub> | PASS | expect accept (1 p): "1 page, 774 B" | 2.5s |
| intake | pdfjs-jbig2_symbol_offset.pdf<br><sub>intake-quirks/pdfjs-jbig2_symbol_offset.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.1 KB" | 2.5s |
| intake | pdfjs-jpx_smaskindata.pdf<br><sub>intake-quirks/pdfjs-jpx_smaskindata.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.5 KB" | 1.2s |
| intake | pdfjs-jpx_subsampling.pdf<br><sub>intake-quirks/pdfjs-jpx_subsampling.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.0 KB" | 1.2s |
| intake | pdfjs-nested_outline.pdf<br><sub>intake-quirks/pdfjs-nested_outline.pdf</sub> | PASS | expect accept (9 p): "9 pages, 5.8 KB" | 1.2s |
| intake | pdfjs-openoffice.pdf<br><sub>intake-quirks/pdfjs-openoffice.pdf</sub> | PASS | expect accept (1 p): "1 page, 10.1 KB" | 1.2s |
| intake | pdfjs-outline_goto_action.pdf<br><sub>intake-quirks/pdfjs-outline_goto_action.pdf</sub> | PASS | expect accept (2 p): "2 pages, 1.0 KB" | 1.2s |
| intake | pdfjs-outlines_se.pdf<br><sub>intake-quirks/pdfjs-outlines_se.pdf</sub> | PASS | expect accept (2 p): "2 pages, 29.7 KB" | 1.2s |
| intake | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-395-0-fuzzed.pdf</sub> | PASS | expect reject: "Can't open this PDF. The file looks damaged or incomplete." | 1.9s |
| intake | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-742-0-fuzzed.pdf</sub> | PASS | expect reject: "Can't open this PDF. The file looks damaged or incomplete." | 1.9s |
| intake | pdfjs-rotated.pdf<br><sub>intake-quirks/pdfjs-rotated.pdf</sub> | PASS | expect accept (1 p): "1 page, 12.7 KB" | 1.0s |
| intake | pdfjs-rotation.pdf<br><sub>intake-quirks/pdfjs-rotation.pdf</sub> | PASS | expect accept (2 p): "2 pages, 6.5 KB" | 1.0s |
| intake | pdfjs-saslprep-r6.pdf<br><sub>intake-quirks/pdfjs-saslprep-r6.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.3s |
| intake | pdfjs-simpletype3font.pdf<br><sub>intake-quirks/pdfjs-simpletype3font.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.6 KB" | 1.7s |
| intake | pdfjs-tracemonkey_with_annotations.pdf<br><sub>intake-quirks/pdfjs-tracemonkey_with_annotations.pdf</sub> | PASS | expect accept (14 p): "14 pages, 997.8 KB" | 1.7s |
| intake | pdfjs-xref_command_missing.pdf<br><sub>intake-quirks/pdfjs-xref_command_missing.pdf</sub> | PASS | expect accept (1 p): "1 page, 631 B" | 1.7s |
| intake | aws-invoice.pdf<br><sub>intake-invoices/aws-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 150.9 KB" | 1.7s |
| intake | azure-interior.pdf<br><sub>intake-invoices/azure-interior.pdf</sub> | PASS | expect accept (1 p): "1 page, 39.9 KB" | 2.0s |
| intake | camelot-bol.pdf<br><sub>intake-invoices/camelot-bol.pdf</sub> | PASS | expect accept (1 p): "1 page, 24.3 KB" | 0.7s |
| intake | coolblue.pdf<br><sub>intake-invoices/coolblue.pdf</sub> | PASS | expect accept (1 p): "1 page, 52.3 KB" | 0.7s |
| intake | flipkart-invoice.pdf<br><sub>intake-invoices/flipkart-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 43.7 KB" | 0.7s |
| intake | free-fiber.pdf<br><sub>intake-invoices/free-fiber.pdf</sub> | PASS | expect accept (2 p): "2 pages, 117.3 KB" | 0.7s |
| intake | netpresse-invoice.pdf<br><sub>intake-invoices/netpresse-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 72.7 KB" | 0.7s |
| intake | oyo.pdf<br><sub>intake-invoices/oyo.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.9 KB" | 0.7s |
| intake | quality-hosting.pdf<br><sub>intake-invoices/quality-hosting.pdf</sub> | PASS | expect accept (2 p): "2 pages, 53.1 KB" | 0.7s |
| intake | saeco.pdf<br><sub>intake-invoices/saeco.pdf</sub> | PASS | expect accept (1 p): "1 page, 48.1 KB" | 0.7s |
| intake | a-owner-only-attention.pdf<br><sub>intake-derived/a-owner-only-attention.pdf</sub> | PASS | expect accept (15 p), encrypted: "15 pages, 1.99 MB" (Restrictions removed so the file can be edited) | 2.0s |
| intake | a-owner-only-us-budget.pdf<br><sub>intake-derived/a-owner-only-us-budget.pdf</sub> | PASS | expect accept (184 p), encrypted: "184 pages, 10.15 MB" (Restrictions removed so the file can be edited) | 13.7s |
| intake | c-fw9-rot90.pdf<br><sub>intake-derived/c-fw9-rot90.pdf</sub> | PASS | expect accept (6 p): "6 pages, 131.4 KB" | 14.0s |
| intake | c-mixed.pdf<br><sub>intake-derived/c-mixed.pdf</sub> | PASS | expect accept (5 p): "5 pages, 477.6 KB" | 14.0s |
| intake | c-rot180-origin.pdf<br><sub>intake-derived/c-rot180-origin.pdf</sub> | PASS | expect accept (2 p): "2 pages, 205.9 KB" | 14.4s |
| intake | c-rot270-cropbox.pdf<br><sub>intake-derived/c-rot270-cropbox.pdf</sub> | PASS | expect accept (2 p): "2 pages, 205.1 KB" | 14.4s |
| intake | compare-tracemonkey-base.pdf<br><sub>intake-derived/compare-tracemonkey-base.pdf</sub> | PASS | expect accept (5 p): "5 pages, 456.2 KB" | 14.4s |
| intake | compare-tracemonkey-inserted.pdf<br><sub>intake-derived/compare-tracemonkey-inserted.pdf</sub> | PASS | expect accept (6 p): "6 pages, 527.5 KB" | 14.4s |
| intake | origin-shift-aws-invoice.pdf<br><sub>intake-derived/origin-shift-aws-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 147.8 KB" | 0.8s |
| intake | owner-only-aws-invoice.pdf<br><sub>intake-derived/owner-only-aws-invoice.pdf</sub> | PASS | expect accept (1 p), encrypted: "1 page, 150.4 KB" (Restrictions removed so the file can be edited) | 1.4s |
| intake | owner-only-irs-fw9.pdf<br><sub>intake-derived/owner-only-irs-fw9.pdf</sub> | PASS | expect accept (6 p), encrypted: "6 pages, 220.0 KB" (Restrictions removed so the file can be edited) | 1.8s |
| intake | owner-only-tracemonkey.pdf<br><sub>intake-derived/owner-only-tracemonkey.pdf</sub> | PASS | expect accept (14 p), encrypted: "14 pages, 975.7 KB" (Restrictions removed so the file can be edited) | 1.8s |
| intake | rot90-cropbox-bert.pdf<br><sub>intake-derived/rot90-cropbox-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages, 647.9 KB" | 1.8s |
| intake | sub-darwin-p10-11.pdf<br><sub>intake-derived/sub-darwin-p10-11.pdf</sub> | PASS | expect accept (2 p): "2 pages, 28.7 KB" | 1.8s |
| intake | sub-fips-p5-6.pdf<br><sub>intake-derived/sub-fips-p5-6.pdf</sub> | PASS | expect accept (2 p): "2 pages, 51.0 KB" | 1.8s |
| intake | sub-lincoln-p3-4.pdf<br><sub>intake-derived/sub-lincoln-p3-4.pdf</sub> | PASS | expect accept (2 p): "2 pages, 12.3 KB" | 1.8s |
| intake | sub-ndl-konoye-p1.pdf<br><sub>intake-derived/sub-ndl-konoye-p1.pdf</sub> | PASS | expect accept (1 p): "1 page, 235.5 KB" | 1.0s |
| intake | user-pw-TAMReview.pdf<br><sub>intake-derived/user-pw-TAMReview.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.6s |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf<br><sub>flow-merge</sub> | PASS | ready 1.3s, click to download 1.0s: merged.pdf: 30 pages, 1.55 MB | 6.3s, heap 13 MB |
| compress | us-budget-2024.pdf<br><sub>flow-compress</sub> | PASS | ready 2.7s, click to download 81.1s: us-budget-2024-compressed.pdf: 184 pages, 2.31 MB | 85.2s, heap 14 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | PASS | ready 1.0s, click to download 1.4s: 2 PDFs, 14 pages in total | 3.3s, heap 14 MB |
