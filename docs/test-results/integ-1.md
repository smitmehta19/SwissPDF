# Corpus scorecard: integ-1

Run: 2026-10-17 23:24 UTC, 11.2 min. Command: `npm run test:corpus -- --shards 4 --name integ-1`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **573 PASS, 4 FAIL, 0 SKIP** of 577 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 17 | 0 | 0 | 114.4s |
| excel2pdf | 12 | 0 | 0 | 55.6s |
| ppt2pdf | 12 | 0 | 0 | 17.9s |
| html2pdf | 5 | 0 | 0 | 57.4s |
| merge | 9 | 0 | 0 | 70.0s |
| split | 8 | 0 | 0 | 61.7s |
| thumbs | 3 | 0 | 0 | 167.9s |
| extract | 3 | 0 | 0 | 9.6s |
| remove | 2 | 0 | 0 | 4.1s |
| rotate | 3 | 0 | 0 | 8.2s |
| organize | 2 | 0 | 0 | 2.7s |
| compress | 12 | 0 | 0 | 172.3s |
| repair | 8 | 0 | 0 | 5.8s |
| watermark | 67 | 0 | 0 | 40.5s |
| pagenumbers | 48 | 0 | 0 | 47.3s |
| sign | 16 | 0 | 0 | 8.2s |
| crop | 15 | 0 | 0 | 21.2s |
| edit | 38 | 0 | 0 | 27.0s |
| protect | 5 | 0 | 0 | 6.3s |
| unlock | 11 | 1 | 0 | 10.2s |
| ocr | 8 | 0 | 0 | 120.6s |
| pdf2word | 23 | 0 | 0 | 101.4s |
| pdf2excel | 12 | 0 | 0 | 22.7s |
| pdf2ppt | 6 | 0 | 0 | 26.2s |
| pdf2md | 12 | 0 | 0 | 21.1s |
| img2pdf | 12 | 0 | 0 | 22.4s |
| pdf2img | 15 | 0 | 0 | 53.1s |
| redact | 20 | 0 | 0 | 70.5s |
| forms | 39 | 1 | 0 | 35.2s |
| compare | 3 | 2 | 0 | 61.9s |
| health | 1 | 0 | 0 | 7.6s |
| intake | 126 | 0 | 0 | 229.2s |


## Delta vs U1fix

Baseline: 492 PASS, 16 FAIL, 0 SKIP of 508. This run: 573 PASS, 4 FAIL, 0 SKIP of 577.
Same rows: 508. FAIL->PASS: 12. PASS->FAIL: 0. Still failing: 4. New rows: 69 (69 pass, 0 fail). Rows gone: 0.

### PASS->FAIL (regressions): 0

None.

### FAIL->PASS: 12

| Case | Was | Now |
|---|---|---|
| excel2pdf-quick-poi-SampleSS.xlsx | error: TypeError: Cannot read properties of undefined (reading 'indexOf') | 2 pages, 62 KB, text coverage 0.00; warn: selectable text (coverage 0.00) |
| excel2pdf-quick-poi-WithThreeCharts.xlsx | error: TypeError: Cannot read properties of undefined (reading 'indexOf') | 1 pages, 31 KB, text coverage undefined |
| excel2pdf-quick-poi-picture.xlsx | error: TypeError: Cannot read properties of undefined (reading 'indexOf') | 1 pages, 39 KB, text coverage 0.00; warn: selectable text (coverage 0.00) |
| img2pdf-heic-libheif-example.heic | image decoded: Not a supported image file. | 1 page(s), 8.5x5.7 in, 455 KB |
| img2pdf-heic-nokia-C001.heic | image decoded: Not a supported image file. | 1 page(s), 8.5x4.8 in, 219 KB |
| img2pdf-tiff-multipage-mmap.tiff | image decoded: Not a supported image file. | 3 page(s), 0.1x0.1 in, 4 KB |
| img2pdf-tiff-multipage.tiff | image decoded: Not a supported image file. | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) |
| pdf2img-jbig2-header | page 1 not blank: ink 0.00% | ink 41.0% |
| redact-rot90-cropbox | black box covers the word on screen: coverage 0.26, 0.13, 0.16, 0.14, 0.14, 0.13; warn: size stays reasonable (<= 3x) (11.4x input) | 59 boxes on 12 page(s), 11.4x size; warn: size stays reasonable (<= 3x) (11.4x input) |
| redact-origin-shift | black box covers the word on screen: coverage 0.00, 0.00, 0.00, 0.00, 0.00, 0.00 | 13 boxes on 1 page(s), 2.4x size |
| forms-fill-flatten-ipph353 | values baked into page text | 3 filled, flattened |
| forms-flatten-i485 | error: Reading rich text fields is not supported: Attempted to read rich text field: form1[0].#subform[24].P14_Line5_AdditionalInfo[0] | 730 fields flattened |

### Still failing, by owning unit: 4

Unit from the audit finding of the first failing check, else from the tool. New = row not in the baseline.

#### U3 (4)

| Case | Audit | Detail |
|---|---|---|
| unlock-saslprep-r6 |  | error: Wrong password, the file stays locked. |
| forms-fill-xfa-imm1344e | 21 | found text fields to fill: 0 |
| compare-inserted-page | 27 | only the inserted page differs: changed pages 3,4,5,6 |
| compare-dense-econ-self | 27 | compare runs: TypeError: Cannot read properties of undefined (reading 'text') |


## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT REPRODUCED | 32 linked check(s) passed, e.g. merge-owner-only: passed; intake-forms/uk-AFPS-Form-17.pdf: accepted |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT REPRODUCED | 21 linked check(s) passed, e.g. redact-tracemonkey: black box covers the word on screen; redact-aws-invoice: black box covers the word on screen |
| 3 | Redact search misses phrases split across text items | NOT REPRODUCED | 4 linked check(s) passed, e.g. redact-find-split-uk-IPPH353: search finds a phrase split across text items; redact-find-split-uk-AFPS-Form-17: search finds a phrase split across text items |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | SOFT WARN | soft only, 1 linked check(s) passed; warn: compress-lincoln-scan: shrinks a scanned/image-heavy file by 10%+ (saved 1%); compress-fips-scan: shrinks a scanned/image-heavy file by 10%+ (saved 0%) (+5 more) |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT REPRODUCED | 105 linked check(s) passed, e.g. merge-damaged-xref: passed; intake-forms/annotation-button-widget.pdf: accepted |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT REPRODUCED | 159 linked check(s) passed, e.g. watermark-tracemonkey: mark inside the visible page; watermark-rotation-quirk: mark inside the visible page |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT REPRODUCED | 120 linked check(s) passed, e.g. watermark-cyrillic: non-Latin mark present; c-watermark-text-zh: text extracts back (pdf.js) |
| 10 | OCR English only, assets from CDN (not offline) | SOFT WARN | soft only, 4 linked check(s) passed; warn: ocr-fax-printed: no network fetches outside the page origin (https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js, https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js, https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz); ocr-fips-printed: no network fetches outside |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | SOFT WARN | soft only, 0 linked check(s) passed; warn: ocr-darwin-with-text-layer: skips pages that already have text (33 words before, +32 added); ocr-born-digital-invoice: skips pages that already have text (105 words before, +105 added) (+1 more) |
| 12 | Merge/split drop outlines, AcroForm, links | NOT REPRODUCED | 6 linked check(s) passed, e.g. merge-outlines: bookmarks kept; merge-forms: form fields kept |
| 13 | Crop rejects rotated, ignores box origin | SOFT WARN | soft only, 34 linked check(s) passed; warn: c-crop-rot90-cropbox: content inside the box stays where it was seen (5 of 46 words off p3 "models" want (0.516, 0.210) got (0.516, 0.154); p3 "pre-trained" want (0.516, 0.357) got (0.516, 0.301); p3 "with" want (0.516, 0.565) got (0.516, 0.509)) |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | SOFT WARN | soft only, 36 linked check(s) passed; warn: pdf2word-tracemonkey-2col: column lines stay in reading order (30 of 43 line joins kept); pdf2word-bert-2col: column lines stay in reading order (35 of 59 line joins kept) |
| 16 | PDF to Excel number parsing loses leading zeros / formats | SOFT WARN | soft only, 20 linked check(s) passed; warn: pdf2excel-aws-invoice: leading-zero / long ids kept as text (lost 0000) |
| 17 | PDF to PPT slides are flat images, fixed slide size | SOFT WARN | soft only, 13 linked check(s) passed; warn: pdf2ppt-rotation-mixed: mixed page shapes each fit their slide (2 page aspects, one slide size) |
| 18 | Office to PDF quick mode is screenshots (no text) | SOFT WARN | soft only, 15 linked check(s) passed; warn: excel2pdf-quick-poi-SampleSS.xlsx: selectable text (coverage 0.00); ppt2pdf-quick-poi-SampleShow.pptx: selectable text (coverage 0.00) (+7 more) |
| 19 | HiFi engine from unpinned CDN, font substitution | SOFT WARN | soft only, 19 linked check(s) passed; warn: office-engine-load: no fetches outside the page origin (cdn.zetaoffice.net) |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT REPRODUCED | 15 linked check(s) passed, e.g. pdf2md-noembed-sjis: words carried over (85%+); pdf2md-noembed-eucjp: words carried over (85%+) |
| 21 | Forms: XFA not handled, slow widget map | CONFIRMED | forms-fill-xfa-imm1344e: found text fields to fill (0) |
| 22 | Protect: comma in password splits MuPDF options | NOT REPRODUCED | 1 linked check(s) passed, e.g. protect-comma-password: comma password refused with a clear message |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | SOFT WARN | soft only, 21 linked check(s) passed; warn: img2pdf-photo-24MP-punjab-smartphone.jpg: fit page is a sane paper size (<= 17 in) (40.1 x 26.7 in); img2pdf-photo-castle-3456x2628.jpg: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) (+1 more) |
| 24 | Sign is visual only, one placement | NOT REPRODUCED | 3 linked check(s) passed, e.g. g3-sign-multi-rot90: signature and initials on page 1; g3-sign-multi-rot90: initials on every page, where placed |
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 25 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (5.5x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (11.4x input) (+1 more) |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | SOFT WARN | soft only, 0 linked check(s) passed; warn: repair-budget-bookmarks: bookmarks kept (0 of 27); repair-fw9-form: form fields kept (0 of 23) |
| 27 | Compare by page index only; inserted page breaks the rest | CONFIRMED | compare-inserted-page: only the inserted page differs (changed pages 3,4,5,6)<br>compare-dense-econ-self: compare runs (TypeError: Cannot read properties of undefined (reading 'text'))<br>compare-dense-econ-self: compare runs: TypeError: Cannot read properties of undefined (reading 'text') |
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

## Failures by tool

- **unlock** (1): `unlock-saslprep-r6` error: Wrong password, the file stays locked.
- **forms** (1): `forms-fill-xfa-imm1344e` found text fields to fill: 0
- **compare** (2): `compare-inserted-page` only the inserted page differs: changed pages 3,4,5,6; `compare-dense-econ-self` compare runs: TypeError: Cannot read properties of undefined (reading 'text')

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 30.5s, heap 25 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 2.4s, heap 26 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 1.4s, heap 20 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>excel2pdf-hifi-poi-Tables.xlsx</sub> | PASS | 15 pages, 71 KB, text coverage 1.00 | 3.5s, heap 20 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>word2pdf-hifi-poi-VariousPictures.docx</sub> | PASS | 1 pages, 88 KB, text coverage 1.00 | 1.0s, heap 20 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>excel2pdf-hifi-poi-WithThreeCharts.xlsx</sub> | PASS | 3 pages, 27 KB, text coverage undefined | 0.8s, heap 20 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>ppt2pdf-hifi-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 157 KB, text coverage undefined | 1.1s, heap 19 MB |
| word2pdf | poi-chartex.docx<br><sub>word2pdf-hifi-poi-chartex.docx</sub> | PASS | 3 pages, 67 KB, text coverage 1.00 | 2.7s, heap 20 MB |
| excel2pdf | poi-picture.xlsx<br><sub>excel2pdf-hifi-poi-picture.xlsx</sub> | PASS | 3 pages, 315 KB, text coverage 1.00 | 0.7s, heap 20 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>ppt2pdf-hifi-poi-pie-chart.pptx</sub> | PASS | 1 pages, 15 KB, text coverage 1.00 | 0.8s, heap 20 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 1.2s, heap 20 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>word2pdf-hifi-poi-table_footnotes.docx</sub> | PASS | 1 pages, 11 KB, text coverage 1.00 | 1.4s, heap 20 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>ppt2pdf-hifi-poi-table_test.pptx</sub> | PASS | 1 pages, 7 KB, text coverage undefined | 4.5s, heap 20 MB |
| word2pdf | -<br><sub>i-engine-pinned-warm-boot</sub> | PASS | cold boot 20885 ms (download 5020 ms, cache false), warm boot 14408 ms | 35.4s, heap 26 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-convert-no-network</sub> | PASS |  | 1.1s, heap 22 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>i-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 2931 ms, fonts Carlito-Bold Carlito | 3.1s, heap 23 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>i-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 1121 ms, fonts Carlito-Italic Carlito LiberationSans NotoSans-Regular | 1.3s, heap 23 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>i-hifi-poi-Tables.xlsx</sub> | PASS | 15 pages, 2298 ms, fonts LiberationSerif-Bold LiberationSerif-Italic LiberationSerif | 2.4s, heap 23 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>i-hifi-poi-VariousPictures.docx</sub> | PASS | 1 pages, 421 ms, fonts Carlito | 0.6s, heap 23 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>i-hifi-poi-WithThreeCharts.xlsx</sub> | PASS | 3 pages, 562 ms, fonts Carlito-Bold Carlito | 0.7s, heap 22 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>i-hifi-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 859 ms, fonts Carlito | 1.0s, heap 23 MB |
| word2pdf | poi-chartex.docx<br><sub>i-hifi-poi-chartex.docx</sub> | PASS | 3 pages, 2551 ms, fonts Carlito LiberationSerif OpenSymbol | 2.7s, heap 23 MB |
| excel2pdf | poi-picture.xlsx<br><sub>i-hifi-poi-picture.xlsx</sub> | PASS | 3 pages, 978 ms, fonts Carlito LiberationSans-Bold LiberationSans-Italic LiberationSans | 1.4s, heap 23 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>i-hifi-poi-pie-chart.pptx</sub> | PASS | 1 pages, 562 ms, fonts Carlito-Bold Carlito | 0.7s, heap 22 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-poi-sample.docx</sub> | PASS | 1 pages, 396 ms, fonts Carlito | 0.6s, heap 23 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>i-hifi-poi-table_footnotes.docx</sub> | PASS | 1 pages, 191 ms, fonts Carlito | 0.2s, heap 22 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>i-hifi-poi-table_test.pptx</sub> | PASS | 1 pages, 583 ms, fonts none | 0.7s, heap 23 MB |
| word2pdf | -<br><sub>i-font-probe-docx</sub> | PASS | per line: Calibri=BAAAAA+Carlito, Calibri Light=BAAAAA+Carlito, Cambria=CAAAAA+Caladea-Regular, Aptos=DAAAAA+NotoSans-Regular, SimSun=EAAAAA+NotoSerif-Regular, MS Gothic=DAAAAA+NotoSans-Regular, Malgun Gothic=DAAAAA+NotoSans-Regular, Mangal=DAAAAA+NotoSans-Regular; embedded: Caladea-Regular, Carlito, NotoSans-Regular, NotoSansKR-Regular, NotoSansSC-Regular, NotoSerif-Regular; warn: Devanagari text | 0.5s, heap 23 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-styled-report</sub> | PASS | 1 page(s), 43 KB, 459 ms, coverage 0.98 | 1.5s, heap 26 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-long-page</sub> | PASS | 23 pages, 478 KB, 1678 ms | 1.9s, heap 27 MB |
| word2pdf | poi-sample.docx<br><sub>i-engine-hang-restart</sub> | PASS | reboot + convert 12335 ms | 12.4s, heap 31 MB |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf + arxiv-1512.03385-resnet.pdf<br><sub>merge-reports</sub> | PASS | 42 pages, 2.2 MB | 16.5s, heap 15 MB |
| merge | pdfjs-rotation.pdf + pdfjs-hello_world_rotated.pdf + rot90-cropbox-bert.pdf<br><sub>merge-rotated</sub> | PASS | 23 pages, 648 KB | 1.7s, heap 7 MB |
| merge | pdfjs-nested_outline.pdf + us-budget-2024.pdf<br><sub>merge-outlines</sub> | PASS | 193 pages, 1.9 MB | 18.7s, heap 23 MB |
| merge | irs-fw9.pdf + irs-f1040sa.pdf<br><sub>merge-forms</sub> | PASS | 7 pages, 89 KB | 0.4s, heap 38 MB |
| merge | 911-commission-report.pdf + us-economic-report-president-2024.pdf<br><sub>merge-large</sub> | PASS | 1072 pages, 7.0 MB | 24.1s, heap 57 MB |
| merge | owner-only-tracemonkey.pdf + pdfjs-TAMReview.pdf<br><sub>merge-owner-only</sub> | PASS | 37 pages, 1.5 MB | 1.7s, heap 15 MB |
| merge | pdfjs-xref_command_missing.pdf + pdfjs-tracemonkey.pdf<br><sub>merge-damaged-xref</sub> | PASS | 15 pages, 940 KB | 0.7s, heap 16 MB |
| merge | pdf20-simple.pdf + pdf20-offset-start.pdf + pdf20-incremental-save.pdf<br><sub>merge-pdf20</sub> | PASS | 3 pages, 5 KB | 3.0s, heap 15 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | PASS | 14 pages -> 7 + 7 | 1.6s, heap 7 MB |
| split | us-budget-2024.pdf<br><sub>split-budget-bookmarks</sub> | PASS | 184 pages -> 92 + 92 | 10.7s, heap 51 MB |
| split | 911-commission-report.pdf<br><sub>split-911-large</sub> | PASS | 585 pages -> 292 + 293 | 3.9s, heap 49 MB |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 1.7s, heap 7 MB |
| split | irs-f1040.pdf<br><sub>split-form-f1040</sub> | PASS | 2 pages -> 1 + 1 | 0.9s, heap 59 MB |
| split | crooked-paths-1648-104MB.pdf<br><sub>split-crooked-104MB</sub> | PASS | 255 pages -> 127 + 128 | 22.5s, heap 13 MB |
| split | explorations-bible-lands-956pp-62MB.pdf<br><sub>split-bible-956p-62MB</sub> | PASS | 956 pages -> 478 + 478 | 18.1s, heap 31 MB |
| thumbs | 911-commission-report.pdf<br><sub>thumbs-911-585p</sub> | PASS | 100 previews in 5.0 s | 6.1s, heap 11 MB |
| thumbs | explorations-bible-lands-956pp-62MB.pdf<br><sub>thumbs-bible-956p-62MB</sub> | PASS | 100 previews in 148.4 s | 150.5s, heap 8 MB |
| thumbs | explorations-bible-lands-956pp-62MB.pdf<br><sub>thumbs-cancel-on-remove-956p</sub> | PASS |  | 11.3s, heap 7 MB |
| extract | us-budget-2024.pdf<br><sub>extract-budget-1-3-5</sub> | PASS | 3 pages out | 2.8s, heap 16 MB |
| extract | pdfjs-rotation.pdf<br><sub>extract-rotation-2</sub> | PASS | 1 pages out | 0.7s, heap 7 MB |
| extract | darwin-origin-of-species-ia.pdf<br><sub>extract-darwin-scan</sub> | PASS | 3 pages out | 6.1s, heap 11 MB |
| remove | pdfjs-tracemonkey.pdf<br><sub>remove-tracemonkey-p1</sub> | PASS | 13 pages out | 1.4s, heap 7 MB |
| remove | 911-commission-report.pdf<br><sub>remove-911-first10</sub> | PASS | 575 pages out | 2.7s, heap 21 MB |
| rotate | pdfjs-rotation.pdf<br><sub>rotate-rotation-quirk</sub> | PASS | 2 pages out | 0.8s, heap 7 MB |
| rotate | rot90-cropbox-bert.pdf<br><sub>rotate-rot90-cropbox</sub> | PASS | 16 pages out | 0.3s, heap 8 MB |
| rotate | pdfjs-hello_world_rotated.pdf<br><sub>rotate-hello-rotated</sub> | PASS | 5 pages out | 7.0s, heap 7 MB |
| organize | pdfjs-tracemonkey.pdf<br><sub>organize-reverse-tracemonkey</sub> | PASS | 14 pages out | 2.2s, heap 7 MB |
| organize | irs-fw4.pdf<br><sub>organize-reverse-fw4</sub> | PASS | 5 pages out | 0.6s, heap 12 MB |
| compress | lincoln-ellsworth-letter-1861.pdf<br><sub>compress-lincoln-scan</sub> | PASS | 529 KB -> 526 KB (99%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 1%) | 3.0s, heap 8 MB |
| compress | fips-document-facsimile-transmission.pdf<br><sub>compress-fips-scan</sub> | PASS | 4.2 MB -> 4.2 MB (100%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 0%) | 4.0s, heap 8 MB |
| compress | queen-victoria-peabody-letter-1866.pdf<br><sub>compress-queen-victoria-scan</sub> | PASS | 5.7 MB -> 5.7 MB (100%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 0%) | 3.1s, heap 8 MB |
| compress | darwin-origin-of-species-ia.pdf<br><sub>compress-darwin-24MB</sub> | PASS | 24.2 MB -> 24.0 MB (99%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 1%) | 18.1s, heap 8 MB |
| compress | 19th-century-young-man-57MB.pdf<br><sub>compress-young-man-57MB</sub> | PASS | 54.8 MB -> 54.7 MB (100%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 0%) | 10.3s, heap 8 MB |
| compress | explorations-bible-lands-956pp-62MB.pdf<br><sub>compress-bible-lands-62MB</sub> | PASS | 59.8 MB -> 59.8 MB (100%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 0%) | 32.7s, heap 8 MB |
| compress | crooked-paths-1648-104MB.pdf<br><sub>compress-crooked-104MB</sub> | PASS | 99.3 MB -> 99.1 MB (100%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 0%) | 29.0s, heap 8 MB |
| compress | arxiv-2307.09288-llama2.pdf<br><sub>compress-llama2</sub> | PASS | 13.0 MB -> 12.6 MB (97%) | 6.6s, heap 8 MB |
| compress | ipcc-ar6-synthesis-longer-report.pdf<br><sub>compress-ipcc</sub> | PASS | 5.0 MB -> 3.2 MB (65%) | 4.8s, heap 9 MB |
| compress | us-economic-report-president-2024.pdf<br><sub>compress-econ-report</sub> | PASS | 4.9 MB -> 4.9 MB (100%), already optimized - kept the original | 22.1s, heap 8 MB |
| compress | pdfjs-tracemonkey.pdf<br><sub>compress-raster-tracemonkey</sub> | PASS | 992 KB -> 992 KB (100%), kept original | 3.6s, heap 10 MB |
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | PASS | recovered 1, rasterized 0, lost 0 | 0.8s, heap 7 MB |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | PASS |  | 0.1s |
| repair | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>repair-fuzzed-395</sub> | PASS |  | 1.4s |
| repair | pdfjs-bug1020226.pdf<br><sub>repair-bug1020226</sub> | PASS |  | 0.8s |
| repair | pdfjs-Pages-tree-refs.pdf<br><sub>repair-pages-tree-refs</sub> | PASS | recovered 1, rasterized 0, lost 1 | 0.9s, heap 7 MB |
| repair | pdf20-offset-start.pdf<br><sub>repair-offset-start</sub> | PASS | recovered 1, rasterized 0, lost 0 | 0.1s, heap 8 MB |
| repair | us-budget-2024.pdf<br><sub>repair-budget-bookmarks</sub> | PASS | recovered 184, rasterized 0, lost 0; warn: bookmarks kept (0 of 27) | 1.4s, heap 8 MB |
| repair | irs-fw9.pdf<br><sub>repair-fw9-form</sub> | PASS | recovered 6, rasterized 0, lost 0; warn: form fields kept (0 of 23) | 0.2s, heap 8 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-tracemonkey</sub> | PASS | 14 marks | 0.9s, heap 7 MB |
| watermark | pdfjs-rotation.pdf<br><sub>watermark-rotation-quirk</sub> | PASS | 2 marks | 0.6s, heap 7 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>watermark-rot90-cropbox</sub> | PASS | 16 marks | 0.4s, heap 10 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>watermark-origin-shift</sub> | PASS | 1 marks | 0.7s, heap 7 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>watermark-issue1155r-origin</sub> | PASS | 1 marks | 0.7s, heap 7 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-cyrillic</sub> | PASS |  | 1.2s, heap 10 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-0</sub> | PASS | 16 marks | 0.6s, heap 15 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-45</sub> | PASS | 16 marks | 0.7s, heap 9 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-90</sub> | PASS | 16 marks | 1.4s, heap 11 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox--30</sub> | PASS | 16 marks | 0.5s, heap 10 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-0</sub> | PASS | 5 marks | 0.4s, heap 11 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-45</sub> | PASS | 5 marks | 0.1s, heap 12 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-90</sub> | PASS | 5 marks | 0.2s, heap 12 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90--30</sub> | PASS | 5 marks | 0.1s, heap 15 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-0</sub> | PASS | 2 marks | 0.1s, heap 15 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-45</sub> | PASS | 2 marks | 0.2s, heap 11 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-90</sub> | PASS | 2 marks | 0.1s, heap 13 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk--30</sub> | PASS | 2 marks | 0.1s, heap 12 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-0</sub> | PASS | 1 marks | 0.1s, heap 13 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-45</sub> | PASS | 1 marks | 0.3s, heap 12 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-90</sub> | PASS | 1 marks | 0.1s, heap 15 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop--30</sub> | PASS | 1 marks | 0.4s, heap 11 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-0</sub> | PASS | 1 marks | 0.1s, heap 16 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-45</sub> | PASS | 1 marks | 0.2s, heap 12 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-90</sub> | PASS | 1 marks | 0.1s, heap 13 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift--30</sub> | PASS | 1 marks | 0.1s, heap 10 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-0</sub> | PASS | 1 marks | 1.0s, heap 13 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-45</sub> | PASS | 1 marks | 1.1s, heap 12 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-90</sub> | PASS | 1 marks | 0.6s, heap 10 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin--30</sub> | PASS | 1 marks | 0.5s, heap 16 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-0</sub> | PASS | 2 marks | 0.1s, heap 11 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-45</sub> | PASS | 2 marks | 0.3s, heap 15 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-90</sub> | PASS | 2 marks | 0.1s, heap 12 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin--30</sub> | PASS | 2 marks | 0.1s, heap 18 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-0</sub> | PASS | 2 marks | 0.2s, heap 16 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-45</sub> | PASS | 2 marks | 0.4s, heap 11 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-90</sub> | PASS | 2 marks | 0.3s, heap 10 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox--30</sub> | PASS | 2 marks | 0.1s, heap 13 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-0</sub> | PASS | 5 marks | 0.5s, heap 11 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-45</sub> | PASS | 5 marks | 0.2s, heap 8 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-90</sub> | PASS | 5 marks | 0.4s, heap 12 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed--30</sub> | PASS | 5 marks | 0.2s, heap 12 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-0</sub> | PASS | 2 marks | 0.3s, heap 11 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-45</sub> | PASS | 2 marks | 0.3s, heap 13 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-90</sub> | PASS | 2 marks | 0.1s, heap 13 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed--30</sub> | PASS | 2 marks | 0.3s, heap 9 MB |
| watermark | us-budget-2024.pdf<br><sub>c-watermark-budget-mixed-rot-45</sub> | PASS | 40 marks | 5.7s, heap 49 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-tile-c-mixed</sub> | PASS |  | 0.2s, heap 13 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-tile-rot90-cropbox</sub> | PASS |  | 0.7s, heap 14 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-zh</sub> | PASS |  | 0.9s, heap 49 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ja</sub> | PASS |  | 1.6s, heap 12 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ko</sub> | PASS |  | 0.7s, heap 15 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar</sub> | PASS |  | 1.8s, heap 15 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar-mixed</sub> | PASS |  | 0.7s, heap 37 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar-decimal</sub> | PASS |  | 1.1s, heap 12 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar-digits</sub> | PASS |  | 0.6s, heap 12 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-he-date</sub> | PASS |  | 1.1s, heap 12 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-zh-hant</sub> | PASS |  | 0.7s, heap 49 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ko-hanja</sub> | PASS |  | 0.9s, heap 14 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-bn</sub> | PASS |  | 1.2s, heap 16 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ta</sub> | PASS |  | 0.6s, heap 14 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-th</sub> | PASS |  | 0.7s, heap 57 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-symbols</sub> | PASS |  | 0.8s, heap 13 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-he</sub> | PASS |  | 0.6s, heap 15 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-hi</sub> | PASS |  | 0.6s, heap 19 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ru</sub> | PASS |  | 0.8s, heap 43 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-mixed</sub> | PASS |  | 0.7s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>pagenumbers-tracemonkey</sub> | PASS |  | 2.0s, heap 7 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>pagenumbers-rotation-quirk</sub> | PASS |  | 0.8s, heap 7 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>pagenumbers-rot90-cropbox</sub> | PASS |  | 0.3s, heap 11 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>pagenumbers-origin-shift</sub> | PASS |  | 0.9s, heap 7 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>pagenumbers-issue1155r-origin</sub> | PASS |  | 0.8s, heap 7 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>c-pagenumbers-rot90-cropbox-bottom-center</sub> | PASS |  | 0.3s, heap 8 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>c-pagenumbers-rot90-cropbox-top-right</sub> | PASS |  | 0.4s, heap 10 MB |
| pagenumbers | pdfjs-hello_world_rotated.pdf<br><sub>c-pagenumbers-hello-rot90-bottom-center</sub> | PASS |  | 0.2s, heap 10 MB |
| pagenumbers | pdfjs-hello_world_rotated.pdf<br><sub>c-pagenumbers-hello-rot90-top-right</sub> | PASS |  | 0.1s, heap 11 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>c-pagenumbers-rotation-quirk-bottom-center</sub> | PASS |  | 0.1s, heap 10 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>c-pagenumbers-rotation-quirk-top-right</sub> | PASS |  | 0.1s, heap 10 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>c-pagenumbers-issue1155r-crop-bottom-center</sub> | PASS |  | 0.1s, heap 12 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>c-pagenumbers-issue1155r-crop-top-right</sub> | PASS |  | 0.2s, heap 12 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>c-pagenumbers-origin-shift-bottom-center</sub> | PASS |  | 0.1s, heap 10 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>c-pagenumbers-origin-shift-top-right</sub> | PASS |  | 0.1s, heap 11 MB |
| pagenumbers | xfa-imm1344e-filled.pdf<br><sub>c-pagenumbers-xfa-origin-bottom-center</sub> | PASS |  | 0.4s, heap 12 MB |
| pagenumbers | xfa-imm1344e-filled.pdf<br><sub>c-pagenumbers-xfa-origin-top-right</sub> | PASS |  | 0.3s, heap 11 MB |
| pagenumbers | c-rot180-origin.pdf<br><sub>c-pagenumbers-c-rot180-origin-bottom-center</sub> | PASS |  | 1.0s, heap 10 MB |
| pagenumbers | c-rot180-origin.pdf<br><sub>c-pagenumbers-c-rot180-origin-top-right</sub> | PASS |  | 0.1s, heap 11 MB |
| pagenumbers | c-rot270-cropbox.pdf<br><sub>c-pagenumbers-c-rot270-cropbox-bottom-center</sub> | PASS |  | 0.3s, heap 13 MB |
| pagenumbers | c-rot270-cropbox.pdf<br><sub>c-pagenumbers-c-rot270-cropbox-top-right</sub> | PASS |  | 0.2s, heap 12 MB |
| pagenumbers | c-mixed.pdf<br><sub>c-pagenumbers-c-mixed-bottom-center</sub> | PASS |  | 0.3s, heap 11 MB |
| pagenumbers | c-mixed.pdf<br><sub>c-pagenumbers-c-mixed-top-right</sub> | PASS |  | 0.4s, heap 13 MB |
| pagenumbers | fax-jean-schmidt-doe.pdf<br><sub>c-pagenumbers-fax-mixed-bottom-center</sub> | PASS |  | 0.1s, heap 15 MB |
| pagenumbers | fax-jean-schmidt-doe.pdf<br><sub>c-pagenumbers-fax-mixed-top-right</sub> | PASS |  | 0.1s, heap 11 MB |
| pagenumbers | us-budget-2024.pdf<br><sub>c-pagenumbers-budget-mixed-rot-bottom-center</sub> | PASS |  | 8.9s, heap 51 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-zh</sub> | PASS |  | 0.9s, heap 8 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ja</sub> | PASS |  | 1.3s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ko</sub> | PASS |  | 0.7s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar</sub> | PASS |  | 2.1s, heap 51 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar-mixed</sub> | PASS |  | 1.1s, heap 15 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar-decimal</sub> | PASS |  | 1.4s, heap 13 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar-digits</sub> | PASS |  | 0.6s, heap 11 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-he-date</sub> | PASS |  | 1.3s, heap 18 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-zh-hant</sub> | PASS |  | 0.7s, heap 19 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ko-hanja</sub> | PASS |  | 1.1s, heap 16 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-bn</sub> | PASS |  | 1.2s, heap 14 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ta</sub> | PASS |  | 0.6s, heap 27 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-th</sub> | PASS |  | 0.8s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-symbols</sub> | PASS |  | 0.6s, heap 13 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-he</sub> | PASS |  | 0.6s, heap 17 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-hi</sub> | PASS |  | 4.7s, heap 16 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ru</sub> | PASS |  | 0.7s, heap 14 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-mixed</sub> | PASS |  | 0.7s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-template-skip</sub> | PASS |  | 0.6s, heap 25 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-facing</sub> | PASS |  | 4.6s, heap 16 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>g3-pagenumbers-bates-rot90</sub> | PASS |  | 1.5s, heap 14 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-margin-big</sub> | PASS |  | 0.6s, heap 19 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 2.1s, heap 7 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 0.2s, heap 11 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | PASS | centre (0.50, 0.85) | 1.7s, heap 7 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>sign-origin-shift</sub> | PASS | centre (0.50, 0.85) | 0.6s, heap 7 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>sign-issue1155r-origin</sub> | PASS | centre (0.50, 0.85) | 1.1s, heap 8 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>c-sign-rot90-cropbox</sub> | PASS |  | 0.3s, heap 9 MB |
| sign | pdfjs-hello_world_rotated.pdf<br><sub>c-sign-hello-rot90</sub> | PASS |  | 0.1s, heap 9 MB |
| sign | pdfjs-rotation.pdf<br><sub>c-sign-rotation-quirk</sub> | PASS |  | 0.1s, heap 11 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>c-sign-issue1155r-crop</sub> | PASS |  | 0.1s, heap 9 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>c-sign-origin-shift</sub> | PASS |  | 0.1s, heap 12 MB |
| sign | xfa-imm1344e-filled.pdf<br><sub>c-sign-xfa-origin</sub> | PASS |  | 0.3s, heap 10 MB |
| sign | c-rot180-origin.pdf<br><sub>c-sign-c-rot180-origin</sub> | PASS |  | 0.1s, heap 12 MB |
| sign | c-rot270-cropbox.pdf<br><sub>c-sign-c-rot270-cropbox</sub> | PASS |  | 0.2s, heap 10 MB |
| sign | c-mixed.pdf<br><sub>c-sign-c-mixed</sub> | PASS |  | 0.4s, heap 11 MB |
| sign | fax-jean-schmidt-doe.pdf<br><sub>c-sign-fax-mixed</sub> | PASS |  | 0.1s, heap 8 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>g3-sign-multi-rot90</sub> | PASS |  | 0.5s, heap 9 MB |
| crop | pdfjs-tracemonkey.pdf<br><sub>crop-tracemonkey</sub> | PASS | CropBox 61,317,367,713 | 1.2s, heap 7 MB |
| crop | pdfjs-rotation.pdf<br><sub>crop-rotation-quirk</sub> | PASS | CropBox 61,317,367,713 | 0.7s, heap 7 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>crop-rot90-cropbox</sub> | PASS | CropBox 93,135,358,511 | 16.3s, heap 7 MB |
| crop | origin-shift-aws-invoice.pdf<br><sub>crop-origin-shift</sub> | PASS | CropBox 261,617,567,1013 | 0.1s, heap 11 MB |
| crop | pdfjs-issue1155r.pdf<br><sub>crop-issue1155r-origin</sub> | PASS | CropBox 60,337,357,758 | 0.8s, heap 7 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>c-crop-rot90-cropbox</sub> | PASS | 46 words checked; warn: content inside the box stays where it was seen (5 of 46 words off p3 "models" want (0.516, 0.210) got (0.516, 0.154); p3 "pre-trained" want (0.516, 0.357) got (0.516, 0.301); p3 "with" want (0.516, 0.565) got (0.516, 0.509)) | 0.4s, heap 8 MB |
| crop | pdfjs-hello_world_rotated.pdf<br><sub>c-crop-hello-rot90</sub> | PASS | 0 words checked | 0.1s, heap 8 MB |
| crop | pdfjs-rotation.pdf<br><sub>c-crop-rotation-quirk</sub> | PASS | 2 words checked | 0.2s, heap 9 MB |
| crop | pdfjs-issue1155r.pdf<br><sub>c-crop-issue1155r-crop</sub> | PASS | 0 words checked | 0.1s, heap 11 MB |
| crop | origin-shift-aws-invoice.pdf<br><sub>c-crop-origin-shift</sub> | PASS | 3 words checked | 0.3s, heap 10 MB |
| crop | xfa-imm1344e-filled.pdf<br><sub>c-crop-xfa-origin</sub> | PASS | 0 words checked | 0.3s, heap 8 MB |
| crop | c-rot180-origin.pdf<br><sub>c-crop-c-rot180-origin</sub> | PASS | 6 words checked | 0.1s, heap 8 MB |
| crop | c-rot270-cropbox.pdf<br><sub>c-crop-c-rot270-cropbox</sub> | PASS | 6 words checked | 0.1s, heap 11 MB |
| crop | c-mixed.pdf<br><sub>c-crop-c-mixed</sub> | PASS | 15 words checked | 0.3s, heap 10 MB |
| crop | fax-jean-schmidt-doe.pdf<br><sub>c-crop-fax-mixed</sub> | PASS | 6 words checked | 0.1s, heap 9 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>edit-tracemonkey</sub> | PASS |  | 1.7s, heap 7 MB |
| edit | pdfjs-rotation.pdf<br><sub>edit-rotation-quirk</sub> | PASS |  | 0.9s, heap 7 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>edit-rot90-cropbox</sub> | PASS |  | 0.9s, heap 7 MB |
| edit | origin-shift-aws-invoice.pdf<br><sub>edit-origin-shift</sub> | PASS |  | 0.7s, heap 7 MB |
| edit | pdfjs-issue1155r.pdf<br><sub>edit-issue1155r-origin</sub> | PASS |  | 0.1s, heap 10 MB |
| edit | udhr-chinese-simplified.pdf<br><sub>edit-cjk-text</sub> | PASS |  | 0.7s, heap 10 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>c-edit-rot90-cropbox-p1</sub> | PASS |  | 0.5s, heap 11 MB |
| edit | pdfjs-hello_world_rotated.pdf<br><sub>c-edit-hello-rot90-p1</sub> | PASS |  | 0.1s, heap 8 MB |
| edit | pdfjs-rotation.pdf<br><sub>c-edit-rotation-quirk-p1</sub> | PASS |  | 0.1s, heap 11 MB |
| edit | pdfjs-issue1155r.pdf<br><sub>c-edit-issue1155r-crop-p1</sub> | PASS |  | 0.1s, heap 11 MB |
| edit | origin-shift-aws-invoice.pdf<br><sub>c-edit-origin-shift-p1</sub> | PASS |  | 0.3s, heap 11 MB |
| edit | xfa-imm1344e-filled.pdf<br><sub>c-edit-xfa-origin-p1</sub> | PASS |  | 0.8s, heap 12 MB |
| edit | c-rot180-origin.pdf<br><sub>c-edit-c-rot180-origin-p1</sub> | PASS |  | 0.2s, heap 9 MB |
| edit | c-rot270-cropbox.pdf<br><sub>c-edit-c-rot270-cropbox-p1</sub> | PASS |  | 0.4s, heap 14 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p1</sub> | PASS |  | 0.4s, heap 13 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p2</sub> | PASS |  | 0.2s, heap 11 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p3</sub> | PASS |  | 0.2s, heap 12 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p4</sub> | PASS |  | 0.4s, heap 11 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p5</sub> | PASS |  | 0.2s, heap 14 MB |
| edit | fax-jean-schmidt-doe.pdf<br><sub>c-edit-fax-mixed-p1</sub> | PASS |  | 0.5s, heap 13 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-zh</sub> | PASS |  | 0.9s, heap 9 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ja</sub> | PASS |  | 0.7s, heap 13 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ko</sub> | PASS |  | 0.8s, heap 13 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar</sub> | PASS |  | 0.7s, heap 11 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar-mixed</sub> | PASS |  | 1.8s, heap 14 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar-decimal</sub> | PASS |  | 0.5s, heap 14 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar-digits</sub> | PASS |  | 0.7s, heap 17 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-he-date</sub> | PASS |  | 1.1s, heap 16 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-zh-hant</sub> | PASS |  | 1.0s, heap 16 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ko-hanja</sub> | PASS |  | 0.8s, heap 16 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-bn</sub> | PASS |  | 1.0s, heap 17 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ta</sub> | PASS |  | 0.6s, heap 18 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-th</sub> | PASS |  | 0.6s, heap 13 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-symbols</sub> | PASS |  | 2.8s, heap 13 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-he</sub> | PASS |  | 0.9s, heap 12 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-hi</sub> | PASS |  | 0.5s, heap 20 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ru</sub> | PASS |  | 0.6s, heap 14 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-mixed</sub> | PASS |  | 1.7s, heap 13 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | PASS | Standard V5 R6 256-bit AES | 3.3s, heap 8 MB |
| protect | 911-commission-report.pdf<br><sub>protect-911-large</sub> | PASS | Standard V5 R6 256-bit AES | 0.8s, heap 8 MB |
| protect | owner-only-irs-fw9.pdf<br><sub>protect-owner-only-input</sub> | PASS | Standard V5 R6 256-bit AES | 1.4s, heap 7 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 0.5s |
| protect | aws-invoice.pdf<br><sub>protect-unicode-password</sub> | PASS | Standard V5 R6 256-bit AES | 0.4s, heap 8 MB |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | PASS | removed: none listed, had user password | 1.9s, heap 9 MB |
| unlock | pdfjs-issue6010_1.pdf<br><sub>unlock-issue6010_1</sub> | PASS | removed: none listed, had user password | 0.5s, heap 8 MB |
| unlock | pdfjs-issue6010_2.pdf<br><sub>unlock-issue6010_2</sub> | PASS | removed: none listed, had user password | 2.8s, heap 7 MB |
| unlock | pdfjs-bug1782186.pdf<br><sub>unlock-bug1782186</sub> | PASS | removed: none listed, had user password | 2.1s, heap 7 MB |
| unlock | pdfjs-issue21579.pdf<br><sub>unlock-issue21579</sub> | PASS | removed: copying text, editing, annotating, reordering pages, had user password | 0.3s, heap 8 MB |
| unlock | pdfjs-issue15893_reduced.pdf<br><sub>unlock-issue15893_reduced</sub> | PASS | removed: none listed, had user password | 0.7s, heap 7 MB |
| unlock | pdfjs-saslprep-r6.pdf<br><sub>unlock-saslprep-r6</sub> | FAIL | error: Wrong password, the file stays locked. | 0.2s |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | PASS | removed: none listed, had user password | 0.4s, heap 8 MB |
| unlock | pdfjs-empty_protected.pdf<br><sub>unlock-empty-protected</sub> | PASS | removed: copying text, editing, reordering pages | 0.3s, heap 8 MB |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 0.7s, heap 8 MB |
| unlock | owner-only-aws-invoice.pdf<br><sub>unlock-owner-only-invoice</sub> | PASS | removed: printing, high-quality printing, copying text | 0.3s, heap 8 MB |
| unlock | pdfjs-bug1782186.pdf<br><sub>unlock-wrong-password</sub> | PASS |  | 0.1s |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 394 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc"; warn: no network fetches outside the page origin (https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js, https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js, https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz) | 18.0s, heap 9 MB |
| ocr | sub-fips-p5-6.pdf<br><sub>ocr-fips-printed</sub> | PASS | 89 words, sample ". RS-466 PROCEDURES FOR DOCUMENT FACSIMILE TRANSMI"; warn: no network fetches outside the page origin (https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js, https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js, https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz) | 9.5s, heap 12 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>ocr-darwin-with-text-layer</sub> | PASS | 102 words, sample " CONTENTS PAGE EDITOR’S INTRODUCTION . . . 2 3 . "; warn: skips pages that already have text (33 words before, +32 added); no network fetches outside the page origin (https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js, https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js, https://cdn.jsdelivr.net/npm/@tesseract.js-data/en | 9.6s, heap 14 MB |
| ocr | sub-lincoln-p3-4.pdf<br><sub>ocr-lincoln-letter</sub> | PASS | 7 words, sample "re ty LEAT Bh Sn Sey ne ed we WS A Py oD ET ¢ PAE "; warn: some text recognised (+0 words); no network fetches outside the page origin (https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js, https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js, https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata. | 11.9s, heap 24 MB |
| ocr | letter-to-benjamin-glover.pdf<br><sub>ocr-glover-handwritten</sub> | PASS | 164 words, sample "Er dls \ el, 7 pia fo a Ar fot i 7 \| a AC id pit S" | 31.5s, heap 27 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>ocr-ndl-japanese-scan</sub> | PASS | 21 words, sample "A J ee aa En EF ; IPS EVIDENTIARY DOCUMENT no, S68" | 5.0s, heap 24 MB |
| ocr | oyo.pdf<br><sub>ocr-born-digital-invoice</sub> | PASS | 182 words, sample "OoYO PAYMENT RECEIPT Guest Name: Sanjay Date: 31/1"; warn: skips pages that already have text (105 words before, +105 added) | 3.6s, heap 29 MB |
| ocr | udhr-korean.pdf<br><sub>ocr-intl-korean</sub> | PASS | 346 words, sample "Ml Al el Mod HE DE QR THO MEO EAUMHN S550 AEE 5 gl"; warn: skips pages that already have text (0 words before, +34 added) | 31.4s, heap 15 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>pdf2word-tracemonkey-2col</sub> | PASS | coverage 0.94, 11 tables, 88 images; warn: column lines stay in reading order (30 of 43 line joins kept) | 4.8s, heap 11 MB |
| pdf2word | arxiv-1810.04805-bert.pdf<br><sub>pdf2word-bert-2col</sub> | PASS | coverage 0.86, 14 tables, 38 images; warn: column lines stay in reading order (35 of 59 line joins kept) | 2.4s, heap 68 MB |
| pdf2word | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>pdf2word-fdic</sub> | PASS | coverage 0.98, 60 tables, 43 images | 3.5s, heap 15 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice</sub> | PASS | coverage 1.00, 3 tables, 1 images | 0.4s, heap 69 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice-exact</sub> | PASS | coverage 1.00, 0 tables, 1 images | 1.1s, heap 74 MB |
| pdf2word | flipkart-invoice.pdf<br><sub>pdf2word-flipkart</sub> | PASS | coverage 1.00, 1 tables, 6 images | 1.8s, heap 12 MB |
| pdf2word | udhr-arabic.pdf<br><sub>pdf2word-arabic</sub> | PASS | coverage 1.00, 0 tables, 0 images | 1.0s, heap 7 MB |
| pdf2word | udhr-chinese-simplified.pdf<br><sub>pdf2word-chinese</sub> | PASS | coverage 1.00, 0 tables, 0 images | 0.3s, heap 12 MB |
| pdf2word | fax-jean-schmidt-doe.pdf<br><sub>pdf2word-scanned-fax</sub> | PASS |  | 0.4s, heap 19 MB |
| pdf2word | 911-commission-report.pdf<br><sub>pdf2word-911-large</sub> | PASS | coverage 0.97, 16 tables, 34 images | 13.8s, heap 204 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>h-word-tracemonkey-columns</sub> | PASS | 108/109 joins, 2 broken hyphens, 11 tables, 2347 ms | 2.4s, heap 72 MB |
| pdf2word | arxiv-1810.04805-bert.pdf<br><sub>h-word-bert-columns</sub> | PASS | 127/135 joins, 3 broken hyphens, 14 tables, 2811 ms | 3.2s, heap 48 MB |
| pdf2word | arxiv-1706.03762-attention.pdf<br><sub>h-word-attention-columns</sub> | PASS | 48/50 joins, 4 broken hyphens, 9 tables, 1472 ms | 1.8s, heap 79 MB |
| pdf2word | arxiv-1512.03385-resnet.pdf<br><sub>h-word-resnet-columns</sub> | PASS | 110/110 joins, 4 broken hyphens, 24 tables, 782 ms | 0.9s, heap 16 MB |
| pdf2word | aws-invoice.pdf<br><sub>h-word-aws-tables</sub> | PASS | 3 tables, 22 rows, 362 ms | 0.5s, heap 205 MB |
| pdf2word | saeco.pdf<br><sub>h-word-saeco-tables</sub> | PASS | 3 tables, 11 rows, 89 ms | 0.2s, heap 83 MB |
| pdf2word | camelot-bol.pdf<br><sub>h-word-camelot-tables</sub> | PASS | 5 tables, 11 rows, 55 ms | 0.1s, heap 37 MB |
| pdf2word | netpresse-invoice.pdf<br><sub>h-word-netpresse-tables</sub> | PASS | 2 tables, 7 rows, 755 ms | 0.9s, heap 64 MB |
| pdf2word | pdfjs-ArabicCIDTrueType.pdf<br><sub>h-word-arabic-cid-logical</sub> | PASS | 4/4 RTL lines in reading order | 0.2s, heap 210 MB |
| pdf2word | udhr-arabic.pdf<br><sub>h-word-udhr-arabic-logical</sub> | PASS | 278/281 three-word runs in order | 1.0s, heap 67 MB |
| pdf2word | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-word-fdic-speed-furniture</sub> | PASS | 3.7 s, 60 tables, coverage 1.00 | 4.0s, heap 35 MB |
| pdf2word | sub-ndl-konoye-p1.pdf<br><sub>h-word-jpeg-scan-ndl</sub> | PASS | 1 OCR pages, 0 images, 13 words, 1.9 s | 2.1s, heap 25 MB |
| pdf2word | letter-to-benjamin-glover.pdf<br><sub>h-word-jpeg-scan-glover</sub> | PASS | 2 OCR pages, 0 images, 24 words, 54.3 s | 54.4s, heap 28 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 73 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 2.4s, heap 7 MB |
| pdf2excel | flipkart-invoice.pdf<br><sub>pdf2excel-flipkart</sub> | PASS | 1 sheets, 36 cells, coverage 1.00 | 1.6s, heap 7 MB |
| pdf2excel | camelot-bol.pdf<br><sub>pdf2excel-camelot-bol</sub> | PASS | 1 sheets, 64 cells, coverage 1.00 | 3.0s, heap 7 MB |
| pdf2excel | saeco.pdf<br><sub>pdf2excel-saeco</sub> | PASS | 1 sheets, 53 cells, coverage 1.00 | 0.3s, heap 10 MB |
| pdf2excel | free-fiber.pdf<br><sub>pdf2excel-free-fiber</sub> | PASS | 2 sheets, 22 cells, coverage 1.00 | 2.3s, heap 7 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>pdf2excel-fdic</sub> | PASS | 44 sheets, 5302 cells, coverage 0.99 | 4.6s, heap 21 MB |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | PASS | 1 sheets, 22 numbers, 0 numeric text, 0.1 s | 0.2s, heap 9 MB |
| pdf2excel | camelot-bol.pdf<br><sub>h-excel-camelot-eu-typed</sub> | PASS | 1 sheets, 18 numbers, 0 numeric text, 0.1 s | 0.2s, heap 12 MB |
| pdf2excel | netpresse-invoice.pdf<br><sub>h-excel-netpresse-eu-typed</sub> | PASS | 1 sheets, 10 numbers, 0 numeric text, 0.4 s | 0.6s, heap 9 MB |
| pdf2excel | saeco.pdf<br><sub>h-excel-saeco-dates</sub> | PASS | 1 sheets, 14 numbers, 0 numeric text, 0.1 s | 0.3s, heap 9 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-speed-typed</sub> | PASS | 44 sheets, 2860 numbers, 2 numeric text, 2.3 s | 2.6s, heap 22 MB |
| pdf2excel | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>h-excel-fdic-joined</sub> | PASS | 1 sheets, 2680 numbers, 2 numeric text, 4.2 s | 4.5s, heap 56 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>pdf2ppt-tracemonkey</sub> | PASS | 14 slides, 99 images, 2.0 MB | 8.2s, heap 16 MB |
| pdf2ppt | pdfjs-rotation.pdf<br><sub>pdf2ppt-rotation-mixed</sub> | PASS | 2 slides, 1 images, 50 KB; warn: mixed page shapes each fit their slide (2 page aspects, one slide size) | 1.1s, heap 7 MB |
| pdf2ppt | rot90-cropbox-bert.pdf<br><sub>pdf2ppt-rot90-cropbox</sub> | PASS | 16 slides, 50 images, 2.2 MB | 5.1s, heap 23 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>h-ppt-tracemonkey-editable</sub> | PASS | 14 slides, 83231 chars, 99 media, 2.0 MB, 6.0 s | 8.5s, heap 27 MB |
| pdf2ppt | pdfjs-rotation.pdf<br><sub>h-ppt-rotation-mixed-editable</sub> | PASS | 2 slides, 152 chars, 1 media, 50 KB, 0.4 s | 2.1s, heap 7 MB |
| pdf2ppt | aws-invoice.pdf<br><sub>h-ppt-aws-editable</sub> | PASS | 1 slides, 1853 chars, 3 media, 152 KB, 0.5 s | 1.3s, heap 7 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 85800 chars, 14 headings, 11 tables | 2.8s, heap 12 MB |
| pdf2md | us-budget-2024.pdf<br><sub>pdf2md-budget</sub> | PASS | 596818 chars, 29 headings, 125 tables | 7.1s, heap 21 MB |
| pdf2md | aws-invoice.pdf<br><sub>pdf2md-aws-invoice</sub> | PASS | 2076 chars, 5 headings, 3 tables | 1.7s, heap 7 MB |
| pdf2md | udhr-chinese-simplified.pdf<br><sub>pdf2md-chinese</sub> | PASS | 5895 chars, 0 headings, 0 tables | 0.6s, heap 19 MB |
| pdf2md | udhr-japanese.pdf<br><sub>pdf2md-japanese</sub> | PASS | 4587 chars, 0 headings, 0 tables | 0.4s, heap 12 MB |
| pdf2md | pdfjs-noembed-sjis.pdf<br><sub>pdf2md-noembed-sjis</sub> | PASS | 6 chars, 0 headings, 0 tables | 1.3s, heap 7 MB |
| pdf2md | pdfjs-noembed-eucjp.pdf<br><sub>pdf2md-noembed-eucjp</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.2s, heap 8 MB |
| pdf2md | pdfjs-vertical.pdf<br><sub>pdf2md-vertical</sub> | PASS | 20 chars, 0 headings, 0 tables | 0.3s, heap 28 MB |
| pdf2md | udhr-arabic.pdf<br><sub>pdf2md-arabic</sub> | PASS | 8269 chars, 0 headings, 0 tables | 1.4s, heap 16 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | PASS | 85800 chars, 11 tables, 14 headings | 2.7s, heap 12 MB |
| pdf2md | arxiv-1810.04805-bert.pdf<br><sub>h-md-bert-columns</sub> | PASS | 68234 chars, 14 tables, 17 headings | 2.0s, heap 14 MB |
| pdf2md | netpresse-invoice.pdf<br><sub>h-md-netpresse-tables</sub> | PASS | 1472 chars, 2 tables, 0 headings | 0.6s, heap 28 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 62 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.6s, heap 10 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | PASS | 2 pages, 8 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.1s, heap 7 MB |
| excel2pdf | poi-Tables.xlsx<br><sub>excel2pdf-quick-poi-Tables.xlsx</sub> | PASS | 18 pages, 4.6 MB, text coverage 0.00; warn: selectable text (coverage 0.00) | 34.9s, heap 27 MB |
| word2pdf | poi-VariousPictures.docx<br><sub>word2pdf-quick-poi-VariousPictures.docx</sub> | PASS | 1 pages, 295 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.7s, heap 11 MB |
| excel2pdf | poi-WithThreeCharts.xlsx<br><sub>excel2pdf-quick-poi-WithThreeCharts.xlsx</sub> | PASS | 1 pages, 31 KB, text coverage undefined | 1.7s, heap 13 MB |
| ppt2pdf | poi-chart-picture-bg.pptx<br><sub>ppt2pdf-quick-poi-chart-picture-bg.pptx</sub> | PASS | 1 pages, 5 KB, text coverage undefined | 0.9s, heap 10 MB |
| word2pdf | poi-chartex.docx<br><sub>word2pdf-quick-poi-chartex.docx</sub> | PASS | 3 pages, 440 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 10.4s, heap 16 MB |
| excel2pdf | poi-picture.xlsx<br><sub>excel2pdf-quick-poi-picture.xlsx</sub> | PASS | 1 pages, 39 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 1.6s, heap 14 MB |
| ppt2pdf | poi-pie-chart.pptx<br><sub>ppt2pdf-quick-poi-pie-chart.pptx</sub> | PASS | 1 pages, 3 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.2s, heap 12 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | PASS | 1 pages, 251 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 8.2s, heap 12 MB |
| word2pdf | poi-table_footnotes.docx<br><sub>word2pdf-quick-poi-table_footnotes.docx</sub> | PASS | 1 pages, 33 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.6s, heap 14 MB |
| ppt2pdf | poi-table_test.pptx<br><sub>ppt2pdf-quick-poi-table_test.pptx</sub> | PASS | 1 pages, 2 KB, text coverage undefined | 0.3s, heap 11 MB |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | PASS | 1 page(s), 8.5x5.7 in, 455 KB | 2.1s, heap 10 MB |
| img2pdf | heic-nokia-C001.heic<br><sub>img2pdf-heic-nokia-C001.heic</sub> | PASS | 1 page(s), 8.5x4.8 in, 219 KB | 1.2s, heap 7 MB |
| img2pdf | photo-24MP-punjab-smartphone.jpg<br><sub>img2pdf-photo-24MP-punjab-smartphone.jpg</sub> | PASS | 1 page(s), 40.1x26.7 in, 13.9 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (40.1 x 26.7 in) | 6.2s, heap 8 MB |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | PASS | 1 page(s), 23.0x17.5 in, 5.4 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) | 3.0s, heap 7 MB |
| img2pdf | photo-portrait-sepia-1640x2268.jpg<br><sub>img2pdf-photo-portrait-sepia-1640x2268.jpg</sub> | PASS | 1 page(s), 10.9x15.1 in, 1.5 MB, EXIF 1 | 1.9s, heap 8 MB |
| img2pdf | png-alpha-transparency-demo.png<br><sub>img2pdf-png-alpha-transparency-demo.png</sub> | PASS | 1 page(s), 6.6x5.0 in, 424 KB | 1.3s, heap 8 MB |
| img2pdf | png-webp-comparison-2412x1500.png<br><sub>img2pdf-png-webp-comparison-2412x1500.png</sub> | PASS | 1 page(s), 16.1x10.0 in, 4.3 MB | 2.3s, heap 11 MB |
| img2pdf | tiff-multipage-mmap.tiff<br><sub>img2pdf-tiff-multipage-mmap.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB | 0.4s, heap 11 MB |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) | 0.2s, heap 8 MB |
| img2pdf | webp-chandrayaan-rover.webp<br><sub>img2pdf-webp-chandrayaan-rover.webp</sub> | PASS | 1 page(s), 3.7x2.9 in, 59 KB | 0.1s, heap 8 MB |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | PASS | 1 page(s), 0.9x0.9 in, 8 KB | 0.1s, heap 8 MB |
| img2pdf | photo-24MP-punjab-smartphone.jpg + photo-castle-3456x2628.jpg + photo-portrait-sepia-1640x2268.jpg<br><sub>img2pdf-three-photos-a4</sub> | PASS |  | 3.5s, heap 11 MB |
| pdf2img | pdfjs-tracemonkey.pdf<br><sub>pdf2img-tracemonkey</sub> | PASS | ink 10.8%, 13.3% | 1.5s, heap 7 MB |
| pdf2img | rot90-cropbox-bert.pdf<br><sub>pdf2img-rot90-cropbox</sub> | PASS | ink 16.3% | 2.4s, heap 7 MB |
| pdf2img | pdfjs-bug_jpx.pdf<br><sub>pdf2img-jpx</sub> | PASS | ink 1.7% | 0.4s, heap 8 MB |
| pdf2img | pdfjs-jpx_subsampling.pdf<br><sub>pdf2img-jpx-subsampling</sub> | PASS | ink 60.2% | 0.2s, heap 7 MB |
| pdf2img | pdfjs-jpx_smaskindata.pdf<br><sub>pdf2img-jpx-smask</sub> | PASS | ink 100.0% | 1.7s, heap 7 MB |
| pdf2img | pdfjs-jbig2_symbol_offset.pdf<br><sub>pdf2img-jbig2-symbol</sub> | PASS | ink 1.0% | 2.6s, heap 7 MB |
| pdf2img | pdfjs-jbig2_file_header.pdf<br><sub>pdf2img-jbig2-header</sub> | PASS | ink 41.0% | 0.4s, heap 8 MB |
| pdf2img | pdfjs-cmykjpeg.pdf<br><sub>pdf2img-cmyk-jpeg</sub> | PASS | ink 6.1% | 0.3s, heap 8 MB |
| pdf2img | pdfjs-devicen.pdf<br><sub>pdf2img-devicen</sub> | PASS | ink 5.8% | 0.2s, heap 7 MB |
| pdf2img | pdfjs-simpletype3font.pdf<br><sub>pdf2img-type3</sub> | PASS | ink 0.1% | 0.6s, heap 8 MB |
| pdf2img | pdfjs-noembed-sjis.pdf<br><sub>pdf2img-noembed-sjis</sub> | PASS | ink 0.1% | 0.3s, heap 8 MB |
| pdf2img | pdfjs-vertical.pdf<br><sub>pdf2img-vertical-cjk</sub> | PASS | ink 0.2% | 0.3s, heap 7 MB |
| pdf2img | udhr-hindi.pdf<br><sub>pdf2img-hindi</sub> | PASS | ink 10.2% | 4.2s, heap 8 MB |
| pdf2img | crooked-paths-1648-104MB.pdf<br><sub>pdf2img-crooked-104MB</sub> | PASS | ink 68.5%, 43.4%, 75.6% | 33.6s, heap 8 MB |
| pdf2img | explorations-bible-lands-956pp-62MB.pdf<br><sub>pdf2img-bible-62MB</sub> | PASS | ink 100.0%, 100.0% | 4.1s, heap 8 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.5x size; warn: size stays reasonable (<= 3x) (5.5x input) | 14.0s, heap 16 MB |
| redact | aws-invoice.pdf<br><sub>redact-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 2.3x size | 1.4s, heap 7 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 11.4x size; warn: size stays reasonable (<= 3x) (11.4x input) | 18.4s, heap 17 MB |
| redact | pdfjs-rotation.pdf<br><sub>redact-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 3.8x size; warn: size stays reasonable (<= 3x) (3.8x input) | 0.6s, heap 9 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>redact-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 2.4x size | 2.5s, heap 10 MB |
| redact | uk-IPPH353.pdf<br><sub>redact-find-split-uk-IPPH353</sub> | PASS |  | 0.2s, heap 10 MB |
| redact | uk-AFPS-Form-17.pdf<br><sub>redact-find-split-uk-AFPS-Form-17</sub> | PASS |  | 0.2s, heap 12 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.98x size, 748 ms | 2.5s, heap 24 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.12x size, 280 ms | 1.1s, heap 11 MB |
| redact | pdfjs-rotation.pdf<br><sub>g3-redact-remove-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 0.94x size, 49 ms | 0.5s, heap 10 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.00x size, 25 ms | 0.5s, heap 11 MB |
| redact | c-rot270-cropbox.pdf<br><sub>g3-redact-remove-rot270-cropbox</sub> | PASS | 16 boxes on 2 page(s), 1.07x size, 134 ms | 0.6s, heap 11 MB |
| redact | c-rot180-origin.pdf<br><sub>g3-redact-remove-rot180-origin</sub> | PASS | 16 boxes on 2 page(s), 1.07x size, 122 ms | 0.7s, heap 10 MB |
| redact | aws-invoice.pdf<br><sub>g3-redact-remove-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 59 ms | 1.0s, heap 10 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-image-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 11.42x size, 11549 ms | 17.5s, heap 17 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 240 ms | 5.2s, heap 12 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.1s, heap 17 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-regex-budget-phones</sub> | PASS | 6 boxes, (202) 512-1530, (888) 293-6498, (202) 512-1800 | 2.4s, heap 13 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.6s, heap 19 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 0.5s, heap 10 MB |
| forms | irs-f1040.pdf<br><sub>forms-list-irs-f1040</sub> | PASS | 199 fields (199 widgets) in 142 ms, pdf.js 199, has XFA | 1.2s, heap 7 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 56 ms, pdf.js 23, has XFA | 0.8s, heap 7 MB |
| forms | irs-fw4.pdf<br><sub>forms-list-irs-fw4</sub> | PASS | 48 fields (48 widgets) in 237 ms, pdf.js 48, has XFA | 0.3s, heap 10 MB |
| forms | irs-f1040sa.pdf<br><sub>forms-list-irs-f1040sa</sub> | PASS | 33 fields (33 widgets) in 80 ms, pdf.js 33, has XFA | 1.6s, heap 7 MB |
| forms | uscis-i-9.pdf<br><sub>forms-list-uscis-i-9</sub> | PASS | 128 fields (130 widgets) in 134 ms, pdf.js 128 | 0.8s, heap 7 MB |
| forms | uscis-i-485.pdf<br><sub>forms-list-uscis-i-485</sub> | PASS | 730 fields (730 widgets) in 2258 ms, pdf.js 730, has XFA | 2.6s, heap 26 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-list-uk-IPPH353</sub> | PASS | 92 fields (92 widgets) in 862 ms, pdf.js 92 | 2.2s, heap 14 MB |
| forms | uk-AFPS-Form-17.pdf<br><sub>forms-list-uk-AFPS-Form-17</sub> | PASS | 24 fields (24 widgets) in 209 ms, pdf.js 24 | 0.3s, heap 9 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-list-xfa-imm1344e-filled</sub> | PASS | 1 fields (1 widgets) in 10 ms, pdf.js 1, has XFA | 0.3s, heap 12 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 2 ms, pdf.js 0, has XFA | 0.1s, heap 47 MB |
| forms | annotation-button-widget.pdf<br><sub>forms-list-annotation-button-widget</sub> | PASS | 6 fields (9 widgets) in 4 ms, pdf.js 6, has XFA | 0.3s, heap 11 MB |
| forms | annotation-choice-widget.pdf<br><sub>forms-list-annotation-choice-widget</sub> | PASS | 5 fields (5 widgets) in 4 ms, pdf.js 5, has XFA | 0.1s, heap 11 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-list-annotation-text-widget</sub> | PASS | 7 fields (7 widgets) in 4 ms, pdf.js 7, has XFA | 0.1s, heap 12 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 1.0s, heap 12 MB |
| forms | irs-fw9.pdf<br><sub>forms-fill-fw9</sub> | PASS | 3 filled | 0.3s, heap 18 MB |
| forms | uscis-i-9.pdf<br><sub>forms-fill-i9</sub> | PASS | 3 filled | 1.4s, heap 21 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-fill-xfa-imm1344e</sub> | FAIL | found text fields to fill: 0 | 0.4s, heap 47 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 2.1s, heap 20 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-fill-flatten-ipph353</sub> | PASS | 3 filled, flattened | 2.8s, heap 23 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-fill-flatten-text-widget</sub> | PASS | 3 filled, flattened | 0.1s, heap 11 MB |
| forms | uscis-i-485.pdf<br><sub>forms-flatten-i485</sub> | PASS | 730 fields flattened | 2.9s, heap 37 MB |
| forms | c-fw9-rot90.pdf<br><sub>c-forms-add-fw9-rot90</sub> | PASS |  | 0.5s, heap 35 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>c-forms-add-xfa-origin</sub> | PASS |  | 0.3s, heap 32 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-add-fw9</sub> | PASS |  | 0.5s, heap 26 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh</sub> | PASS |  | 0.7s, heap 9 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh-flat</sub> | PASS |  | 0.9s, heap 21 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar</sub> | PASS |  | 0.4s, heap 35 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar-flat</sub> | PASS |  | 0.7s, heap 14 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi</sub> | PASS |  | 0.7s, heap 16 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi-flat</sub> | PASS |  | 0.8s, heap 14 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja</sub> | PASS |  | 0.3s, heap 32 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja-flat</sub> | PASS |  | 1.1s, heap 32 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru</sub> | PASS |  | 0.5s, heap 13 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru-flat</sub> | PASS |  | 1.0s, heap 39 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-inspect-irs-fw9</sub> | PASS | 23 fields, 23 widgets, 77 ms | 0.1s, heap 16 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 1 ms | 0.1s, heap 46 MB |
| forms | uscis-i-9.pdf<br><sub>g3-forms-inspect-uscis-i-9</sub> | PASS | 128 fields, 130 widgets, 162 ms | 0.2s, heap 27 MB |
| forms | uscis-i-485.pdf<br><sub>g3-forms-inspect-uscis-i-485</sub> | PASS | 730 fields, 730 widgets, 2915 ms | 3.1s, heap 41 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 0.2s, heap 46 MB |
| forms | irs-f1040.pdf<br><sub>g3-forms-fill-xfa-irs-f1040-flat</sub> | PASS |  | 1.2s, heap 46 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 3.2s, heap 8 MB |
| compare | pdfjs-tracemonkey.pdf + pdfjs-tracemonkey_with_annotations.pdf<br><sub>compare-with-annotations</sub> | PASS | +0 -0, changed pages none | 5.4s, heap 14 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | FAIL | only the inserted page differs: changed pages 3,4,5,6 | 1.7s, heap 12 MB |
| compare | 911-commission-report.pdf + 911-commission-report.pdf<br><sub>compare-911-self</sub> | PASS | +0 -0, changed pages none | 27.8s, heap 66 MB |
| compare | us-economic-report-president-2024.pdf + us-economic-report-president-2024.pdf<br><sub>compare-dense-econ-self</sub> | FAIL | compare runs: TypeError: Cannot read properties of undefined (reading 'text') | 23.7s |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | PASS | 1 pages, 230 KB; warn: selectable text (coverage 0.00) | 2.2s, heap 8 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-styled-report</sub> | PASS | 1 page(s), 152 KB, 439 ms | 1.2s, heap 7 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-long-page</sub> | PASS | 22 pages, 3.9 MB, 48841 ms | 50.7s, heap 40 MB |
| health | -<br><sub>health-selftest</sub> | PASS | 44 checks, 0 failed; warn: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) | 7.6s, heap 22 MB |
| intake | annotation-button-widget.pdf<br><sub>intake-forms/annotation-button-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.2 KB" | 0.3s |
| intake | annotation-choice-widget.pdf<br><sub>intake-forms/annotation-choice-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 89.4 KB" | 0.3s |
| intake | annotation-text-widget.pdf<br><sub>intake-forms/annotation-text-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 91.0 KB" | 0.3s |
| intake | irs-f1040.pdf<br><sub>intake-forms/irs-f1040.pdf</sub> | PASS | expect accept (2 p): "2 pages, 215.1 KB" | 0.3s |
| intake | irs-f1040sa.pdf<br><sub>intake-forms/irs-f1040sa.pdf</sub> | PASS | expect accept (1 p): "1 page, 77.2 KB" | 0.3s |
| intake | irs-fw4.pdf<br><sub>intake-forms/irs-fw4.pdf</sub> | PASS | expect accept (5 p): "5 pages, 204.0 KB" | 0.6s |
| intake | irs-fw9.pdf<br><sub>intake-forms/irs-fw9.pdf</sub> | PASS | expect accept (6 p): "6 pages, 137.5 KB" | 0.6s |
| intake | uk-AFPS-Form-17.pdf<br><sub>intake-forms/uk-AFPS-Form-17.pdf</sub> | PASS | expect accept (5 p), encrypted: "5 pages, 978.1 KB" (Restrictions removed so the file can be edited) | 1.0s |
| intake | uk-IPPH353.pdf<br><sub>intake-forms/uk-IPPH353.pdf</sub> | PASS | expect accept (4 p), encrypted: "4 pages, 1.58 MB" (Restrictions removed so the file can be edited) | 2.6s |
| intake | uscis-i-485.pdf<br><sub>intake-forms/uscis-i-485.pdf</sub> | PASS | expect accept (24 p), encrypted: "24 pages, 2.55 MB" (Restrictions removed so the file can be edited) | 4.6s |
| intake | uscis-i-9.pdf<br><sub>intake-forms/uscis-i-9.pdf</sub> | PASS | expect accept (4 p): "4 pages, 511.8 KB" | 4.6s |
| intake | xfa-imm1344e-filled.pdf<br><sub>intake-forms/xfa-imm1344e-filled.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.88 MB" | 4.6s |
| intake | xfa-issue14315.pdf<br><sub>intake-forms/xfa-issue14315.pdf</sub> | PASS | expect accept (1 p): "1 page, 11.3 KB" | 4.6s |
| intake | darwin-origin-of-species-ia.pdf<br><sub>intake-scanned/darwin-origin-of-species-ia.pdf</sub> | PASS | expect accept (568 p): "568 pages, 24.20 MB" | 0.7s, heap 7 MB |
| intake | fax-jean-schmidt-doe.pdf<br><sub>intake-scanned/fax-jean-schmidt-doe.pdf</sub> | PASS | expect accept (2 p): "2 pages, 186.4 KB" | 4.6s |
| intake | fips-document-facsimile-transmission.pdf<br><sub>intake-scanned/fips-document-facsimile-transmission.pdf</sub> | PASS | expect accept (72 p): "72 pages, 4.22 MB" | 5.1s |
| intake | handwritten-field-trips-notebook-1950.pdf<br><sub>intake-scanned/handwritten-field-trips-notebook-1950.pdf</sub> | PASS | expect accept (57 p): "57 pages, 5.69 MB" | 5.5s |
| intake | letter-to-benjamin-glover.pdf<br><sub>intake-scanned/letter-to-benjamin-glover.pdf</sub> | PASS | expect accept (2 p): "2 pages, 1.71 MB" | 0.3s |
| intake | lincoln-ellsworth-letter-1861.pdf<br><sub>intake-scanned/lincoln-ellsworth-letter-1861.pdf</sub> | PASS | expect accept (36 p): "36 pages, 528.6 KB" | 0.3s |
| intake | ndl-konoye-handwritten-request.pdf<br><sub>intake-scanned/ndl-konoye-handwritten-request.pdf</sub> | PASS | expect accept (37 p), encrypted: "37 pages, 13.79 MB" (Restrictions removed so the file can be edited) | 1.0s |
| intake | queen-victoria-peabody-letter-1866.pdf<br><sub>intake-scanned/queen-victoria-peabody-letter-1866.pdf</sub> | PASS | expect accept (38 p): "38 pages, 5.72 MB" | 1.0s |
| intake | arxiv-1512.03385-resnet.pdf<br><sub>intake-reports/arxiv-1512.03385-resnet.pdf</sub> | PASS | expect accept (12 p): "12 pages, 800.2 KB" | 1.3s |
| intake | arxiv-1706.03762-attention.pdf<br><sub>intake-reports/arxiv-1706.03762-attention.pdf</sub> | PASS | expect accept (15 p): "15 pages, 2.11 MB" | 1.6s |
| intake | arxiv-1810.04805-bert.pdf<br><sub>intake-reports/arxiv-1810.04805-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages, 757.0 KB" | 1.9s |
| intake | arxiv-2005.14165-gpt3.pdf<br><sub>intake-reports/arxiv-2005.14165-gpt3.pdf</sub> | PASS | expect accept (75 p): "75 pages, 6.45 MB" | 1.9s |
| intake | arxiv-2307.09288-llama2.pdf<br><sub>intake-reports/arxiv-2307.09288-llama2.pdf</sub> | PASS | expect accept (77 p): "77 pages, 13.03 MB" | 0.9s |
| intake | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>intake-reports/fdic-quarterly-banking-profile-2023q4.pdf</sub> | PASS | expect accept (44 p): "44 pages, 1.29 MB" | 2.2s |
| intake | ipcc-ar6-synthesis-longer-report.pdf<br><sub>intake-reports/ipcc-ar6-synthesis-longer-report.pdf</sub> | PASS | expect accept (81 p): "81 pages, 4.98 MB" | 2.5s |
| intake | pdfjs-TAMReview.pdf<br><sub>intake-reports/pdfjs-TAMReview.pdf</sub> | PASS | expect accept (23 p): "23 pages, 658.8 KB" | 2.5s |
| intake | pdfjs-tracemonkey.pdf<br><sub>intake-reports/pdfjs-tracemonkey.pdf</sub> | PASS | expect accept (14 p): "14 pages, 992.5 KB" | 2.5s |
| intake | us-budget-2024.pdf<br><sub>intake-reports/us-budget-2024.pdf</sub> | PASS | expect accept (184 p): "184 pages, 2.31 MB" | 6.6s |
| intake | us-economic-report-president-2024.pdf<br><sub>intake-reports/us-economic-report-president-2024.pdf</sub> | PASS | expect accept (487 p): "487 pages, 4.93 MB" | 8.6s |
| intake | 19th-century-young-man-57MB.pdf<br><sub>intake-large/19th-century-young-man-57MB.pdf</sub> | PASS | expect accept (178 p): "178 pages, 54.76 MB" | 0.3s, heap 8 MB |
| intake | 911-commission-report.pdf<br><sub>intake-large/911-commission-report.pdf</sub> | PASS | expect accept (585 p), encrypted: "585 pages, 2.36 MB" (Restrictions removed so the file can be edited) | 9.5s |
| intake | crooked-paths-1648-104MB.pdf<br><sub>intake-large/crooked-paths-1648-104MB.pdf</sub> | PASS | expect accept (255 p): "255 pages, 99.26 MB" | 1.3s, heap 7 MB |
| intake | explorations-bible-lands-956pp-62MB.pdf<br><sub>intake-large/explorations-bible-lands-956pp-62MB.pdf</sub> | PASS | expect accept (956 p): "956 pages, 59.84 MB" | 1.3s, heap 8 MB |
| intake | pdfjs-ArabicCIDTrueType.pdf<br><sub>intake-intl/pdfjs-ArabicCIDTrueType.pdf</sub> | PASS | expect accept (1 p): "1 page, 38.4 KB" | 0.4s |
| intake | pdfjs-ThuluthFeatures.pdf<br><sub>intake-intl/pdfjs-ThuluthFeatures.pdf</sub> | PASS | expect accept (1 p): "1 page, 114.9 KB" | 0.4s |
| intake | pdfjs-arial_unicode_ab_cidfont.pdf<br><sub>intake-intl/pdfjs-arial_unicode_ab_cidfont.pdf</sub> | PASS | expect accept (1 p): "1 page, 12.8 KB" | 0.4s |
| intake | pdfjs-noembed-eucjp.pdf<br><sub>intake-intl/pdfjs-noembed-eucjp.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.4 KB" | 0.4s |
| intake | pdfjs-noembed-sjis.pdf<br><sub>intake-intl/pdfjs-noembed-sjis.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.4 KB" | 0.4s |
| intake | pdfjs-vertical.pdf<br><sub>intake-intl/pdfjs-vertical.pdf</sub> | PASS | expect accept (3 p): "3 pages, 6.7 KB" | 0.4s |
| intake | udhr-arabic.pdf<br><sub>intake-intl/udhr-arabic.pdf</sub> | PASS | expect accept (5 p): "5 pages, 184.8 KB" | 0.4s |
| intake | udhr-chinese-simplified.pdf<br><sub>intake-intl/udhr-chinese-simplified.pdf</sub> | PASS | expect accept (7 p): "7 pages, 468.6 KB" | 0.4s |
| intake | udhr-hebrew.pdf<br><sub>intake-intl/udhr-hebrew.pdf</sub> | PASS | expect accept (4 p): "4 pages, 29.1 KB" | 0.3s |
| intake | udhr-hindi.pdf<br><sub>intake-intl/udhr-hindi.pdf</sub> | PASS | expect accept (5 p): "5 pages, 1.65 MB" | 0.3s |
| intake | udhr-japanese.pdf<br><sub>intake-intl/udhr-japanese.pdf</sub> | PASS | expect accept (9 p): "9 pages, 465.1 KB" | 0.3s |
| intake | udhr-korean.pdf<br><sub>intake-intl/udhr-korean.pdf</sub> | PASS | expect accept (7 p): "7 pages, 273.0 KB" | 0.3s |
| intake | pdf20-image-bpc.pdf<br><sub>intake-quirks/pdf20-image-bpc.pdf</sub> | PASS | expect accept (1 p): "1 page, 8.8 KB" | 0.3s |
| intake | pdf20-incremental-save.pdf<br><sub>intake-quirks/pdf20-incremental-save.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.5 KB" | 0.3s |
| intake | pdf20-offset-start.pdf<br><sub>intake-quirks/pdf20-offset-start.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.1 KB" | 0.3s |
| intake | pdf20-page-output-intent.pdf<br><sub>intake-quirks/pdf20-page-output-intent.pdf</sub> | PASS | expect accept (2 p): "2 pages, 10.3 KB" | 0.3s |
| intake | pdf20-simple.pdf<br><sub>intake-quirks/pdf20-simple.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.1 KB" | 0.3s |
| intake | pdf20-utf8-annotation.pdf<br><sub>intake-quirks/pdf20-utf8-annotation.pdf</sub> | PASS | expect accept (1 p): "1 page, 4.4 KB" | 0.3s |
| intake | pdf20-utf8-test.pdf<br><sub>intake-quirks/pdf20-utf8-test.pdf</sub> | PASS | expect accept (1 p): "1 page, 13.6 KB" | 0.3s |
| intake | pdfjs-Pages-tree-refs.pdf<br><sub>intake-quirks/pdfjs-Pages-tree-refs.pdf</sub> | PASS | expect accept (1 p): "1 page, 622 B" (File was damaged and has been repaired) | 0.3s |
| intake | pdfjs-Type3WordSpacing.pdf<br><sub>intake-quirks/pdfjs-Type3WordSpacing.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.6 KB" | 0.3s |
| intake | pdfjs-alphatrans.pdf<br><sub>intake-quirks/pdfjs-alphatrans.pdf</sub> | PASS | expect accept (1 p): "1 page, 16.5 KB" | 0.7s |
| intake | pdfjs-annotation-fileattachment.pdf<br><sub>intake-quirks/pdfjs-annotation-fileattachment.pdf</sub> | PASS | expect accept (1 p): "1 page, 91.1 KB" | 0.7s |
| intake | pdfjs-annotation-freetext.pdf<br><sub>intake-quirks/pdfjs-annotation-freetext.pdf</sub> | PASS | expect accept (1 p): "1 page, 84.0 KB" | 0.7s |
| intake | pdfjs-annotation-highlight-without-appearance.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight-without-appearance.pdf</sub> | PASS | expect accept (1 p): "1 page, 15.9 KB" | 0.4s |
| intake | pdfjs-annotation-highlight.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight.pdf</sub> | PASS | expect accept (1 p): "1 page, 90.2 KB" | 0.4s |
| intake | pdfjs-annotation-line.pdf<br><sub>intake-quirks/pdfjs-annotation-line.pdf</sub> | PASS | expect accept (1 p): "1 page, 83.0 KB" | 0.4s |
| intake | pdfjs-annotation-stamp.pdf<br><sub>intake-quirks/pdfjs-annotation-stamp.pdf</sub> | PASS | expect accept (1 p): "1 page, 86.8 KB" | 0.4s |
| intake | pdfjs-bitmap-symbol-empty.pdf<br><sub>intake-quirks/pdfjs-bitmap-symbol-empty.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.1 KB" | 0.4s |
| intake | pdfjs-blendmode.pdf<br><sub>intake-quirks/pdfjs-blendmode.pdf</sub> | PASS | expect accept (1 p): "1 page, 49.4 KB" | 0.4s |
| intake | pdfjs-bug1020226.pdf<br><sub>intake-quirks/pdfjs-bug1020226.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 2.7s |
| intake | pdfjs-bug1782186.pdf<br><sub>intake-quirks/pdfjs-bug1782186.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.7s |
| intake | pdfjs-bug_jpx.pdf<br><sub>intake-quirks/pdfjs-bug_jpx.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.3 KB" | 0.5s |
| intake | pdfjs-cmykjpeg.pdf<br><sub>intake-quirks/pdfjs-cmykjpeg.pdf</sub> | PASS | expect accept (1 p): "1 page, 365.3 KB" | 0.5s |
| intake | pdfjs-devicen.pdf<br><sub>intake-quirks/pdfjs-devicen.pdf</sub> | PASS | expect accept (1 p): "1 page, 15.4 KB" | 0.5s |
| intake | pdfjs-empty_protected.pdf<br><sub>intake-quirks/pdfjs-empty_protected.pdf</sub> | PASS | expect accept (1 p), encrypted: "1 page, 5.3 KB" (Restrictions removed so the file can be edited) | 1.1s |
| intake | pdfjs-encrypted-attachment.pdf<br><sub>intake-quirks/pdfjs-encrypted-attachment.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.1s |
| intake | pdfjs-function_based_shading_cmyk.pdf<br><sub>intake-quirks/pdfjs-function_based_shading_cmyk.pdf</sub> | PASS | expect accept (2 p): "2 pages, 3.2 KB" | 1.1s |
| intake | pdfjs-hello_world_rotated.pdf<br><sub>intake-quirks/pdfjs-hello_world_rotated.pdf</sub> | PASS | expect accept (5 p): "5 pages, 1.3 KB" | 1.1s |
| intake | pdfjs-issue11555.pdf<br><sub>intake-quirks/pdfjs-issue11555.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.1 KB" | 1.1s |
| intake | pdfjs-issue1155r.pdf<br><sub>intake-quirks/pdfjs-issue1155r.pdf</sub> | PASS | expect accept (1 p): "1 page, 776 B" | 0.5s |
| intake | pdfjs-issue15893_reduced.pdf<br><sub>intake-quirks/pdfjs-issue15893_reduced.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.8s |
| intake | pdfjs-issue21579.pdf<br><sub>intake-quirks/pdfjs-issue21579.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.8s |
| intake | pdfjs-issue3371.pdf<br><sub>intake-quirks/pdfjs-issue3371.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.8s |
| intake | pdfjs-issue6010_1.pdf<br><sub>intake-quirks/pdfjs-issue6010_1.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.8s |
| intake | pdfjs-issue6010_2.pdf<br><sub>intake-quirks/pdfjs-issue6010_2.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.8s |
| intake | pdfjs-jbig2_file_header.pdf<br><sub>intake-quirks/pdfjs-jbig2_file_header.pdf</sub> | PASS | expect accept (1 p): "1 page, 774 B" | 0.8s |
| intake | pdfjs-jbig2_symbol_offset.pdf<br><sub>intake-quirks/pdfjs-jbig2_symbol_offset.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.1 KB" | 0.8s |
| intake | pdfjs-jpx_smaskindata.pdf<br><sub>intake-quirks/pdfjs-jpx_smaskindata.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.5 KB" | 0.5s |
| intake | pdfjs-jpx_subsampling.pdf<br><sub>intake-quirks/pdfjs-jpx_subsampling.pdf</sub> | PASS | expect accept (1 p): "1 page, 5.0 KB" | 0.5s |
| intake | pdfjs-nested_outline.pdf<br><sub>intake-quirks/pdfjs-nested_outline.pdf</sub> | PASS | expect accept (9 p): "9 pages, 5.8 KB" | 0.5s |
| intake | pdfjs-openoffice.pdf<br><sub>intake-quirks/pdfjs-openoffice.pdf</sub> | PASS | expect accept (1 p): "1 page, 10.1 KB" | 0.5s |
| intake | pdfjs-outline_goto_action.pdf<br><sub>intake-quirks/pdfjs-outline_goto_action.pdf</sub> | PASS | expect accept (2 p): "2 pages, 1.0 KB" | 0.5s |
| intake | pdfjs-outlines_se.pdf<br><sub>intake-quirks/pdfjs-outlines_se.pdf</sub> | PASS | expect accept (2 p): "2 pages, 29.7 KB" | 0.5s |
| intake | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-395-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 0.8s |
| intake | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-742-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 0.8s |
| intake | pdfjs-rotated.pdf<br><sub>intake-quirks/pdfjs-rotated.pdf</sub> | PASS | expect accept (1 p): "1 page, 12.7 KB" | 0.6s |
| intake | pdfjs-rotation.pdf<br><sub>intake-quirks/pdfjs-rotation.pdf</sub> | PASS | expect accept (2 p): "2 pages, 6.5 KB" | 0.6s |
| intake | pdfjs-saslprep-r6.pdf<br><sub>intake-quirks/pdfjs-saslprep-r6.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.9s |
| intake | pdfjs-simpletype3font.pdf<br><sub>intake-quirks/pdfjs-simpletype3font.pdf</sub> | PASS | expect accept (1 p): "1 page, 1.6 KB" | 2.9s |
| intake | pdfjs-tracemonkey_with_annotations.pdf<br><sub>intake-quirks/pdfjs-tracemonkey_with_annotations.pdf</sub> | PASS | expect accept (14 p): "14 pages, 997.8 KB" | 3.5s |
| intake | pdfjs-xref_command_missing.pdf<br><sub>intake-quirks/pdfjs-xref_command_missing.pdf</sub> | PASS | expect accept (1 p): "1 page, 631 B" | 3.5s |
| intake | aws-invoice.pdf<br><sub>intake-invoices/aws-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 150.9 KB" | 3.5s |
| intake | azure-interior.pdf<br><sub>intake-invoices/azure-interior.pdf</sub> | PASS | expect accept (1 p): "1 page, 39.9 KB" | 3.5s |
| intake | camelot-bol.pdf<br><sub>intake-invoices/camelot-bol.pdf</sub> | PASS | expect accept (1 p): "1 page, 24.3 KB" | 0.3s |
| intake | coolblue.pdf<br><sub>intake-invoices/coolblue.pdf</sub> | PASS | expect accept (1 p): "1 page, 52.3 KB" | 0.3s |
| intake | flipkart-invoice.pdf<br><sub>intake-invoices/flipkart-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 43.7 KB" | 0.3s |
| intake | free-fiber.pdf<br><sub>intake-invoices/free-fiber.pdf</sub> | PASS | expect accept (2 p): "2 pages, 117.3 KB" | 0.3s |
| intake | netpresse-invoice.pdf<br><sub>intake-invoices/netpresse-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 72.7 KB" | 0.3s |
| intake | oyo.pdf<br><sub>intake-invoices/oyo.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.9 KB" | 0.3s |
| intake | quality-hosting.pdf<br><sub>intake-invoices/quality-hosting.pdf</sub> | PASS | expect accept (2 p): "2 pages, 53.1 KB" | 0.3s |
| intake | saeco.pdf<br><sub>intake-invoices/saeco.pdf</sub> | PASS | expect accept (1 p): "1 page, 48.1 KB" | 0.3s |
| intake | a-owner-only-attention.pdf<br><sub>intake-derived/a-owner-only-attention.pdf</sub> | PASS | expect accept (15 p), encrypted: "15 pages, 1.99 MB" (Restrictions removed so the file can be edited) | 1.8s |
| intake | a-owner-only-us-budget.pdf<br><sub>intake-derived/a-owner-only-us-budget.pdf</sub> | PASS | expect accept (184 p), encrypted: "184 pages, 10.15 MB" (Restrictions removed so the file can be edited) | 9.8s |
| intake | c-fw9-rot90.pdf<br><sub>intake-derived/c-fw9-rot90.pdf</sub> | PASS | expect accept (6 p): "6 pages, 131.4 KB" | 10.1s |
| intake | c-mixed.pdf<br><sub>intake-derived/c-mixed.pdf</sub> | PASS | expect accept (5 p): "5 pages, 477.6 KB" | 10.1s |
| intake | c-rot180-origin.pdf<br><sub>intake-derived/c-rot180-origin.pdf</sub> | PASS | expect accept (2 p): "2 pages, 205.9 KB" | 10.1s |
| intake | c-rot270-cropbox.pdf<br><sub>intake-derived/c-rot270-cropbox.pdf</sub> | PASS | expect accept (2 p): "2 pages, 205.1 KB" | 10.1s |
| intake | compare-tracemonkey-base.pdf<br><sub>intake-derived/compare-tracemonkey-base.pdf</sub> | PASS | expect accept (5 p): "5 pages, 456.2 KB" | 10.1s |
| intake | compare-tracemonkey-inserted.pdf<br><sub>intake-derived/compare-tracemonkey-inserted.pdf</sub> | PASS | expect accept (6 p): "6 pages, 527.5 KB" | 10.5s |
| intake | origin-shift-aws-invoice.pdf<br><sub>intake-derived/origin-shift-aws-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 147.8 KB" | 0.4s |
| intake | owner-only-aws-invoice.pdf<br><sub>intake-derived/owner-only-aws-invoice.pdf</sub> | PASS | expect accept (1 p), encrypted: "1 page, 150.4 KB" (Restrictions removed so the file can be edited) | 1.0s |
| intake | owner-only-irs-fw9.pdf<br><sub>intake-derived/owner-only-irs-fw9.pdf</sub> | PASS | expect accept (6 p), encrypted: "6 pages, 220.0 KB" (Restrictions removed so the file can be edited) | 1.0s |
| intake | owner-only-tracemonkey.pdf<br><sub>intake-derived/owner-only-tracemonkey.pdf</sub> | PASS | expect accept (14 p), encrypted: "14 pages, 975.7 KB" (Restrictions removed so the file can be edited) | 1.3s |
| intake | rot90-cropbox-bert.pdf<br><sub>intake-derived/rot90-cropbox-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages, 647.9 KB" | 1.3s |
| intake | sub-darwin-p10-11.pdf<br><sub>intake-derived/sub-darwin-p10-11.pdf</sub> | PASS | expect accept (2 p): "2 pages, 28.7 KB" | 1.3s |
| intake | sub-fips-p5-6.pdf<br><sub>intake-derived/sub-fips-p5-6.pdf</sub> | PASS | expect accept (2 p): "2 pages, 51.0 KB" | 1.3s |
| intake | sub-lincoln-p3-4.pdf<br><sub>intake-derived/sub-lincoln-p3-4.pdf</sub> | PASS | expect accept (2 p): "2 pages, 12.3 KB" | 1.3s |
| intake | sub-ndl-konoye-p1.pdf<br><sub>intake-derived/sub-ndl-konoye-p1.pdf</sub> | PASS | expect accept (1 p): "1 page, 235.5 KB" | 0.3s |
| intake | user-pw-TAMReview.pdf<br><sub>intake-derived/user-pw-TAMReview.pdf</sub> | PASS | expect password: "Password needed to open this file" | 0.6s |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf<br><sub>flow-merge</sub> | PASS | ready 1.0s, click to download 1.1s: merged.pdf: 30 pages, 1.55 MB | 3.3s, heap 12 MB |
| compress | us-budget-2024.pdf<br><sub>flow-compress</sub> | PASS | ready 2.5s, click to download 31.9s: us-budget-2024-compressed.pdf: 184 pages, 2.31 MB | 35.0s, heap 12 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | PASS | ready 0.7s, click to download 1.1s: 2 PDFs, 14 pages in total | 2.3s, heap 12 MB |

