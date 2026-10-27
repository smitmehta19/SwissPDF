# Corpus scorecard: g2-quick

Run: 2026-10-26 23:55 UTC, 4.1 min. Command: `npm run test:corpus -- --quick --shards 4 --name g2-quick`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **133 PASS, 0 FAIL, 0 SKIP** of 133 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 5 | 0 | 0 | 53.6s |
| excel2pdf | 2 | 0 | 0 | 6.9s |
| ppt2pdf | 2 | 0 | 0 | 5.5s |
| html2pdf | 3 | 0 | 0 | 6.8s |
| merge | 5 | 0 | 0 | 40.8s |
| split | 3 | 0 | 0 | 8.9s |
| extract | 1 | 0 | 0 | 10.4s |
| remove | 1 | 0 | 0 | 6.4s |
| rotate | 1 | 0 | 0 | 3.1s |
| organize | 1 | 0 | 0 | 2.1s |
| compress | 4 | 0 | 0 | 97.5s |
| repair | 3 | 0 | 0 | 5.2s |
| watermark | 3 | 0 | 0 | 4.9s |
| pagenumbers | 6 | 0 | 0 | 12.3s |
| sign | 4 | 0 | 0 | 6.2s |
| crop | 3 | 0 | 0 | 5.9s |
| edit | 3 | 0 | 0 | 5.4s |
| protect | 3 | 0 | 0 | 5.6s |
| unlock | 4 | 0 | 0 | 13.4s |
| ocr | 6 | 0 | 0 | 200.8s |
| pdf2word | 6 | 0 | 0 | 26.7s |
| pdf2excel | 2 | 0 | 0 | 3.3s |
| pdf2ppt | 2 | 0 | 0 | 13.3s |
| pdf2md | 2 | 0 | 0 | 9.7s |
| img2pdf | 4 | 0 | 0 | 10.3s |
| pdf2img | 2 | 0 | 0 | 5.7s |
| redact | 9 | 0 | 0 | 42.6s |
| forms | 6 | 0 | 0 | 8.8s |
| compare | 4 | 0 | 0 | 12.2s |
| health | 1 | 0 | 0 | 25.4s |
| autorotate | 3 | 0 | 0 | 60.0s |
| intake | 29 | 0 | 0 | 78.6s |


## Delta vs 2026-10-26-resume-check

Baseline: 119 PASS, 1 FAIL, 0 SKIP of 120. This run: 133 PASS, 0 FAIL, 0 SKIP of 133.
Same rows: 120. FAIL->PASS: 1. PASS->FAIL: 0. Still failing: 0. New rows: 13 (13 pass, 0 fail). Rows gone: 0.

### PASS->FAIL (regressions): 0

None.

### FAIL->PASS: 1

| Case | Was | Now |
|---|---|---|
| compare-inserted-page | only the inserted page differs: changed pages 3,4,5,6 | +1213 -0, changed pages 3 |

### Still failing, by owning unit: 0

