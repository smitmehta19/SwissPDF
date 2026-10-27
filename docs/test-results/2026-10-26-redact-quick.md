# Corpus scorecard: 2026-10-26-redact-quick

Run: 2026-10-27 00:07 UTC, 3.3 min. Command: `npm run test:corpus -- --quick --shards 4 --name 2026-10-26-redact-quick`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **122 PASS, 1 FAIL, 0 SKIP** of 123 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 5 | 0 | 0 | 78.7s |
| excel2pdf | 2 | 0 | 0 | 6.9s |
| ppt2pdf | 2 | 0 | 0 | 3.1s |
| html2pdf | 3 | 0 | 0 | 11.7s |
| merge | 5 | 0 | 0 | 68.8s |
| split | 3 | 0 | 0 | 11.0s |
| extract | 1 | 0 | 0 | 5.7s |
| remove | 1 | 0 | 0 | 27.3s |
| rotate | 1 | 0 | 0 | 1.1s |
| organize | 1 | 0 | 0 | 2.0s |
| compress | 4 | 0 | 0 | 89.2s |
| repair | 2 | 0 | 0 | 4.3s |
| watermark | 3 | 0 | 0 | 6.9s |
| pagenumbers | 6 | 0 | 0 | 8.0s |
| sign | 4 | 0 | 0 | 4.7s |
| crop | 3 | 0 | 0 | 6.2s |
| edit | 3 | 0 | 0 | 6.8s |
| protect | 2 | 0 | 0 | 4.4s |
| unlock | 3 | 0 | 0 | 7.3s |
| ocr | 1 | 0 | 0 | 15.2s |
| pdf2word | 6 | 0 | 0 | 24.8s |
| pdf2excel | 2 | 0 | 0 | 5.1s |
| pdf2ppt | 2 | 0 | 0 | 17.5s |
| pdf2md | 2 | 0 | 0 | 9.0s |
| img2pdf | 4 | 0 | 0 | 7.5s |
| pdf2img | 2 | 0 | 0 | 5.3s |
| redact | 12 | 0 | 0 | 32.8s |
| forms | 6 | 0 | 0 | 10.3s |
| compare | 1 | 1 | 0 | 7.9s |
| health | 1 | 0 | 0 | 16.8s |
| intake | 29 | 0 | 0 | 65.8s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT REPRODUCED | 15 linked check(s) passed, e.g. merge-owner-only: passed; intake-quirks/pdfjs-encrypted-attachment.pdf: offers a password prompt |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT REPRODUCED | 8 linked check(s) passed, e.g. redact-tracemonkey: black box covers the word on screen; redact-rot90-cropbox: black box covers the word on screen |
| 3 | Redact search misses phrases split across text items | NOT REPRODUCED | 2 linked check(s) passed, e.g. g3-redact-phrase-split-ipph353: search finds a phrase split across text items; g3-redact-phrase-split-ipph353: phrase gone from extracted text |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | SOFT WARN | soft only, 1 linked check(s) passed; warn: compress-lincoln-scan: shrinks a scanned/image-heavy file by 10%+ (saved 1%) |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT REPRODUCED | 17 linked check(s) passed, e.g. intake-forms/annotation-button-widget.pdf: accepted; intake-forms/irs-fw9.pdf: accepted |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT REPRODUCED | 19 linked check(s) passed, e.g. watermark-tracemonkey: mark inside the visible page; watermark-rotation-quirk: mark inside the visible page |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT TESTED | no corpus case |
| 10 | OCR English only, assets from CDN (not offline) | SOFT WARN | soft only, 0 linked check(s) passed; warn: ocr-fax-printed: no network fetches outside the page origin (https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js, https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js, https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz) |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | NOT TESTED | no corpus case |
| 12 | Merge/split drop outlines, AcroForm, links | NOT REPRODUCED | 1 linked check(s) passed, e.g. merge-outlines: bookmarks kept |
| 13 | Crop rejects rotated, ignores box origin | NOT REPRODUCED | 3 linked check(s) passed, e.g. crop-tracemonkey: crop lands inside the visible page; crop-rotation-quirk: crop lands inside the visible page |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | SOFT WARN | soft only, 10 linked check(s) passed; warn: pdf2word-tracemonkey-2col: column lines stay in reading order (30 of 43 line joins kept) |
| 16 | PDF to Excel number parsing loses leading zeros / formats | SOFT WARN | soft only, 4 linked check(s) passed; warn: pdf2excel-aws-invoice: leading-zero / long ids kept as text (lost 0000) |
| 17 | PDF to PPT slides are flat images, fixed slide size | NOT REPRODUCED | 5 linked check(s) passed, e.g. pdf2ppt-tracemonkey: slides carry editable text; h-ppt-tracemonkey-editable: slide text extractable (85%+ of words) |
| 18 | Office to PDF quick mode is screenshots (no text) | SOFT WARN | soft only, 0 linked check(s) passed; warn: excel2pdf-quick-poi-SampleSS.xlsx: selectable text (coverage 0.00); ppt2pdf-quick-poi-SampleShow.pptx: selectable text (coverage 0.00) (+1 more) |
| 19 | HiFi engine from unpinned CDN, font substitution | SOFT WARN | soft only, 1 linked check(s) passed; warn: office-engine-load: no fetches outside the page origin (cdn.zetaoffice.net) |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | NOT REPRODUCED | 10 linked check(s) passed, e.g. forms-list-irs-fw9: field scan under 10 s; forms-list-xfa-issue14315: field scan under 10 s |
| 22 | Protect: comma in password splits MuPDF options | NOT REPRODUCED | 1 linked check(s) passed, e.g. protect-comma-password: comma password refused with a clear message |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | SOFT WARN | soft only, 7 linked check(s) passed; warn: img2pdf-photo-castle-3456x2628.jpg: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in); img2pdf-tiff-multipage.tiff: output not bloated (<= 3x input) (4.8x input) |
| 24 | Sign is visual only, one placement | NOT REPRODUCED | 3 linked check(s) passed, e.g. g3-sign-multi-rot90: signature and initials on page 1; g3-sign-multi-rot90: initials on every page, where placed |
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 11 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (6.0x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (10.9x input) |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT TESTED | no corpus case |
| 27 | Compare by page index only; inserted page breaks the rest | CONFIRMED | compare-inserted-page: only the inserted page differs (changed pages 3,4,5,6) |
| 28 | HTML to PDF is a screenshot, head styles dropped | SOFT WARN | soft only, 7 linked check(s) passed; warn: html2pdf-tracemonkey-text: selectable text (coverage 0.00) |
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
| 40 | Thumbnail cache never evicted | NOT TESTED | memory over a long session not measured |
| 41 | Single pdf.js queue delays user ops | NOT TESTED | queue contention not measured |
| 42 | Self-test uses only synthetic fixtures | SOFT WARN | soft only, 0 linked check(s) passed; warn: health-selftest: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) |

