# Corpus scorecard: review-s2-quick

Run: 2026-10-27 10:00 UTC, 4.7 min. Command: `npm run test:corpus -- --quick --shards 4 --name review-s2-quick`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **187 PASS, 0 FAIL, 0 SKIP** of 187 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 5 | 0 | 0 | 64.8s |
| excel2pdf | 2 | 0 | 0 | 8.3s |
| ppt2pdf | 2 | 0 | 0 | 2.6s |
| html2pdf | 3 | 0 | 0 | 9.1s |
| merge | 5 | 0 | 0 | 72.1s |
| split | 3 | 0 | 0 | 14.9s |
| extract | 1 | 0 | 0 | 2.8s |
| remove | 1 | 0 | 0 | 0.9s |
| rotate | 1 | 0 | 0 | 0.9s |
| organize | 1 | 0 | 0 | 1.9s |
| compress | 4 | 0 | 0 | 73.7s |
| repair | 3 | 0 | 0 | 2.5s |
| watermark | 3 | 0 | 0 | 4.2s |
| pagenumbers | 6 | 0 | 0 | 6.5s |
| sign | 4 | 0 | 0 | 5.3s |
| crop | 3 | 0 | 0 | 3.5s |
| edit | 3 | 0 | 0 | 2.7s |
| protect | 3 | 0 | 0 | 3.9s |
| unlock | 4 | 0 | 0 | 7.0s |
| ocr | 6 | 0 | 0 | 182.7s |
| pdf2word | 6 | 0 | 0 | 17.4s |
| pdf2excel | 2 | 0 | 0 | 2.4s |
| pdf2ppt | 2 | 0 | 0 | 10.8s |
| pdf2md | 2 | 0 | 0 | 6.1s |
| img2pdf | 4 | 0 | 0 | 8.1s |
| pdf2img | 2 | 0 | 0 | 3.5s |
| redact | 27 | 0 | 0 | 32.3s |
| forms | 6 | 0 | 0 | 7.6s |
| compare | 4 | 0 | 0 | 10.0s |
| health | 1 | 0 | 0 | 20.0s |
| automate | 5 | 0 | 0 | 16.2s |
| autorotate | 3 | 0 | 0 | 51.5s |
| nup | 3 | 0 | 0 | 8.1s |
| booklet | 1 | 0 | 0 | 4.2s |
| scale | 3 | 0 | 0 | 6.4s |
| singlepage | 1 | 0 | 0 | 1.8s |
| overlay | 1 | 0 | 0 | 1.5s |
| stamp | 2 | 0 | 0 | 3.5s |
| removeblank | 2 | 0 | 0 | 17.6s |
| linearize | 2 | 0 | 0 | 5.9s |
| adjustcolors | 1 | 0 | 0 | 2.6s |
| replacecolors | 1 | 0 | 0 | 2.9s |
| bookmarks | 1 | 0 | 0 | 3.2s |
| metadata | 1 | 0 | 0 | 3.6s |
| attachments | 1 | 0 | 0 | 5.5s |
| removeannots | 1 | 0 | 0 | 6.0s |
| removeimages | 1 | 0 | 0 | 2.5s |
| extractimages | 2 | 0 | 0 | 7.2s |
| flatten | 1 | 0 | 0 | 3.1s |
| unlockforms | 1 | 0 | 0 | 3.8s |
| sanitize | 1 | 0 | 0 | 2.8s |
| permissions | 1 | 0 | 0 | 3.1s |
| info | 1 | 0 | 0 | 2.6s |
| autorename | 1 | 0 | 0 | 3.0s |
| showjs | 1 | 0 | 0 | 2.0s |
| intake | 29 | 0 | 0 | 89.5s |

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
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 11 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (5.9x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (10.8x input) |
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
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 30.9s, heap 29 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 2.0s, heap 27 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 1.2s, heap 29 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 0.6s, heap 21 MB |
| word2pdf | -<br><sub>i-engine-pinned-warm-boot</sub> | PASS | cold boot 16297 ms (download 4712 ms, cache false), warm boot 10976 ms | 27.4s, heap 40 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-convert-no-network</sub> | PASS |  | 1.4s, heap 23 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-styled-report</sub> | PASS | 1 page(s), 43 KB, 673 ms, coverage 0.98 | 2.1s, heap 24 MB |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf + arxiv-1512.03385-resnet.pdf<br><sub>merge-reports</sub> | PASS | 42 pages, 2.2 MB | 20.5s, heap 8 MB |
| merge | pdfjs-rotation.pdf + pdfjs-hello_world_rotated.pdf + rot90-cropbox-bert.pdf<br><sub>merge-rotated</sub> | PASS | 23 pages, 648 KB | 0.4s, heap 16 MB |
| merge | pdfjs-nested_outline.pdf + us-budget-2024.pdf<br><sub>merge-outlines</sub> | PASS | 193 pages, 1.9 MB | 21.7s, heap 20 MB |
| merge | owner-only-tracemonkey.pdf + pdfjs-TAMReview.pdf<br><sub>merge-owner-only</sub> | PASS | 37 pages, 1.5 MB | 20.6s, heap 8 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | PASS | 14 pages -> 7 + 7 | 1.9s, heap 8 MB |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 1.2s, heap 14 MB |
| extract | us-budget-2024.pdf<br><sub>extract-budget-1-3-5</sub> | PASS | 3 pages out | 2.8s, heap 18 MB |
| remove | pdfjs-tracemonkey.pdf<br><sub>remove-tracemonkey-p1</sub> | PASS | 13 pages out | 0.9s, heap 9 MB |
| rotate | pdfjs-rotation.pdf<br><sub>rotate-rotation-quirk</sub> | PASS | 2 pages out | 0.9s, heap 8 MB |
| organize | pdfjs-tracemonkey.pdf<br><sub>organize-reverse-tracemonkey</sub> | PASS | 14 pages out | 1.9s, heap 8 MB |
| compress | lincoln-ellsworth-letter-1861.pdf<br><sub>compress-lincoln-scan</sub> | PASS | 529 KB -> 526 KB (99%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 1%) | 1.1s, heap 8 MB |
| compress | arxiv-2307.09288-llama2.pdf<br><sub>compress-llama2</sub> | PASS | 13.0 MB -> 12.6 MB (97%) | 6.1s, heap 10 MB |
| compress | pdfjs-tracemonkey.pdf<br><sub>compress-raster-tracemonkey</sub> | PASS | 992 KB -> 992 KB (100%), kept original | 4.2s, heap 12 MB |
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | PASS | recovered 1, rasterized 0, lost 0 | 1.0s, heap 8 MB |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | PASS |  | 0.1s |
| repair | irs-fw9.pdf<br><sub>g2-repair-keeps-fields</sub> | PASS | rewrite, 23 of 23 fields | 1.4s, heap 8 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-tracemonkey</sub> | PASS | 14 marks | 1.9s, heap 8 MB |
| watermark | pdfjs-rotation.pdf<br><sub>watermark-rotation-quirk</sub> | PASS | 2 marks | 0.1s, heap 14 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>watermark-rot90-cropbox</sub> | PASS | 16 marks | 2.2s, heap 8 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>pagenumbers-tracemonkey</sub> | PASS |  | 1.2s, heap 8 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>pagenumbers-rotation-quirk</sub> | PASS |  | 0.8s, heap 8 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>pagenumbers-rot90-cropbox</sub> | PASS |  | 1.3s, heap 8 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-template-skip</sub> | PASS |  | 0.7s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-facing</sub> | PASS |  | 2.3s, heap 10 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>g3-pagenumbers-bates-rot90</sub> | PASS |  | 0.3s, heap 14 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 1.3s, heap 8 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 2.0s, heap 8 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | PASS | centre (0.50, 0.85) | 1.7s, heap 8 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>g3-sign-multi-rot90</sub> | PASS |  | 0.3s, heap 12 MB |
| crop | pdfjs-tracemonkey.pdf<br><sub>crop-tracemonkey</sub> | PASS | CropBox 61,317,367,713 | 1.5s, heap 8 MB |
| crop | pdfjs-rotation.pdf<br><sub>crop-rotation-quirk</sub> | PASS | CropBox 61,317,367,713 | 1.0s, heap 8 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>crop-rot90-cropbox</sub> | PASS | CropBox 93,135,358,511 | 1.0s, heap 8 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>edit-tracemonkey</sub> | PASS |  | 1.7s, heap 8 MB |
| edit | pdfjs-rotation.pdf<br><sub>edit-rotation-quirk</sub> | PASS |  | 0.8s, heap 8 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>edit-rot90-cropbox</sub> | PASS |  | 0.2s, heap 14 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | PASS | Standard V5 R6 256-bit AES | 1.3s, heap 8 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 1.1s |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-permissions-only</sub> | PASS | Standard V5 R6 256-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 1.5s, heap 9 MB |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | PASS | removed: none listed, had user password | 1.0s, heap 8 MB |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | PASS | removed: none listed, had user password | 1.1s, heap 8 MB |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 3.0s, heap 8 MB |
| unlock | a-owner-only-us-budget.pdf<br><sub>g2-unlock-owner-only-fast</sub> | PASS | 573 ms, removed: printing, copying text, editing | 1.9s, heap 11 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 397 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc" | 21.6s, heap 11 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-geometry</sub> | PASS | upright 45/46 median 1.7pt; turned 45/46 median 1.6pt; rot90crop 46/47 median 1.5pt; skew 41/43 median 1.8pt | 93.7s, heap 11 MB |
| ocr | udhr-chinese-simplified.pdf<br><sub>g2-ocr-scan-chinese</sub> | PASS | 451 words, 0 without a font, coverage 0.92, "世界 人 权 宣 告 联合 国 大 会 一 九 四 八 年 十 二 月 十 日" | 25.4s, heap 12 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-fax-force</sub> | PASS | 397 words on 2 pages (0 skipped), turned 0, "10/25/2008 15:38 FAX 202 225 1992 Congre" | 21.0s, heap 14 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>g2-ocr-skip-text-pages</sub> | PASS | read 1, skipped 2 | 5.4s, heap 10 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-cancel</sub> | PASS | stopped at 3007 ms during "Page 1 of 2, recognizing", next run 334 words | 15.7s, heap 12 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>pdf2word-tracemonkey-2col</sub> | PASS | coverage 0.94, 11 tables, 88 images; warn: column lines stay in reading order (30 of 43 line joins kept) | 4.5s, heap 23 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice</sub> | PASS | coverage 1.00, 3 tables, 1 images | 0.2s, heap 61 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>h-word-tracemonkey-columns</sub> | PASS | 108/109 joins, 2 broken hyphens, 11 tables, 3492 ms | 4.5s, heap 31 MB |
| pdf2word | aws-invoice.pdf<br><sub>h-word-aws-tables</sub> | PASS | 3 tables, 22 rows, 2011 ms | 3.9s, heap 8 MB |
| pdf2word | pdfjs-ArabicCIDTrueType.pdf<br><sub>h-word-arabic-cid-logical</sub> | PASS | 4/4 RTL lines in reading order | 0.2s, heap 60 MB |
| pdf2word | sub-ndl-konoye-p1.pdf<br><sub>h-word-jpeg-scan-ndl</sub> | PASS | 1 OCR pages, 0 images, 13 words, 3.8 s | 4.0s, heap 67 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 73 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 0.9s, heap 8 MB |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | PASS | 1 sheets, 22 numbers, 0 numeric text, 0.6 s | 1.4s, heap 8 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>pdf2ppt-tracemonkey</sub> | PASS | 14 slides, 99 images, 2.0 MB | 6.8s, heap 15 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>h-ppt-tracemonkey-editable</sub> | PASS | 14 slides, 83231 chars, 99 media, 2.0 MB, 3.8 s | 4.1s, heap 24 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 85800 chars, 14 headings, 11 tables | 3.7s, heap 12 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | PASS | 85800 chars, 11 tables, 14 headings | 2.4s, heap 20 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 62 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 6.3s, heap 14 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | PASS | 2 pages, 8 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 1.4s, heap 8 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | PASS | 1 pages, 251 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 4.5s, heap 13 MB |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | PASS | 1 page(s), 8.5x5.7 in, 455 KB | 4.2s, heap 12 MB |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | PASS | 1 page(s), 23.0x17.5 in, 5.4 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (23.0 x 17.5 in) | 3.2s, heap 8 MB |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | PASS | 3 page(s), 0.1x0.1 in, 4 KB; warn: output not bloated (<= 3x input) (4.8x input) | 0.6s, heap 8 MB |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | PASS | 1 page(s), 0.9x0.9 in, 8 KB | 0.1s, heap 10 MB |
| pdf2img | pdfjs-tracemonkey.pdf<br><sub>pdf2img-tracemonkey</sub> | PASS | ink 10.8%, 13.3% | 2.9s, heap 8 MB |
| pdf2img | rot90-cropbox-bert.pdf<br><sub>pdf2img-rot90-cropbox</sub> | PASS | ink 16.3% | 0.5s, heap 10 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.9x size; warn: size stays reasonable (<= 3x) (5.9x input) | 9.3s, heap 18 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.8x size; warn: size stays reasonable (<= 3x) (10.8x input) | 6.6s, heap 26 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.94x size, 613 ms | 1.7s, heap 11 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.00x size, 832 ms | 2.4s, heap 44 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 97 ms | 0.9s, heap 12 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | PASS |  | 1.5s, heap 8 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | PASS |  | 0.9s, heap 14 MB |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | PASS |  | 1.1s, heap 10 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-remove</sub> | PASS | review #1, raster pages none | 2.7s, heap 11 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-remove</sub> | PASS | review #2, raster pages none | 0.1s, heap 14 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 16 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 11 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-remove</sub> | PASS | review #4, raster pages none | 0.1s, heap 11 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-remove</sub> | PASS | review #5, raster pages 1 | 0.3s, heap 12 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-remove</sub> | PASS | review #6, raster pages none | 0.1s, heap 17 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-remove</sub> | PASS | review #7, raster pages none | 0.2s, heap 10 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-remove</sub> | PASS | review #8, raster pages none | 0.1s, heap 11 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-remove</sub> | PASS | review #r2-2, raster pages none | 0.2s, heap 14 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 17 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.3s, heap 11 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-remove</sub> | PASS | review #r2-3, raster pages none | 0.1s, heap 17 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-remove</sub> | PASS | review #r2-6, raster pages none | 0.1s, heap 15 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-remove</sub> | PASS |  | 0.4s, heap 15 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 256 ms | 1.1s, heap 11 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.3s, heap 11 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.5s, heap 12 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 0.8s, heap 14 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 76 ms, pdf.js 23, has XFA | 1.8s, heap 8 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 12 ms, pdf.js 0, has XFA | 1.2s, heap 8 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 1.3s, heap 15 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 2.8s, heap 8 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 2 ms | 0.2s, heap 16 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 0.2s, heap 16 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 1.8s, heap 8 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | PASS | +1213 -0, changed pages 3 | 2.9s, heap 8 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>g2-compare-inserted-overlay</sub> | PASS | 867 ms, +1213 -0, changed 3, overlay max 0.00% | 3.5s, heap 12 MB |
| compare | pdfjs-tracemonkey.pdf<br><sub>g2-compare-removed-page</sub> | PASS | 638 ms, -1260 words, changed pairs 4 | 1.8s, heap 8 MB |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | PASS | 1 pages, 230 KB; warn: selectable text (coverage 0.00) | 3.3s, heap 11 MB |
| html2pdf | -<br><sub>i-html2pdf-quick-styled-report</sub> | PASS | 1 page(s), 152 KB, 1242 ms | 3.8s, heap 12 MB |
| health | -<br><sub>health-selftest</sub> | PASS | 49 checks, 0 failed; warn: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) | 20.0s, heap 28 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-share-pdfjs-tracemonkey</sub> | PASS | run 1909 ms; Sanitize nochange, Flatten nochange, Remove annotations nochange, Metadata 541ms, Compress 710ms | 3.6s, heap 12 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-mail-pdfjs-tracemonkey</sub> | PASS | run 4047 ms; Compress 2367ms, Protect 1678ms | 5.6s, heap 12 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-draft-pdfjs-tracemonkey</sub> | PASS | run 858 ms; Page numbers 488ms, Watermark 360ms | 3.7s, heap 14 MB |
| automate | pdfjs-tracemonkey.pdf + aws-invoice.pdf + irs-fw9.pdf<br><sub>s3-batch-draft-3</sub> | PASS | batch run 584 ms for 3 files | 1.2s, heap 17 MB |
| automate | pdfjs-tracemonkey.pdf + xfa-imm1344e-filled.pdf + aws-invoice.pdf<br><sub>s3-batch-share-one-fails</sub> | PASS | batch run 1181 ms; failed: This is a dynamic XFA form: the form exists only as XFA, and this change would l | 2.2s, heap 17 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-90</sub> | PASS | 4223 ms, turned 2 of 2, osd 270/0.4 270/2.2 | 5.7s, heap 11 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-90</sub> | PASS | 37811 ms, turned 36 of 36, osd 0/0.0 90/0.1 0/0.0 0/0.0 0/0.0 270/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/21.2 270/27.6 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/6.5 270/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/1.0 0/0.4 180/0.9 | 41.4s, heap 13 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-90</sub> | PASS | 4074 ms, turned 0 of 1, osd 270/1.2; warn: every page back upright (not detected: p1) | 4.4s, heap 12 MB |
| nup | pdfjs-tracemonkey.pdf<br><sub>u5a-nup4-tracemonkey</sub> | PASS | 14 pages on 4 sheets, 2x2, 1.0 MB | 3.3s, heap 17 MB |
| nup | rot90-cropbox-bert.pdf<br><sub>u5a-nup9-a4-rot90-cropbox</sub> | PASS | 16 pages on 2 sheets, 3x3, 0.7 MB | 0.9s, heap 17 MB |
| nup | arxiv-1706.03762-attention.pdf<br><sub>u5a-nup2-raw-attention</sub> | PASS | 15 pages on 8 sheets, 2x1, 1.8 MB | 3.9s, heap 38 MB |
| booklet | pdfjs-tracemonkey.pdf<br><sub>u5a-booklet-tracemonkey</sub> | PASS | 14 pages on 4 sheets, first sides -\|1 / 2\|- | 4.2s, heap 8 MB |
| scale | pdfjs-tracemonkey.pdf<br><sub>u5a-scale-a4-fit-tracemonkey</sub> | PASS | 14 pages, first 595x842 pt | 2.5s, heap 14 MB |
| scale | c-rot270-cropbox.pdf<br><sub>u5a-scale-letter-landscape-rot270</sub> | PASS | 2 pages, first 792x612 pt | 1.5s, heap 8 MB |
| scale | arxiv-1706.03762-attention.pdf<br><sub>u5a-scale-half-raw-attention</sub> | PASS | 15 pages, first 306x396 pt | 2.3s, heap 27 MB |
| singlepage | pdfjs-tracemonkey.pdf<br><sub>u5a-single-tracemonkey</sub> | PASS | 14 pages, 612 x 11088 pt | 1.8s, heap 8 MB |
| overlay | pdfjs-tracemonkey.pdf + aws-invoice.pdf<br><sub>u5a-overlay-interleaved-tracemonkey-aws</sub> | PASS | 14 pages, interleaved, foreground | 1.5s, heap 8 MB |
| stamp | pdfjs-tracemonkey.pdf<br><sub>u5a-stamp-topright-tokens-tracemonkey</sub> | PASS |  | 1.7s, heap 8 MB |
| stamp | rot90-cropbox-bert.pdf<br><sub>u5a-stamp-bottomleft-rot90-cropbox</sub> | PASS |  | 1.8s, heap 8 MB |
| removeblank | fax-jean-schmidt-doe.pdf<br><sub>u5a-blank-fax-inserted</sub> | PASS | found 1, 3 (inserted 1, 3) in 0.4 s | 1.6s, heap 8 MB |
| removeblank | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-blank-lincoln-real</sub> | PASS | found 4, 7, 8, 9, 12, 16, 20, 22, 25, 26, 27, 28, 29, 30, 31, 32 (inserted none) in 13.2 s | 16.0s, heap 11 MB |
| linearize | pdfjs-tracemonkey.pdf<br><sub>u5a-lin-tracemonkey</sub> | PASS | 14 pages, 5 packed objects, 0.95 MB from 0.97 MB (0.98x), page 1 loads 177 -> 153 KB, 162 ms | 1.5s, heap 8 MB |
| linearize | us-budget-2024.pdf<br><sub>u5a-lin-us-budget-objstm</sub> | PASS | 184 pages, 25770 packed objects, 2.57 MB from 2.31 MB (1.11x), page 1 loads 313 -> 295 KB, 2506 ms | 4.4s, heap 39 MB |
| adjustcolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-adjust-contrast-fax</sub> | PASS | layers, change 21/24, worst MuPDF p2 mean 1.02 p99 2, 186 KB from 186 KB, 27 ms | 2.6s, heap 12 MB |
| replacecolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-replace-invert-fax</sub> | PASS | layers, change 224/243, worst pdf.js p2 mean 0.52 p99 0, 186 KB from 186 KB, 23 ms | 2.9s, heap 9 MB |
| bookmarks | pdfjs-outlines_se.pdf<br><sub>u5b-bookmarks-outlines-se</sub> | PASS | run to result 1340 ms: 6 bookmarks. | 3.2s, heap 12 MB |
| metadata | pdfjs-tracemonkey.pdf<br><sub>u5b-metadata-tracemonkey</sub> | PASS | run to result 1155 ms: Info and XMP updated. | 3.6s, heap 12 MB |
| attachments | pdfjs-tracemonkey.pdf<br><sub>u5b-attachments-tracemonkey</sub> | PASS | run to result 1595 ms: 2 files attached. | 5.5s, heap 12 MB |
| removeannots | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-removeannots-tracemonkey</sub> | PASS | run to result 1908 ms: 4 annotations removed. | 6.0s, heap 12 MB |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | PASS | run to result 890 ms: Images removed on 3 pages, 177.9 KB saved. | 2.5s, heap 12 MB |
| extractimages | aws-invoice.pdf<br><sub>u5b-extractimages-aws</sub> | PASS | run to result 1142 ms: 1 image, 1 kept as JPEG. | 4.7s, heap 9 MB |
| extractimages | pdfjs-cmykjpeg.pdf<br><sub>u5b-extractimages-cmyk-png</sub> | PASS | run to result 1024 ms: 1 image. | 2.5s, heap 10 MB |
| flatten | irs-fw9.pdf<br><sub>u5b-flatten-fw9</sub> | PASS | run to result 1341 ms: 23 fields flattened. | 3.1s, heap 16 MB |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-fw9</sub> | PASS | run to result 1012 ms: Unlocked 23 fields, 23 XFA locks. | 3.8s, heap 13 MB |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | PASS | run to result 1067 ms: Removed 6 scripts, 1 XFA form. | 2.8s, heap 11 MB |
| permissions | owner-only-aws-invoice.pdf<br><sub>u5b-permissions-owner-only-aws</sub> | PASS | run to result 1379 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 3.1s, heap 11 MB |
| info | pdfjs-tracemonkey.pdf<br><sub>u5b-info-tracemonkey</sub> | PASS | run to result 726 ms: 14 pages, 24 fonts, 90 images. | 2.6s, heap 12 MB |
| autorename | pdfjs-tracemonkey.pdf<br><sub>u5b-autorename-tracemonkey</sub> | PASS | run to result 772 ms: Named after its heading. Was pdfjs-tracemonkey.pdf. | 3.0s, heap 8 MB |
| showjs | irs-fw9.pdf<br><sub>u5b-showjs-fw9</sub> | PASS | run to result 515 ms: 3 XFA <script> tags, 0 self-closing, 0 empty | 2.0s, heap 8 MB |
| intake | annotation-button-widget.pdf<br><sub>intake-forms/annotation-button-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.2 KB" | 0.9s |
| intake | irs-fw9.pdf<br><sub>intake-forms/irs-fw9.pdf</sub> | PASS | expect accept (6 p): "6 pages, 137.5 KB" | 0.9s |
| intake | xfa-issue14315.pdf<br><sub>intake-forms/xfa-issue14315.pdf</sub> | PASS | expect accept (1 p): "1 page, 11.3 KB" | 0.9s |
| intake | lincoln-ellsworth-letter-1861.pdf<br><sub>intake-scanned/lincoln-ellsworth-letter-1861.pdf</sub> | PASS | expect accept (36 p): "36 pages, 528.6 KB" | 0.9s |
| intake | arxiv-2005.14165-gpt3.pdf<br><sub>intake-reports/arxiv-2005.14165-gpt3.pdf</sub> | PASS | expect accept (75 p): "75 pages, 6.45 MB" | 1.3s |
| intake | us-budget-2024.pdf<br><sub>intake-reports/us-budget-2024.pdf</sub> | PASS | expect accept (184 p): "184 pages, 2.31 MB" | 3.2s |
| intake | pdfjs-ArabicCIDTrueType.pdf<br><sub>intake-intl/pdfjs-ArabicCIDTrueType.pdf</sub> | PASS | expect accept (1 p): "1 page, 38.4 KB" | 3.6s |
| intake | udhr-arabic.pdf<br><sub>intake-intl/udhr-arabic.pdf</sub> | PASS | expect accept (5 p): "5 pages, 184.8 KB" | 3.6s |
| intake | pdf20-image-bpc.pdf<br><sub>intake-quirks/pdf20-image-bpc.pdf</sub> | PASS | expect accept (1 p): "1 page, 8.8 KB" | 0.7s |
| intake | pdf20-utf8-test.pdf<br><sub>intake-quirks/pdf20-utf8-test.pdf</sub> | PASS | expect accept (1 p): "1 page, 13.6 KB" | 0.7s |
| intake | pdfjs-annotation-highlight-without-appearance.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight-without-appearance.pdf</sub> | PASS | expect accept (1 p): "1 page, 15.9 KB" | 0.7s |
| intake | pdfjs-bug1020226.pdf<br><sub>intake-quirks/pdfjs-bug1020226.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 2.7s |
| intake | pdfjs-encrypted-attachment.pdf<br><sub>intake-quirks/pdfjs-encrypted-attachment.pdf</sub> | PASS | expect password: "Password needed to open this file" | 3.0s |
| intake | pdfjs-issue21579.pdf<br><sub>intake-quirks/pdfjs-issue21579.pdf</sub> | PASS | expect password: "Password needed to open this file" | 3.0s |
| intake | pdfjs-issue3371.pdf<br><sub>intake-quirks/pdfjs-issue3371.pdf</sub> | PASS | expect password: "Password needed to open this file" | 3.0s |
| intake | pdfjs-jpx_smaskindata.pdf<br><sub>intake-quirks/pdfjs-jpx_smaskindata.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.5 KB" | 3.0s |
| intake | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-395-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 1.7s |
| intake | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-742-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 1.7s |
| intake | pdfjs-tracemonkey_with_annotations.pdf<br><sub>intake-quirks/pdfjs-tracemonkey_with_annotations.pdf</sub> | PASS | expect accept (14 p): "14 pages, 997.8 KB" | 2.1s |
| intake | pdfjs-xref_command_missing.pdf<br><sub>intake-quirks/pdfjs-xref_command_missing.pdf</sub> | PASS | expect accept (1 p): "1 page, 631 B" | 2.1s |
| intake | flipkart-invoice.pdf<br><sub>intake-invoices/flipkart-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page, 43.7 KB" | 2.7s |
| intake | a-owner-only-attention.pdf<br><sub>intake-derived/a-owner-only-attention.pdf</sub> | PASS | expect accept (15 p), encrypted: "15 pages, 1.99 MB" (Restrictions removed so the file can be edited) | 3.7s |
| intake | a-owner-only-us-budget.pdf<br><sub>intake-derived/a-owner-only-us-budget.pdf</sub> | PASS | expect accept (184 p), encrypted: "184 pages, 10.15 MB" (Restrictions removed so the file can be edited) | 17.7s |
| intake | compare-tracemonkey-base.pdf<br><sub>intake-derived/compare-tracemonkey-base.pdf</sub> | PASS | expect accept (5 p): "5 pages, 456.2 KB" | 17.7s |
| intake | owner-only-aws-invoice.pdf<br><sub>intake-derived/owner-only-aws-invoice.pdf</sub> | PASS | expect accept (1 p), encrypted: "1 page, 150.4 KB" (Restrictions removed so the file can be edited) | 1.0s |
| intake | owner-only-irs-fw9.pdf<br><sub>intake-derived/owner-only-irs-fw9.pdf</sub> | PASS | expect accept (6 p), encrypted: "6 pages, 220.0 KB" (Restrictions removed so the file can be edited) | 1.4s |
| intake | owner-only-tracemonkey.pdf<br><sub>intake-derived/owner-only-tracemonkey.pdf</sub> | PASS | expect accept (14 p), encrypted: "14 pages, 975.7 KB" (Restrictions removed so the file can be edited) | 1.7s |
| intake | rot90-cropbox-bert.pdf<br><sub>intake-derived/rot90-cropbox-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages, 647.9 KB" | 1.7s |
| intake | user-pw-TAMReview.pdf<br><sub>intake-derived/user-pw-TAMReview.pdf</sub> | PASS | expect password: "Password needed to open this file" | 2.0s |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf<br><sub>flow-merge</sub> | PASS | ready 3.5s, click to download 3.0s: merged.pdf: 30 pages, 1.55 MB | 9.0s, heap 13 MB |
| compress | us-budget-2024.pdf<br><sub>flow-compress</sub> | PASS | ready 6.9s, click to download 54.0s: us-budget-2024-compressed.pdf: 184 pages, 2.31 MB | 62.2s, heap 14 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | PASS | ready 7.2s, click to download 4.1s: 2 PDFs, 14 pages in total | 11.8s, heap 12 MB |