Unit from the audit finding of the first failing check, else from the tool. New = row not in the baseline.


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
| 10 | OCR English only, assets from CDN (not offline) | NOT REPRODUCED | 5 linked check(s) passed, e.g. ocr-fax-printed: no network fetches outside the page origin; g2-ocr-geometry: no network fetches outside the page origin |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | NOT REPRODUCED | 6 linked check(s) passed, e.g. g2-ocr-geometry: upright: words placed on the scan; g2-ocr-geometry: turned: words placed on the scan |
| 12 | Merge/split drop outlines, AcroForm, links | NOT REPRODUCED | 1 linked check(s) passed, e.g. merge-outlines: bookmarks kept |
| 13 | Crop rejects rotated, ignores box origin | NOT REPRODUCED | 3 linked check(s) passed, e.g. crop-tracemonkey: crop lands inside the visible page; crop-rotation-quirk: crop lands inside the visible page |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | SOFT WARN | soft only, 10 linked check(s) passed; warn: pdf2word-tracemonkey-2col: column lines stay in reading order (30 of 43 line joins kept) |
| 16 | PDF to Excel number parsing loses leading zeros / formats | SOFT WARN | soft only, 4 linked check(s) passed; warn: pdf2excel-aws-invoice: leading-zero / long ids kept as text (lost 0000) |
| 17 | PDF to PPT slides are flat images, fixed slide size | NOT REPRODUCED | 5 linked check(s) passed, e.g. pdf2ppt-tracemonkey: slides carry editable text; h-ppt-tracemonkey-editable: slide text extractable (85%+ of words) |
| 18 | Office to PDF quick mode is screenshots (no text) | SOFT WARN | soft only, 0 linked check(s) passed; warn: excel2pdf-quick-poi-SampleSS.xlsx: selectable text (coverage 0.00); ppt2pdf-quick-poi-SampleShow.pptx: selectable text (coverage 0.00) (+1 more) |
| 19 | HiFi engine from unpinned CDN, font substitution | SOFT WARN | soft only, 1 linked check(s) passed; warn: office-engine-load: no fetches outside the page origin (cdn.zetaoffice.net) |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | NOT REPRODUCED | 7 linked check(s) passed, e.g. forms-list-irs-fw9: field scan under 10 s; forms-list-xfa-issue14315: field scan under 10 s |
| 22 | Protect: comma in password splits MuPDF options | NOT REPRODUCED | 3 linked check(s) passed, e.g. protect-comma-password: comma password refused with a clear message; g2-protect-permissions-only: printing and copying blocked |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | SOFT WARN | soft only, 7 linked check(s) passed; warn: img2pdf-photo-castle-3456x2628.jpg: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in); img2pdf-tiff-multipage.tiff: output not bloated (<= 3x input) (4.8x input) |
| 24 | Sign is visual only, one placement | NOT REPRODUCED | 3 linked check(s) passed, e.g. g3-sign-multi-rot90: signature and initials on page 1; g3-sign-multi-rot90: initials on every page, where placed |
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 11 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (5.5x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (11.4x input) |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT REPRODUCED | 1 linked check(s) passed, e.g. g2-repair-keeps-fields: form fields kept |
| 27 | Compare by page index only; inserted page breaks the rest | NOT REPRODUCED | 3 linked check(s) passed, e.g. compare-inserted-page: only the inserted page differs; g2-compare-inserted-overlay: one inserted page, nothing else changed |
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

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 23.4s, heap 27 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 2.3s, heap 27 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 1.6s, heap 28 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 1.1s, heap 26 MB |
| word2pdf | -<br><sub>i-engine-pinned-warm-boot</sub> | PASS | cold boot 15406 ms (download 5142 ms, cache false), warm boot 8844 ms | 24.3s, heap 42 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-convert-no-network</sub> | PASS |  | 1.4s, heap 38 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-styled-report</sub> | PASS | 1 page(s), 43 KB, 516 ms, coverage 0.98 | 2.9s, heap 22 MB |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf + arxiv-1512.03385-resnet.pdf<br><sub>merge-reports</sub> | PASS | 42 pages, 2.2 MB | 4.3s, heap 16 MB |
| merge | pdfjs-rotation.pdf + pdfjs-hello_world_rotated.pdf + rot90-cropbox-bert.pdf<br><sub>merge-rotated</sub> | PASS | 23 pages, 648 KB | 7.9s, heap 7 MB |
| merge | pdfjs-nested_outline.pdf + us-budget-2024.pdf<br><sub>merge-outlines</sub> | PASS | 193 pages, 1.9 MB | 10.8s, heap 31 MB |
| merge | owner-only-tracemonkey.pdf + pdfjs-TAMReview.pdf<br><sub>merge-owner-only</sub> | PASS | 37 pages, 1.5 MB | 5.0s, heap 14 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | PASS | 14 pages -> 7 + 7 | 2.1s, heap 7 MB |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 0.8s, heap 13 MB |
| extract | us-budget-2024.pdf<br><sub>extract-budget-1-3-5</sub> | PASS | 3 pages out | 10.4s, heap 18 MB |
| remove | pdfjs-tracemonkey.pdf<br><sub>remove-tracemonkey-p1</sub> | PASS | 13 pages out | 6.4s, heap 8 MB |
| rotate | pdfjs-rotation.pdf<br><sub>rotate-rotation-quirk</sub> | PASS | 2 pages out | 3.1s, heap 8 MB |
| organize | pdfjs-tracemonkey.pdf<br><sub>organize-reverse-tracemonkey</sub> | PASS | 14 pages out | 2.1s, heap 7 MB |
| compress | lincoln-ellsworth-letter-1861.pdf<br><sub>compress-lincoln-scan</sub> | PASS | 529 KB -> 526 KB (99%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 1%) | 3.2s, heap 9 MB |
| compress | arxiv-2307.09288-llama2.pdf<br><sub>compress-llama2</sub> | PASS | 13.0 MB -> 12.6 MB (97%) | 10.5s, heap 8 MB |
| compress | pdfjs-tracemonkey.pdf<br><sub>compress-raster-tracemonkey</sub> | PASS | 992 KB -> 992 KB (100%), kept original | 4.9s, heap 11 MB |
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | PASS | recovered 1, rasterized 0, lost 0 | 1.7s, heap 7 MB |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | PASS |  | 0.1s |
| repair | irs-fw9.pdf<br><sub>g2-repair-keeps-fields</sub> | PASS | rewrite, 23 of 23 fields | 3.3s, heap 8 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-tracemonkey</sub> | PASS | 14 marks | 2.1s, heap 7 MB |
| watermark | pdfjs-rotation.pdf<br><sub>watermark-rotation-quirk</sub> | PASS | 2 marks | 2.4s, heap 7 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>watermark-rot90-cropbox</sub> | PASS | 16 marks | 0.5s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>pagenumbers-tracemonkey</sub> | PASS |  | 2.7s, heap 7 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>pagenumbers-rotation-quirk</sub> | PASS |  | 1.8s, heap 7 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>pagenumbers-rot90-cropbox</sub> | PASS |  | 5.9s, heap 8 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-template-skip</sub> | PASS |  | 0.8s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-facing</sub> | PASS |  | 0.7s, heap 12 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>g3-pagenumbers-bates-rot90</sub> | PASS |  | 0.5s, heap 12 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 2.2s, heap 7 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 1.4s, heap 7 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | PASS | centre (0.50, 0.85) | 1.6s, heap 7 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>g3-sign-multi-rot90</sub> | PASS |  | 1.0s, heap 8 MB |
| crop | pdfjs-tracemonkey.pdf<br><sub>crop-tracemonkey</sub> | PASS | CropBox 61,317,367,713 | 2.2s, heap 7 MB |
| crop | pdfjs-rotation.pdf<br><sub>crop-rotation-quirk</sub> | PASS | CropBox 61,317,367,713 | 1.5s, heap 7 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>crop-rot90-cropbox</sub> | PASS | CropBox 93,135,358,511 | 2.2s, heap 8 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>edit-tracemonkey</sub> | PASS |  | 2.9s, heap 8 MB |
| edit | pdfjs-rotation.pdf<br><sub>edit-rotation-quirk</sub> | PASS |  | 2.1s, heap 7 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>edit-rot90-cropbox</sub> | PASS |  | 0.4s, heap 11 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | PASS | Standard V5 R6 256-bit AES | 2.4s, heap 7 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 1.6s |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-permissions-only</sub> | PASS | Standard V5 R6 256-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 1.6s, heap 7 MB |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | PASS | removed: none listed, had user password | 4.7s, heap 7 MB |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | PASS | removed: none listed, had user password | 2.4s, heap 9 MB |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 3.3s, heap 8 MB |
| unlock | a-owner-only-us-budget.pdf<br><sub>g2-unlock-owner-only-fast</sub> | PASS | 861 ms, removed: printing, copying text, editing | 3.0s, heap 9 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 397 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc" | 27.5s, heap 9 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-geometry</sub> | PASS | upright 45/46 median 1.7pt; turned 45/46 median 1.6pt; rot90crop 46/47 median 1.5pt; skew 41/43 median 1.8pt | 105.9s, heap 12 MB |
| ocr | udhr-chinese-simplified.pdf<br><sub>g2-ocr-scan-chinese</sub> | PASS | 451 words, 0 without a font, coverage 0.92, "世界 人 权 宣 告 联合 国 大 会 一 九 四 八 年 十 二 月 十 日" | 20.9s, heap 15 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-fax-force</sub> | PASS | 397 words on 2 pages (0 skipped), turned 0, "10/25/2008 15:38 FAX 202 225 1992 Congre" | 25.7s, heap 9 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>g2-ocr-skip-text-pages</sub> | PASS | read 1, skipped 2 | 2.8s, heap 10 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-cancel</sub> | PASS | stopped at 3001 ms during "Page 1 of 2, recognizing", next run 334 words | 18.0s, heap 15 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>pdf2word-tracemonkey-2col</sub> | PASS | coverage 0.94, 11 tables, 88 images; warn: column lines stay in reading order (30 of 43 line joins kept) | 6.6s, heap 23 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice</sub> | PASS | coverage 1.00, 3 tables, 1 images | 0.7s, heap 24 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>h-word-tracemonkey-columns</sub> | PASS | 108/109 joins, 2 broken hyphens, 11 tables, 5303 ms | 7.1s, heap 35 MB |
| pdf2word | aws-invoice.pdf<br><sub>h-word-aws-tables</sub> | PASS | 3 tables, 22 rows, 1888 ms | 3.5s, heap 13 MB |
| pdf2word | pdfjs-ArabicCIDTrueType.pdf<br><sub>h-word-arabic-cid-logical</sub> | PASS | 4/4 RTL lines in reading order | 0.2s, heap 13 MB |
| pdf2word | sub-ndl-konoye-p1.pdf<br><sub>h-word-jpeg-scan-ndl</sub> | PASS | 1 OCR pages, 0 images, 13 words, 7.0 s | 8.5s, heap 8 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 73 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 2.6s, heap 10 MB |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | PASS | 1 sheets, 22 numbers, 0 numeric text, 0.5 s | 0.7s, heap 11 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>pdf2ppt-tracemonkey</sub> | PASS | 14 slides, 99 images, 2.0 MB | 8.4s, heap 19 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>h-ppt-tracemonkey-editable</sub> | PASS | 14 slides, 83231 chars, 99 media, 2.0 MB, 4.6 s | 4.9s, heap 22 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 85800 chars, 14 headings, 11 tables | 5.2s, heap 11 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | PASS | 85800 chars, 11 tables, 14 headings | 4.5s, heap 12 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 62 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 4.6s, heap 13 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | PASS | 2 pages, 8 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.9s, heap 8 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | PASS | 1 pages, 251 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.3s, heap 14 MB |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | PASS | 1 page(s), 8.5x5.7 in, 455 KB | 5.7s, heap 10 MB |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | PASS | 1 page(s), 23.0x17.5 in, 5.4 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) | 3.1s, heap 8 MB |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) | 1.3s, heap 7 MB |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | PASS | 1 page(s), 0.9x0.9 in, 8 KB | 0.1s, heap 8 MB |
| pdf2img | pdfjs-tracemonkey.pdf<br><sub>pdf2img-tracemonkey</sub> | PASS | ink 10.8%, 13.3% | 3.5s, heap 8 MB |
| pdf2img | rot90-cropbox-bert.pdf<br><sub>pdf2img-rot90-cropbox</sub> | PASS | ink 16.3% | 2.1s, heap 7 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.5x size; warn: size stays reasonable (<= 3x) (5.5x input) | 14.8s, heap 17 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 11.4x size; warn: size stays reasonable (<= 3x) (11.4x input) | 16.8s, heap 17 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.98x size, 549 ms | 3.6s, heap 19 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.12x size, 396 ms | 1.6s, heap 27 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.00x size, 97 ms | 2.9s, heap 9 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 107 ms | 1.0s, heap 10 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.3s, heap 12 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.4s, heap 10 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 1.1s, heap 10 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 97 ms, pdf.js 23, has XFA | 1.5s, heap 8 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 22 ms, pdf.js 0, has XFA | 1.4s, heap 7 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 4.3s, heap 20 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 1.1s, heap 8 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 2 ms | 0.1s, heap 14 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 0.3s, heap 18 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 4.6s, heap 8 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | PASS | +1213 -0, changed pages 3 | 3.8s, heap 10 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>g2-compare-inserted-overlay</sub> | PASS | 423 ms, +1213 -0, changed 3, overlay max 0.00% | 2.2s, heap 16 MB |
| compare | pdfjs-tracemonkey.pdf<br><sub>g2-compare-removed-page</sub> | PASS | 533 ms, -1260 words, changed pairs 4 | 1.6s, heap 11 MB |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | PASS | 1 pages, 230 KB; warn: selectable text (coverage 0.00) | 3.0s, heap 10 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-styled-report</sub> | PASS | 1 page(s), 152 KB, 626 ms | 0.9s, heap 8 MB |
| health | -<br><sub>health-selftest</sub> | PASS | 49 checks, 0 failed; warn: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) | 25.4s, heap 20 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-90</sub> | PASS | 4855 ms, turned 2 of 2, osd 270/0.4 270/2.2 | 8.9s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-90</sub> | PASS | 41118 ms, turned 36 of 36, osd 0/0.0 90/0.1 0/0.0 0/0.0 0/0.0 270/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/21.2 270/27.6 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/6.5 270/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/1.0 0/0.4 180/0.9 | 45.0s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-90</sub> | PASS | 5154 ms, turned 0 of 1, osd 270/1.2; warn: every page back upright (not detected: p1) | 6.2s, heap 7 MB |
| intake | annotation-button-widget.pdf<br><sub>intake-forms/annotation-button-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.2 KB" | 0.7s |
| intake | irs-fw9.pdf<br><sub>intake-forms/irs-fw9.pdf</sub> | PASS | expect accept (6 p): "6 pages, 137.5 KB" | 0.7s |
| intake | xfa-issue14315.pdf<br><sub>intake-forms/xfa-issue14315.pdf</sub> | PASS | expect accept (1 p): "1 page, 11.3 KB" | 0.7s |
| intake | lincoln-ellsworth-letter-1861.pdf<br><sub>intake-scanned/lincoln-ellsworth-letter-1861.pdf</sub> | PASS | expect accept (36 p): "36 pages, 528.6 KB" | 0.7s |
| intake | arxiv-2005.14165-gpt3.pdf<br><sub>intake-reports/arxiv-2005.14165-gpt3.pdf</sub> | PASS | expect accept (75 p): "75 pages, 6.45 MB" | 1.0s |
| intake | us-budget-2024.pdf<br><sub>intake-reports/us-budget-2024.pdf</sub> | PASS | expect accept (184 p): "184 pages, 2.31 MB" | 3.2s |
| intake | pdfjs-ArabicCIDTrueType.pdf<br><sub>intake-intl/pdfjs-ArabicCIDTrueType.pdf</sub> | PASS | expect accept (1 p): "1 page, 38.4 KB" | 3.2s |
| intake | udhr-arabic.pdf<br><sub>intake-intl/udhr-arabic.pdf</sub> | PASS | expect accept (5 p): "5 pages, 184.8 KB" | 3.6s |
| intake | pdf20-image-bpc.pdf<br><sub>intake-quirks/pdf20-image-bpc.pdf</sub> | PASS | expect accept (1 p): "1 page, 8.8 KB" | 1.8s |
| intake | pdf20-utf8-test.pdf<br><sub>intake-quirks/pdf20-utf8-test.pdf</sub> | PASS | expect accept (1 p): "1 page, 13.6 KB" | 1.8s |
| intake | pdfjs-annotation-highlight-without-appearance.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight-without-appearance.pdf</sub> | PASS | expect accept (1 p): "1 page, 15.9 KB" | 1.8s |
| intake | pdfjs-bug1020226.pdf<br><sub>intake-quirks/pdfjs-bug1020226.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 3.3s |
| intake | pdfjs-encrypted-attachment.pdf<br><sub>intake-quirks/pdfjs-encrypted-attachment.pdf</sub> | PASS | expect password: "Password needed to open this file" | 3.3s |
| intake | pdfjs-issue21579.pdf<br><sub>intake-quirks/pdfjs-issue21579.pdf</sub> | PASS | expect password: "Password needed to open this file" | 3.6s |
| intake | pdfjs-issue3371.pdf<br><sub>intake-quirks/pdfjs-issue3371.pdf</sub> | PASS | expect password: "Password needed to open this file" | 3.6s |
| intake | pdfjs-jpx_smaskindata.pdf<br><sub>intake-quirks/pdfjs-jpx_smaskindata.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.5 KB" | 3.6s |
| intake | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-395-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 2.1s |
| intake | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-742-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 2.1s |
| intake | pdfjs-tracemonkey_with_annotations.pdf<br><sub>intake-quirks/pdfjs-tracemonkey_with_annotations.pdf</sub> | PASS | expect accept (14 p): "14 pages, 997.8 KB" | 2.1s |
| intake | pdfjs-xref_command_missing.pdf<br><sub>intake-quirks/pdfjs-xref_command_missing.pdf</sub> | PASS | expect accept (1 p): "1 page, 631 B" | 2.1s |
| intake | flipkart-invoice.pdf<br><sub>intake-invoices/flipkart-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 43.7 KB" | 2.1s |
| intake | a-owner-only-attention.pdf<br><sub>intake-derived/a-owner-only-attention.pdf</sub> | PASS | expect accept (15 p), encrypted: "15 pages, 1.99 MB" (Restrictions removed so the file can be edited) | 3.0s |
| intake | a-owner-only-us-budget.pdf<br><sub>intake-derived/a-owner-only-us-budget.pdf</sub> | PASS | expect accept (184 p), encrypted: "184 pages, 10.15 MB" (Restrictions removed so the file can be edited) | 8.3s |
| intake | compare-tracemonkey-base.pdf<br><sub>intake-derived/compare-tracemonkey-base.pdf</sub> | PASS | expect accept (5 p): "5 pages, 456.2 KB" | 8.6s |
| intake | owner-only-aws-invoice.pdf<br><sub>intake-derived/owner-only-aws-invoice.pdf</sub> | PASS | expect accept (1 p), encrypted: "1 page, 150.4 KB" (Restrictions removed so the file can be edited) | 1.7s |
| intake | owner-only-irs-fw9.pdf<br><sub>intake-derived/owner-only-irs-fw9.pdf</sub> | PASS | expect accept (6 p), encrypted: "6 pages, 220.0 KB" (Restrictions removed so the file can be edited) | 2.2s |
| intake | owner-only-tracemonkey.pdf<br><sub>intake-derived/owner-only-tracemonkey.pdf</sub> | PASS | expect accept (14 p), encrypted: "14 pages, 975.7 KB" (Restrictions removed so the file can be edited) | 2.2s |
| intake | rot90-cropbox-bert.pdf<br><sub>intake-derived/rot90-cropbox-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages, 647.9 KB" | 2.6s |
| intake | user-pw-TAMReview.pdf<br><sub>intake-derived/user-pw-TAMReview.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.6s |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf<br><sub>flow-merge</sub> | PASS | ready 6.0s, click to download 3.1s: merged.pdf: 30 pages, 1.55 MB | 12.8s, heap 12 MB |
| compress | us-budget-2024.pdf<br><sub>flow-compress</sub> | PASS | ready 9.0s, click to download 68.8s: us-budget-2024-compressed.pdf: 184 pages, 2.31 MB | 78.9s, heap 11 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | PASS | ready 2.8s, click to download 2.7s: 2 PDFs, 14 pages in total | 6.1s, heap 12 MB |