## Failures by tool

- **compare** (1): `compare-inserted-page` only the inserted page differs: changed pages 3,4,5,6

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 42.5s, heap 26 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 2.4s, heap 26 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 1.5s, heap 21 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 0.9s, heap 20 MB |
| word2pdf | -<br><sub>i-engine-pinned-warm-boot</sub> | PASS | cold boot 15164 ms (download 4726 ms, cache false), warm boot 10526 ms | 25.7s, heap 41 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-convert-no-network</sub> | PASS |  | 3.6s, heap 39 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-styled-report</sub> | PASS | 1 page(s), 43 KB, 489 ms, coverage 0.98 | 2.6s, heap 23 MB |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf + arxiv-1512.03385-resnet.pdf<br><sub>merge-reports</sub> | PASS | 42 pages, 2.2 MB | 3.0s, heap 15 MB |
| merge | pdfjs-rotation.pdf + pdfjs-hello_world_rotated.pdf + rot90-cropbox-bert.pdf<br><sub>merge-rotated</sub> | PASS | 23 pages, 648 KB | 27.5s, heap 7 MB |
| merge | pdfjs-nested_outline.pdf + us-budget-2024.pdf<br><sub>merge-outlines</sub> | PASS | 193 pages, 1.9 MB | 29.8s, heap 29 MB |
| merge | owner-only-tracemonkey.pdf + pdfjs-TAMReview.pdf<br><sub>merge-owner-only</sub> | PASS | 37 pages, 1.5 MB | 2.1s, heap 19 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | PASS | 14 pages -> 7 + 7 | 3.5s, heap 8 MB |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 2.6s, heap 8 MB |
| extract | us-budget-2024.pdf<br><sub>extract-budget-1-3-5</sub> | PASS | 3 pages out | 5.7s, heap 21 MB |
| remove | pdfjs-tracemonkey.pdf<br><sub>remove-tracemonkey-p1</sub> | PASS | 13 pages out | 27.3s, heap 7 MB |
| rotate | pdfjs-rotation.pdf<br><sub>rotate-rotation-quirk</sub> | PASS | 2 pages out | 1.1s, heap 8 MB |
| organize | pdfjs-tracemonkey.pdf<br><sub>organize-reverse-tracemonkey</sub> | PASS | 14 pages out | 2.0s, heap 8 MB |
| compress | lincoln-ellsworth-letter-1861.pdf<br><sub>compress-lincoln-scan</sub> | PASS | 529 KB -> 526 KB (99%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 1%) | 4.8s, heap 8 MB |
| compress | arxiv-2307.09288-llama2.pdf<br><sub>compress-llama2</sub> | PASS | 13.0 MB -> 12.6 MB (97%) | 8.6s, heap 9 MB |
| compress | pdfjs-tracemonkey.pdf<br><sub>compress-raster-tracemonkey</sub> | PASS | 992 KB -> 992 KB (100%), kept original | 6.8s, heap 10 MB |
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | PASS | recovered 1, rasterized 0, lost 0 | 2.5s, heap 8 MB |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | PASS |  | 1.8s |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-tracemonkey</sub> | PASS | 14 marks | 2.2s, heap 8 MB |
| watermark | pdfjs-rotation.pdf<br><sub>watermark-rotation-quirk</sub> | PASS | 2 marks | 1.5s, heap 8 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>watermark-rot90-cropbox</sub> | PASS | 16 marks | 3.2s, heap 8 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>pagenumbers-tracemonkey</sub> | PASS |  | 2.1s, heap 7 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>pagenumbers-rotation-quirk</sub> | PASS |  | 1.4s, heap 8 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>pagenumbers-rot90-cropbox</sub> | PASS |  | 2.1s, heap 8 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-template-skip</sub> | PASS |  | 1.2s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-facing</sub> | PASS |  | 0.6s, heap 10 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>g3-pagenumbers-bates-rot90</sub> | PASS |  | 0.6s, heap 13 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 2.1s, heap 9 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 1.4s, heap 8 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | PASS | centre (0.50, 0.85) | 0.6s, heap 11 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>g3-sign-multi-rot90</sub> | PASS |  | 0.5s, heap 14 MB |
| crop | pdfjs-tracemonkey.pdf<br><sub>crop-tracemonkey</sub> | PASS | CropBox 61,317,367,713 | 1.8s, heap 8 MB |
| crop | pdfjs-rotation.pdf<br><sub>crop-rotation-quirk</sub> | PASS | CropBox 61,317,367,713 | 1.5s, heap 8 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>crop-rot90-cropbox</sub> | PASS | CropBox 93,135,358,511 | 2.8s, heap 8 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>edit-tracemonkey</sub> | PASS |  | 2.3s, heap 8 MB |
| edit | pdfjs-rotation.pdf<br><sub>edit-rotation-quirk</sub> | PASS |  | 2.7s, heap 8 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>edit-rot90-cropbox</sub> | PASS |  | 1.8s, heap 8 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | PASS | Standard V5 R6 256-bit AES | 2.7s, heap 8 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 1.7s |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | PASS | removed: none listed, had user password | 2.6s, heap 7 MB |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | PASS | removed: none listed, had user password | 2.4s, heap 8 MB |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 2.3s, heap 8 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 394 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc"; warn: no network fetches outside the page origin (https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js, https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js, https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz) | 15.2s, heap 10 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>pdf2word-tracemonkey-2col</sub> | PASS | coverage 0.94, 11 tables, 88 images; warn: column lines stay in reading order (30 of 43 line joins kept) | 6.7s, heap 61 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice</sub> | PASS | coverage 1.00, 3 tables, 1 images | 2.8s, heap 9 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>h-word-tracemonkey-columns</sub> | PASS | 108/109 joins, 2 broken hyphens, 11 tables, 6096 ms | 7.9s, heap 13 MB |
| pdf2word | aws-invoice.pdf<br><sub>h-word-aws-tables</sub> | PASS | 3 tables, 22 rows, 143 ms | 0.4s, heap 14 MB |
| pdf2word | pdfjs-ArabicCIDTrueType.pdf<br><sub>h-word-arabic-cid-logical</sub> | PASS | 4/4 RTL lines in reading order | 3.0s, heap 9 MB |
| pdf2word | sub-ndl-konoye-p1.pdf<br><sub>h-word-jpeg-scan-ndl</sub> | PASS | 1 OCR pages, 0 images, 13 words, 3.8 s | 3.9s, heap 85 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 73 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 2.2s, heap 8 MB |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | PASS | 1 sheets, 22 numbers, 0 numeric text, 1.2 s | 2.8s, heap 9 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>pdf2ppt-tracemonkey</sub> | PASS | 14 slides, 99 images, 2.0 MB | 7.7s, heap 19 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>h-ppt-tracemonkey-editable</sub> | PASS | 14 slides, 83231 chars, 99 media, 2.0 MB, 5.5 s | 9.8s, heap 15 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 85800 chars, 14 headings, 11 tables | 6.4s, heap 12 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | PASS | 85800 chars, 11 tables, 14 headings | 2.7s, heap 13 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 62 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 4.5s, heap 11 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | PASS | 2 pages, 8 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 1.6s, heap 11 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | PASS | 1 pages, 251 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 5.9s, heap 10 MB |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | PASS | 1 page(s), 8.5x5.7 in, 455 KB | 4.0s, heap 12 MB |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | PASS | 1 page(s), 23.0x17.5 in, 5.4 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) | 3.1s, heap 8 MB |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) | 0.2s, heap 12 MB |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | PASS | 1 page(s), 0.9x0.9 in, 8 KB | 0.1s, heap 10 MB |
| pdf2img | pdfjs-tracemonkey.pdf<br><sub>pdf2img-tracemonkey</sub> | PASS | ink 10.8%, 13.3% | 4.9s, heap 8 MB |
| pdf2img | rot90-cropbox-bert.pdf<br><sub>pdf2img-rot90-cropbox</sub> | PASS | ink 16.3% | 0.4s, heap 8 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 6.0x size; warn: size stays reasonable (<= 3x) (6.0x input) | 7.7s, heap 15 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.9x size; warn: size stays reasonable (<= 3x) (10.9x input) | 10.7s, heap 13 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.98x size, 465 ms | 2.2s, heap 21 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.12x size, 468 ms | 5.1s, heap 10 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.00x size, 48 ms | 0.7s, heap 10 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | PASS |  | 0.3s, heap 10 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | PASS |  | 0.5s, heap 11 MB |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | PASS |  | 2.5s, heap 9 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 132 ms | 1.2s, heap 12 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.4s, heap 17 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.6s, heap 10 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 0.9s, heap 8 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 76 ms, pdf.js 23, has XFA | 2.9s, heap 8 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 17 ms, pdf.js 0, has XFA | 1.8s, heap 9 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 2.4s, heap 14 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 1.1s, heap 10 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 4 ms | 0.1s, heap 17 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 2.0s, heap 9 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 3.9s, heap 10 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | FAIL | only the inserted page differs: changed pages 3,4,5,6 | 3.9s, heap 10 MB |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | PASS | 1 pages, 230 KB; warn: selectable text (coverage 0.00) | 4.2s, heap 10 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-styled-report</sub> | PASS | 1 page(s), 152 KB, 1157 ms | 4.9s, heap 13 MB |
| health | -<br><sub>health-selftest</sub> | PASS | 44 checks, 0 failed; warn: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) | 16.8s, heap 22 MB |
| intake | annotation-button-widget.pdf<br><sub>intake-forms/annotation-button-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.2 KB" | 0.8s |
| intake | irs-fw9.pdf<br><sub>intake-forms/irs-fw9.pdf</sub> | PASS | expect accept (6 p): "6 pages, 137.5 KB" | 0.8s |
| intake | xfa-issue14315.pdf<br><sub>intake-forms/xfa-issue14315.pdf</sub> | PASS | expect accept (1 p): "1 page, 11.3 KB" | 0.8s |
| intake | lincoln-ellsworth-letter-1861.pdf<br><sub>intake-scanned/lincoln-ellsworth-letter-1861.pdf</sub> | PASS | expect accept (36 p): "36 pages, 528.6 KB" | 0.8s |
| intake | arxiv-2005.14165-gpt3.pdf<br><sub>intake-reports/arxiv-2005.14165-gpt3.pdf</sub> | PASS | expect accept (75 p): "75 pages, 6.45 MB" | 1.1s |
| intake | us-budget-2024.pdf<br><sub>intake-reports/us-budget-2024.pdf</sub> | PASS | expect accept (184 p): "184 pages, 2.31 MB" | 3.4s |
| intake | pdfjs-ArabicCIDTrueType.pdf<br><sub>intake-intl/pdfjs-ArabicCIDTrueType.pdf</sub> | PASS | expect accept (1 p): "1 page, 38.4 KB" | 3.4s |
| intake | udhr-arabic.pdf<br><sub>intake-intl/udhr-arabic.pdf</sub> | PASS | expect accept (5 p): "5 pages, 184.8 KB" | 3.4s |
| intake | pdf20-image-bpc.pdf<br><sub>intake-quirks/pdf20-image-bpc.pdf</sub> | PASS | expect accept (1 p): "1 page, 8.8 KB" | 0.6s |
| intake | pdf20-utf8-test.pdf<br><sub>intake-quirks/pdf20-utf8-test.pdf</sub> | PASS | expect accept (1 p): "1 page, 13.6 KB" | 0.6s |
| intake | pdfjs-annotation-highlight-without-appearance.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight-without-appearance.pdf</sub> | PASS | expect accept (1 p): "1 page, 15.9 KB" | 0.6s |
| intake | pdfjs-bug1020226.pdf<br><sub>intake-quirks/pdfjs-bug1020226.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 1.2s |
| intake | pdfjs-encrypted-attachment.pdf<br><sub>intake-quirks/pdfjs-encrypted-attachment.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.2s |
| intake | pdfjs-issue21579.pdf<br><sub>intake-quirks/pdfjs-issue21579.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.2s |
| intake | pdfjs-issue3371.pdf<br><sub>intake-quirks/pdfjs-issue3371.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.5s |
| intake | pdfjs-jpx_smaskindata.pdf<br><sub>intake-quirks/pdfjs-jpx_smaskindata.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.5 KB" | 1.5s |
| intake | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-395-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 1.6s |
| intake | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-742-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 2.3s |
| intake | pdfjs-tracemonkey_with_annotations.pdf<br><sub>intake-quirks/pdfjs-tracemonkey_with_annotations.pdf</sub> | PASS | expect accept (14 p): "14 pages, 997.8 KB" | 2.3s |
| intake | pdfjs-xref_command_missing.pdf<br><sub>intake-quirks/pdfjs-xref_command_missing.pdf</sub> | PASS | expect accept (1 p): "1 page, 631 B" | 2.3s |
| intake | flipkart-invoice.pdf<br><sub>intake-invoices/flipkart-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 43.7 KB" | 2.3s |
| intake | a-owner-only-attention.pdf<br><sub>intake-derived/a-owner-only-attention.pdf</sub> | PASS | expect accept (15 p), encrypted: "15 pages, 1.99 MB" (Restrictions removed so the file can be edited) | 3.5s |
| intake | a-owner-only-us-budget.pdf<br><sub>intake-derived/a-owner-only-us-budget.pdf</sub> | PASS | expect accept (184 p), encrypted: "184 pages, 10.15 MB" (Restrictions removed so the file can be edited) | 8.0s |
| intake | compare-tracemonkey-base.pdf<br><sub>intake-derived/compare-tracemonkey-base.pdf</sub> | PASS | expect accept (5 p): "5 pages, 456.2 KB" | 8.0s |
| intake | owner-only-aws-invoice.pdf<br><sub>intake-derived/owner-only-aws-invoice.pdf</sub> | PASS | expect accept (1 p), encrypted: "1 page, 150.4 KB" (Restrictions removed so the file can be edited) | 1.7s |
| intake | owner-only-irs-fw9.pdf<br><sub>intake-derived/owner-only-irs-fw9.pdf</sub> | PASS | expect accept (6 p), encrypted: "6 pages, 220.0 KB" (Restrictions removed so the file can be edited) | 2.1s |
| intake | owner-only-tracemonkey.pdf<br><sub>intake-derived/owner-only-tracemonkey.pdf</sub> | PASS | expect accept (14 p), encrypted: "14 pages, 975.7 KB" (Restrictions removed so the file can be edited) | 2.7s |
| intake | rot90-cropbox-bert.pdf<br><sub>intake-derived/rot90-cropbox-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages, 647.9 KB" | 2.7s |
| intake | user-pw-TAMReview.pdf<br><sub>intake-derived/user-pw-TAMReview.pdf</sub> | PASS | expect password: "Password needed to open this file" | 3.1s |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf<br><sub>flow-merge</sub> | PASS | ready 2.8s, click to download 2.2s: merged.pdf: 30 pages, 1.55 MB | 6.4s, heap 12 MB |
| compress | us-budget-2024.pdf<br><sub>flow-compress</sub> | PASS | ready 5.6s, click to download 62.0s: us-budget-2024-compressed.pdf: 184 pages, 2.31 MB | 69.0s, heap 13 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | PASS | ready 2.3s, click to download 2.0s: 2 PDFs, 14 pages in total | 5.0s, heap 11 MB |
