# Corpus scorecard: 2026-10-27-integ3-quick

Run: 2026-10-27 00:28 UTC, 6.1 min. Command: `npm run test:corpus -- --quick --shards 4 --name 2026-10-27-integ3-quick`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **165 PASS, 0 FAIL, 0 SKIP** of 165 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 5 | 0 | 0 | 83.8s |
| excel2pdf | 2 | 0 | 0 | 9.0s |
| ppt2pdf | 2 | 0 | 0 | 5.8s |
| html2pdf | 3 | 0 | 0 | 8.9s |
| merge | 5 | 0 | 0 | 92.7s |
| split | 3 | 0 | 0 | 44.4s |
| extract | 1 | 0 | 0 | 5.9s |
| remove | 1 | 0 | 0 | 3.2s |
| rotate | 1 | 0 | 0 | 2.5s |
| organize | 1 | 0 | 0 | 3.5s |
| compress | 4 | 0 | 0 | 87.5s |
| repair | 3 | 0 | 0 | 10.2s |
| watermark | 3 | 0 | 0 | 23.4s |
| pagenumbers | 6 | 0 | 0 | 9.7s |
| sign | 4 | 0 | 0 | 5.3s |
| crop | 3 | 0 | 0 | 6.4s |
| edit | 3 | 0 | 0 | 8.1s |
| protect | 3 | 0 | 0 | 13.3s |
| unlock | 4 | 0 | 0 | 21.3s |
| ocr | 6 | 0 | 0 | 252.3s |
| pdf2word | 6 | 0 | 0 | 27.9s |
| pdf2excel | 2 | 0 | 0 | 7.1s |
| pdf2ppt | 2 | 0 | 0 | 17.6s |
| pdf2md | 2 | 0 | 0 | 11.0s |
| img2pdf | 4 | 0 | 0 | 8.4s |
| pdf2img | 2 | 0 | 0 | 6.8s |
| redact | 12 | 0 | 0 | 34.8s |
| forms | 6 | 0 | 0 | 8.2s |
| compare | 4 | 0 | 0 | 10.7s |
| health | 1 | 0 | 0 | 32.4s |
| autorotate | 3 | 0 | 0 | 55.5s |
| nup | 2 | 0 | 0 | 3.6s |
| booklet | 1 | 0 | 0 | 2.9s |
| scale | 2 | 0 | 0 | 5.3s |
| singlepage | 1 | 0 | 0 | 2.0s |
| overlay | 1 | 0 | 0 | 1.7s |
| stamp | 2 | 0 | 0 | 3.3s |
| removeblank | 2 | 0 | 0 | 20.5s |
| linearize | 1 | 0 | 0 | 2.0s |
| adjustcolors | 1 | 0 | 0 | 2.5s |
| replacecolors | 1 | 0 | 0 | 2.5s |
| bookmarks | 1 | 0 | 0 | 6.3s |
| metadata | 1 | 0 | 0 | 3.7s |
| attachments | 1 | 0 | 0 | 3.5s |
| removeannots | 1 | 0 | 0 | 2.8s |
| removeimages | 1 | 0 | 0 | 2.5s |
| extractimages | 2 | 0 | 0 | 9.6s |
| flatten | 1 | 0 | 0 | 3.4s |
| unlockforms | 1 | 0 | 0 | 5.4s |
| sanitize | 2 | 0 | 0 | 7.9s |
| permissions | 1 | 0 | 0 | 2.5s |
| info | 1 | 0 | 0 | 2.4s |
| autorename | 1 | 0 | 0 | 3.0s |
| showjs | 1 | 0 | 0 | 3.1s |
| intake | 29 | 0 | 0 | 58.7s |

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
| 21 | Forms: XFA not handled, slow widget map | NOT REPRODUCED | 10 linked check(s) passed, e.g. forms-list-irs-fw9: field scan under 10 s; forms-list-xfa-issue14315: field scan under 10 s |
| 22 | Protect: comma in password splits MuPDF options | NOT REPRODUCED | 3 linked check(s) passed, e.g. protect-comma-password: comma password refused with a clear message; g2-protect-permissions-only: printing and copying blocked |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | SOFT WARN | soft only, 7 linked check(s) passed; warn: img2pdf-photo-castle-3456x2628.jpg: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in); img2pdf-tiff-multipage.tiff: output not bloated (<= 3x input) (4.8x input) |
| 24 | Sign is visual only, one placement | NOT REPRODUCED | 3 linked check(s) passed, e.g. g3-sign-multi-rot90: signature and initials on page 1; g3-sign-multi-rot90: initials on every page, where placed |
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 11 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (6.0x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (10.9x input) |
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
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 49.0s, heap 29 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 2.1s, heap 27 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 2.0s, heap 28 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 1.0s, heap 29 MB |
| word2pdf | -<br><sub>i-engine-pinned-warm-boot</sub> | PASS | cold boot 16099 ms (download 5075 ms, cache false), warm boot 9542 ms | 25.7s, heap 43 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-convert-no-network</sub> | PASS |  | 1.7s, heap 41 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-styled-report</sub> | PASS | 1 page(s), 43 KB, 614 ms, coverage 0.98 | 2.9s, heap 41 MB |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf + arxiv-1512.03385-resnet.pdf<br><sub>merge-reports</sub> | PASS | 42 pages, 2.2 MB | 36.5s, heap 11 MB |
| merge | pdfjs-rotation.pdf + pdfjs-hello_world_rotated.pdf + rot90-cropbox-bert.pdf<br><sub>merge-rotated</sub> | PASS | 23 pages, 648 KB | 34.7s, heap 8 MB |
| merge | pdfjs-nested_outline.pdf + us-budget-2024.pdf<br><sub>merge-outlines</sub> | PASS | 193 pages, 1.9 MB | 3.7s, heap 20 MB |
| merge | owner-only-tracemonkey.pdf + pdfjs-TAMReview.pdf<br><sub>merge-owner-only</sub> | PASS | 37 pages, 1.5 MB | 6.0s, heap 13 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | PASS | 14 pages -> 7 + 7 | 34.9s, heap 8 MB |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 3.3s, heap 9 MB |
| extract | us-budget-2024.pdf<br><sub>extract-budget-1-3-5</sub> | PASS | 3 pages out | 5.9s, heap 19 MB |
| remove | pdfjs-tracemonkey.pdf<br><sub>remove-tracemonkey-p1</sub> | PASS | 13 pages out | 3.2s, heap 8 MB |
| rotate | pdfjs-rotation.pdf<br><sub>rotate-rotation-quirk</sub> | PASS | 2 pages out | 2.5s, heap 8 MB |
| organize | pdfjs-tracemonkey.pdf<br><sub>organize-reverse-tracemonkey</sub> | PASS | 14 pages out | 3.5s, heap 8 MB |
| compress | lincoln-ellsworth-letter-1861.pdf<br><sub>compress-lincoln-scan</sub> | PASS | 529 KB -> 526 KB (99%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 1%) | 3.3s, heap 8 MB |
| compress | arxiv-2307.09288-llama2.pdf<br><sub>compress-llama2</sub> | PASS | 13.0 MB -> 12.6 MB (97%) | 9.4s, heap 9 MB |
| compress | pdfjs-tracemonkey.pdf<br><sub>compress-raster-tracemonkey</sub> | PASS | 992 KB -> 992 KB (100%), kept original | 8.7s, heap 11 MB |
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | PASS | recovered 1, rasterized 0, lost 0 | 2.7s, heap 11 MB |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | PASS |  | 2.4s |
| repair | irs-fw9.pdf<br><sub>g2-repair-keeps-fields</sub> | PASS | rewrite, 23 of 23 fields | 5.1s, heap 10 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-tracemonkey</sub> | PASS | 14 marks | 18.8s, heap 8 MB |
| watermark | pdfjs-rotation.pdf<br><sub>watermark-rotation-quirk</sub> | PASS | 2 marks | 0.1s, heap 13 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>watermark-rot90-cropbox</sub> | PASS | 16 marks | 4.5s, heap 9 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>pagenumbers-tracemonkey</sub> | PASS |  | 3.5s, heap 8 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>pagenumbers-rotation-quirk</sub> | PASS |  | 2.8s, heap 8 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>pagenumbers-rot90-cropbox</sub> | PASS |  | 1.0s, heap 14 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-template-skip</sub> | PASS |  | 0.4s, heap 14 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-facing</sub> | PASS |  | 1.7s, heap 8 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>g3-pagenumbers-bates-rot90</sub> | PASS |  | 0.5s, heap 11 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 2.9s, heap 8 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 1.4s, heap 8 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | PASS | centre (0.50, 0.85) | 0.5s, heap 11 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>g3-sign-multi-rot90</sub> | PASS |  | 0.6s, heap 12 MB |
| crop | pdfjs-tracemonkey.pdf<br><sub>crop-tracemonkey</sub> | PASS | CropBox 61,317,367,713 | 3.1s, heap 8 MB |
| crop | pdfjs-rotation.pdf<br><sub>crop-rotation-quirk</sub> | PASS | CropBox 61,317,367,713 | 2.8s, heap 8 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>crop-rot90-cropbox</sub> | PASS | CropBox 93,135,358,511 | 0.5s, heap 11 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>edit-tracemonkey</sub> | PASS |  | 2.9s, heap 8 MB |
| edit | pdfjs-rotation.pdf<br><sub>edit-rotation-quirk</sub> | PASS |  | 1.3s, heap 8 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>edit-rot90-cropbox</sub> | PASS |  | 4.0s, heap 8 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | PASS | Standard V5 R6 256-bit AES | 2.1s, heap 8 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 3.7s |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-permissions-only</sub> | PASS | Standard V5 R6 256-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 7.5s, heap 11 MB |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | PASS | removed: none listed, had user password | 3.0s, heap 8 MB |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | PASS | removed: none listed, had user password | 8.2s, heap 8 MB |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 2.2s, heap 8 MB |
| unlock | a-owner-only-us-budget.pdf<br><sub>g2-unlock-owner-only-fast</sub> | PASS | 3234 ms, removed: printing, copying text, editing | 7.9s, heap 10 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 397 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc" | 47.1s, heap 10 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-geometry</sub> | PASS | upright 45/46 median 1.7pt; turned 45/46 median 1.6pt; rot90crop 46/47 median 1.5pt; skew 41/43 median 1.8pt | 118.9s, heap 11 MB |
| ocr | udhr-chinese-simplified.pdf<br><sub>g2-ocr-scan-chinese</sub> | PASS | 451 words, 0 without a font, coverage 0.92, "世界 人 权 宣 告 联合 国 大 会 一 九 四 八 年 十 二 月 十 日" | 25.7s, heap 13 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-fax-force</sub> | PASS | 397 words on 2 pages (0 skipped), turned 0, "10/25/2008 15:38 FAX 202 225 1992 Congre" | 17.2s, heap 11 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>g2-ocr-skip-text-pages</sub> | PASS | read 1, skipped 2 | 6.2s, heap 13 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-cancel</sub> | PASS | stopped at 3007 ms during "Page 1 of 2, detecting orientation", next run 334 words | 37.3s, heap 10 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>pdf2word-tracemonkey-2col</sub> | PASS | coverage 0.94, 11 tables, 88 images; warn: column lines stay in reading order (30 of 43 line joins kept) | 12.5s, heap 12 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice</sub> | PASS | coverage 1.00, 3 tables, 1 images | 3.2s, heap 10 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>h-word-tracemonkey-columns</sub> | PASS | 108/109 joins, 2 broken hyphens, 11 tables, 4804 ms | 7.2s, heap 14 MB |
| pdf2word | aws-invoice.pdf<br><sub>h-word-aws-tables</sub> | PASS | 3 tables, 22 rows, 148 ms | 0.7s, heap 60 MB |
| pdf2word | pdfjs-ArabicCIDTrueType.pdf<br><sub>h-word-arabic-cid-logical</sub> | PASS | 4/4 RTL lines in reading order | 0.2s, heap 12 MB |
| pdf2word | sub-ndl-konoye-p1.pdf<br><sub>h-word-jpeg-scan-ndl</sub> | PASS | 1 OCR pages, 0 images, 13 words, 4.0 s | 4.2s, heap 14 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 73 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 3.3s, heap 11 MB |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | PASS | 1 sheets, 22 numbers, 0 numeric text, 1.2 s | 3.8s, heap 10 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>pdf2ppt-tracemonkey</sub> | PASS | 14 slides, 99 images, 2.0 MB | 9.7s, heap 20 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>h-ppt-tracemonkey-editable</sub> | PASS | 14 slides, 83231 chars, 99 media, 2.0 MB, 5.9 s | 7.8s, heap 16 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 85800 chars, 14 headings, 11 tables | 5.1s, heap 8 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | PASS | 85800 chars, 11 tables, 14 headings | 5.9s, heap 11 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 62 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 6.9s, heap 13 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | PASS | 2 pages, 8 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.8s, heap 10 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | PASS | 1 pages, 251 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 6.5s, heap 14 MB |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | PASS | 1 page(s), 8.5x5.7 in, 455 KB | 4.7s, heap 12 MB |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | PASS | 1 page(s), 23.0x17.5 in, 5.4 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) | 1.8s, heap 12 MB |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) | 1.6s, heap 8 MB |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | PASS | 1 page(s), 0.9x0.9 in, 8 KB | 0.2s, heap 8 MB |
| pdf2img | pdfjs-tracemonkey.pdf<br><sub>pdf2img-tracemonkey</sub> | PASS | ink 10.8%, 13.3% | 4.2s, heap 8 MB |
| pdf2img | rot90-cropbox-bert.pdf<br><sub>pdf2img-rot90-cropbox</sub> | PASS | ink 16.3% | 2.6s, heap 8 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 6.0x size; warn: size stays reasonable (<= 3x) (6.0x input) | 9.1s, heap 12 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.9x size; warn: size stays reasonable (<= 3x) (10.9x input) | 8.4s, heap 10 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.98x size, 451 ms | 3.9s, heap 26 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.12x size, 348 ms | 1.4s, heap 17 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.00x size, 41 ms | 0.5s, heap 17 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | PASS |  | 0.2s, heap 10 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | PASS |  | 6.1s, heap 10 MB |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | PASS |  | 1.8s, heap 10 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 123 ms | 1.0s, heap 15 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 1.1s, heap 11 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.4s, heap 14 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 0.9s, heap 10 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 87 ms, pdf.js 23, has XFA | 1.2s, heap 8 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 15 ms, pdf.js 0, has XFA | 1.6s, heap 8 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 1.3s, heap 15 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 1.0s, heap 19 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 17 ms | 2.7s, heap 8 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 0.5s, heap 9 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 2.5s, heap 8 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | PASS | +1213 -0, changed pages 3 | 2.6s, heap 10 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>g2-compare-inserted-overlay</sub> | PASS | 427 ms, +1213 -0, changed 3, overlay max 0.00% | 3.3s, heap 11 MB |
| compare | pdfjs-tracemonkey.pdf<br><sub>g2-compare-removed-page</sub> | PASS | 981 ms, -1260 words, changed pairs 4 | 2.3s, heap 17 MB |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | PASS | 1 pages, 230 KB; warn: selectable text (coverage 0.00) | 3.7s, heap 11 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-styled-report</sub> | PASS | 1 page(s), 152 KB, 849 ms | 2.3s, heap 10 MB |
| health | -<br><sub>health-selftest</sub> | PASS | 49 checks, 0 failed; warn: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) | 32.4s, heap 21 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-90</sub> | PASS | 9108 ms, turned 2 of 2, osd 270/0.4 270/2.2 | 12.8s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-90</sub> | PASS | 33741 ms, turned 36 of 36, osd 0/0.0 90/0.1 0/0.0 0/0.0 0/0.0 270/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/21.2 270/27.6 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/6.5 270/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/1.0 0/0.4 180/0.9 | 36.1s, heap 12 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-90</sub> | PASS | 3999 ms, turned 0 of 1, osd 270/1.2; warn: every page back upright (not detected: p1) | 6.6s, heap 11 MB |
| nup | pdfjs-tracemonkey.pdf<br><sub>u5a-nup4-tracemonkey</sub> | PASS | 14 pages on 4 sheets, 2x2, 10 markers placed right, 1.0 MB | 3.1s, heap 16 MB |
| nup | rot90-cropbox-bert.pdf<br><sub>u5a-nup9-a4-rot90-cropbox</sub> | PASS | 16 pages on 2 sheets, 3x3, 16 markers placed right, 0.7 MB | 0.6s, heap 19 MB |
| booklet | pdfjs-tracemonkey.pdf<br><sub>u5a-booklet-tracemonkey</sub> | PASS | 14 pages on 4 sheets, first sides -\|1 / 2\|- | 2.9s, heap 15 MB |
| scale | pdfjs-tracemonkey.pdf<br><sub>u5a-scale-a4-fit-tracemonkey</sub> | PASS | 14 pages, first 595x842 pt | 3.9s, heap 8 MB |
| scale | c-rot270-cropbox.pdf<br><sub>u5a-scale-letter-landscape-rot270</sub> | PASS | 2 pages, first 792x612 pt | 1.4s, heap 8 MB |
| singlepage | pdfjs-tracemonkey.pdf<br><sub>u5a-single-tracemonkey</sub> | PASS | 14 pages, 612 x 11088 pt | 2.0s, heap 8 MB |
| overlay | pdfjs-tracemonkey.pdf + aws-invoice.pdf<br><sub>u5a-overlay-interleaved-tracemonkey-aws</sub> | PASS | 14 pages, interleaved, foreground | 1.7s, heap 8 MB |
| stamp | pdfjs-tracemonkey.pdf<br><sub>u5a-stamp-topright-tokens-tracemonkey</sub> | PASS |  | 1.9s, heap 8 MB |
| stamp | rot90-cropbox-bert.pdf<br><sub>u5a-stamp-bottomleft-rot90-cropbox</sub> | PASS |  | 1.4s, heap 8 MB |
| removeblank | fax-jean-schmidt-doe.pdf<br><sub>u5a-blank-fax-inserted</sub> | PASS | found 1, 3 (inserted 1, 3) in 0.4 s | 1.7s, heap 8 MB |
| removeblank | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-blank-lincoln-scan-inserted</sub> | PASS | found 2, 7, 20, 40 (inserted 2, 7, 20, 40) in 13.5 s | 18.8s, heap 12 MB |
| linearize | pdfjs-tracemonkey.pdf<br><sub>u5a-lin-tracemonkey</sub> | PASS | 14 pages, 74 shared groups, 0.96 MB (input 0.97 MB), 220 ms | 2.0s, heap 8 MB |
| adjustcolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-adjust-contrast-fax</sub> | PASS | layers, change 21/24, worst MuPDF p2 mean 1.02 p99 2, 186 KB from 186 KB, 49 ms | 2.5s, heap 11 MB |
| replacecolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-replace-invert-fax</sub> | PASS | layers, change 224/243, worst pdf.js p2 mean 0.52 p99 0, 186 KB from 186 KB, 35 ms | 2.5s, heap 8 MB |
| bookmarks | pdfjs-outlines_se.pdf<br><sub>u5b-bookmarks-outlines-se</sub> | PASS | run to result 1014 ms: 6 bookmarks. | 6.3s, heap 11 MB |
| metadata | pdfjs-tracemonkey.pdf<br><sub>u5b-metadata-tracemonkey</sub> | PASS | run to result 1102 ms: Info and XMP updated. | 3.7s, heap 13 MB |
| attachments | pdfjs-tracemonkey.pdf<br><sub>u5b-attachments-tracemonkey</sub> | PASS | run to result 853 ms: 2 files attached. | 3.5s, heap 11 MB |
| removeannots | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-removeannots-tracemonkey</sub> | PASS | run to result 1188 ms: 4 annotations removed. | 2.8s, heap 12 MB |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | PASS | run to result 1130 ms: Images removed on 3 pages, 289.2 KB saved. | 2.5s, heap 11 MB |
| extractimages | aws-invoice.pdf<br><sub>u5b-extractimages-aws</sub> | PASS | run to result 946 ms: 1 image, 1 kept as JPEG. | 4.2s, heap 9 MB |
| extractimages | pdfjs-cmykjpeg.pdf<br><sub>u5b-extractimages-cmyk-png</sub> | PASS | run to result 745 ms: 1 image. | 5.4s, heap 8 MB |
| flatten | irs-fw9.pdf<br><sub>u5b-flatten-fw9</sub> | PASS | run to result 1091 ms: 23 fields flattened. | 3.4s, heap 15 MB |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-fw9</sub> | PASS | run to result 3153 ms: Unlocked 23 fields, 23 XFA locks. | 5.4s, heap 12 MB |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | PASS | run to result 873 ms: Removed 6 scripts, 1 XFA form. | 2.0s, heap 12 MB |
| sanitize | owner-only-aws-invoice.pdf<br><sub>u5b-sanitize-owner-only-aws</sub> | PASS | run to result 1604 ms: Nothing found to remove. | 5.9s, heap 11 MB |
| permissions | owner-only-aws-invoice.pdf<br><sub>u5b-permissions-owner-only-aws</sub> | PASS | run to result 926 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 2.5s, heap 11 MB |
| info | pdfjs-tracemonkey.pdf<br><sub>u5b-info-tracemonkey</sub> | PASS | run to result 682 ms: 14 pages, 24 fonts, 90 images. | 2.4s, heap 8 MB |
| autorename | pdfjs-tracemonkey.pdf<br><sub>u5b-autorename-tracemonkey</sub> | PASS | run to result 698 ms: Named after its heading. Was pdfjs-tracemonkey.pdf. | 3.0s, heap 13 MB |
| showjs | irs-fw9.pdf<br><sub>u5b-showjs-fw9</sub> | PASS | run to result 913 ms: 3 scripts. | 3.1s, heap 12 MB |
| intake | annotation-button-widget.pdf<br><sub>intake-forms/annotation-button-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.2 KB" | 0.6s |
| intake | irs-fw9.pdf<br><sub>intake-forms/irs-fw9.pdf</sub> | PASS | expect accept (6 p): "6 pages, 137.5 KB" | 0.6s |
| intake | xfa-issue14315.pdf<br><sub>intake-forms/xfa-issue14315.pdf</sub> | PASS | expect accept (1 p): "1 page, 11.3 KB" | 0.6s |
| intake | lincoln-ellsworth-letter-1861.pdf<br><sub>intake-scanned/lincoln-ellsworth-letter-1861.pdf</sub> | PASS | expect accept (36 p): "36 pages, 528.6 KB" | 0.6s |
| intake | arxiv-2005.14165-gpt3.pdf<br><sub>intake-reports/arxiv-2005.14165-gpt3.pdf</sub> | PASS | expect accept (75 p): "75 pages, 6.45 MB" | 0.9s |
| intake | us-budget-2024.pdf<br><sub>intake-reports/us-budget-2024.pdf</sub> | PASS | expect accept (184 p): "184 pages, 2.31 MB" | 3.5s |
| intake | pdfjs-ArabicCIDTrueType.pdf<br><sub>intake-intl/pdfjs-ArabicCIDTrueType.pdf</sub> | PASS | expect accept (1 p): "1 page, 38.4 KB" | 3.5s |
| intake | udhr-arabic.pdf<br><sub>intake-intl/udhr-arabic.pdf</sub> | PASS | expect accept (5 p): "5 pages, 184.8 KB" | 3.5s |
| intake | pdf20-image-bpc.pdf<br><sub>intake-quirks/pdf20-image-bpc.pdf</sub> | PASS | expect accept (1 p): "1 page, 8.8 KB" | 0.4s |
| intake | pdf20-utf8-test.pdf<br><sub>intake-quirks/pdf20-utf8-test.pdf</sub> | PASS | expect accept (1 p): "1 page, 13.6 KB" | 0.4s |
| intake | pdfjs-annotation-highlight-without-appearance.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight-without-appearance.pdf</sub> | PASS | expect accept (1 p): "1 page, 15.9 KB" | 0.4s |
| intake | pdfjs-bug1020226.pdf<br><sub>intake-quirks/pdfjs-bug1020226.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 1.0s |
| intake | pdfjs-encrypted-attachment.pdf<br><sub>intake-quirks/pdfjs-encrypted-attachment.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.0s |
| intake | pdfjs-issue21579.pdf<br><sub>intake-quirks/pdfjs-issue21579.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.0s |
| intake | pdfjs-issue3371.pdf<br><sub>intake-quirks/pdfjs-issue3371.pdf</sub> | PASS | expect password: "Password needed to open this file" | 1.0s |
| intake | pdfjs-jpx_smaskindata.pdf<br><sub>intake-quirks/pdfjs-jpx_smaskindata.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.5 KB" | 1.0s |
| intake | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-395-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 1.3s |
| intake | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-742-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 1.3s |
| intake | pdfjs-tracemonkey_with_annotations.pdf<br><sub>intake-quirks/pdfjs-tracemonkey_with_annotations.pdf</sub> | PASS | expect accept (14 p): "14 pages, 997.8 KB" | 1.7s |
| intake | pdfjs-xref_command_missing.pdf<br><sub>intake-quirks/pdfjs-xref_command_missing.pdf</sub> | PASS | expect accept (1 p): "1 page, 631 B" | 1.7s |
| intake | flipkart-invoice.pdf<br><sub>intake-invoices/flipkart-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 43.7 KB" | 1.7s |
| intake | a-owner-only-attention.pdf<br><sub>intake-derived/a-owner-only-attention.pdf</sub> | PASS | expect accept (15 p), encrypted: "15 pages, 1.99 MB" (Restrictions removed so the file can be edited) | 5.0s |
| intake | a-owner-only-us-budget.pdf<br><sub>intake-derived/a-owner-only-us-budget.pdf</sub> | PASS | expect accept (184 p), encrypted: "184 pages, 10.15 MB" (Restrictions removed so the file can be edited) | 7.6s |
| intake | compare-tracemonkey-base.pdf<br><sub>intake-derived/compare-tracemonkey-base.pdf</sub> | PASS | expect accept (5 p): "5 pages, 456.2 KB" | 7.6s |
| intake | owner-only-aws-invoice.pdf<br><sub>intake-derived/owner-only-aws-invoice.pdf</sub> | PASS | expect accept (1 p), encrypted: "1 page, 150.4 KB" (Restrictions removed so the file can be edited) | 1.6s |
| intake | owner-only-irs-fw9.pdf<br><sub>intake-derived/owner-only-irs-fw9.pdf</sub> | PASS | expect accept (6 p), encrypted: "6 pages, 220.0 KB" (Restrictions removed so the file can be edited) | 1.9s |
| intake | owner-only-tracemonkey.pdf<br><sub>intake-derived/owner-only-tracemonkey.pdf</sub> | PASS | expect accept (14 p), encrypted: "14 pages, 975.7 KB" (Restrictions removed so the file can be edited) | 2.2s |
| intake | rot90-cropbox-bert.pdf<br><sub>intake-derived/rot90-cropbox-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages, 647.9 KB" | 2.2s |
| intake | user-pw-TAMReview.pdf<br><sub>intake-derived/user-pw-TAMReview.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.5s |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf<br><sub>flow-merge</sub> | PASS | ready 5.2s, click to download 4.1s: merged.pdf: 30 pages, 1.55 MB | 11.7s, heap 13 MB |
| compress | us-budget-2024.pdf<br><sub>flow-compress</sub> | PASS | ready 6.1s, click to download 58.2s: us-budget-2024-compressed.pdf: 184 pages, 2.31 MB | 66.2s, heap 14 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | PASS | ready 2.1s, click to download 2.2s: 2 PDFs, 14 pages in total | 6.2s, heap 15 MB |