## Integration 1: what was merged

Five worktrees merged into main on top of U1 + U1 review fixes + U2a: U4-I (Office engine), U4-H (PDF to Office), G3 (edit canvas), G4 (convert), G1 (organize). Main's newer U1-fix files (fonts, cryptoOps, pdfText, pdfOps, intake, PagePreview, usePdfFiles, corpus runner helpers) kept; worktree copies of those were stale.

- Owned files copied from each worktree; legacy tools deleted: Edit, Sign, Crop, Redact, Forms, PageNumbers, HtmlToPdf, ImageToPdf, Markdown, OfficeToPdf, PdfToImage, PdfToOffice, Split, Extract, Remove, Organize, Rotate, PageSelection. `src/lib/outputs.js` deleted (no importers). 56 dead legacy rules removed from `src/styles.css` (classes of the deleted tools only).
- Shared files 3-way merged (`git merge-file`, bases: U2a worktree for G3/G4/G1 shell files, reconstructed common base for U4-I/U4-H test files): Shell.jsx (G3 Canvas + setOptions updater, G4 non-PDF files + accepts.types/noun + keepInputs, G1 workbench + editor), fileStore.js (G4 type + G1 output order: one hand-resolved hunk), FileGrid.jsx, ResultScreen.jsx (G4 non-PDF result + G1 streamed zip), PageEditor.jsx, ops.js, shell.css, cases.mjs, page-harness.js (one seam fixed by hand: missing `},` and a duplicate `health` op), run.mjs, dev-notes.md, package.json.
- registry.js written by hand: merge, organize group, convert group, compress, repair, ocr, compare, edit group (edit, forms, watermark, page numbers, crop, redact, sign), protect, unlock, health. Legacy until G2: repair, ocr, protect, unlock, compare, health.
- UI follow-ups: PDF to Excel "Join pages into one sheet" (`pdfToXlsx(..., { joinPages })`); PDF to PowerPoint note says text stays editable.
- New deps installed: client-zip, heic2any, utif.

## Other checks on main

| Check | Result |
|---|---|
| `npm run build` | ok |
| Health, dev (`health.mjs`) | 44 of 44 |
| Health, built (`serve-pages-sim` + `health.mjs --url`) | 44 of 44 |
| `chain.mjs` | all passed |
| `g1.mjs` | all 12 passed |
| `g3-chain.mjs` | all passed |
| `g4-ui.mjs --no-shots` | all passed |
| `ui-frame.mjs` | all passed |
| Quick run first (`--quick --shards 4 --name integ-quick`) | 119 pass, 1 fail (compare-inserted-page) |
