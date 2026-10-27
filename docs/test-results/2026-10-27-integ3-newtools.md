# Corpus scorecard: 2026-10-27-integ3-newtools

Run: 2026-10-27 00:34 UTC, 8.2 min. Command: `npm run test:corpus -- --shards 4 --tool ocr,autorotate,protect,unlock,repair,compare,health,nup,booklet,scale,singlepage,stamp,removeblank,overlay,adjustcolors,replacecolors,linearize,bookmarks,metadata,attachments,removeannots,removeimages,sanitize,flatten,permissions,info,autorename,unlockforms,showjs,extractimages,redact --name 2026-10-27-integ3-newtools`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **220 PASS, 1 FAIL, 0 SKIP** of 221 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| repair | 10 | 0 | 0 | 88.4s |
| protect | 10 | 0 | 0 | 18.0s |
| unlock | 13 | 0 | 0 | 28.1s |
| ocr | 21 | 1 | 0 | 719.7s |
| redact | 25 | 0 | 0 | 62.3s |
| compare | 10 | 0 | 0 | 64.9s |
| health | 1 | 0 | 0 | 23.7s |
| autorotate | 12 | 0 | 0 | 186.1s |
| nup | 8 | 0 | 0 | 19.9s |
| booklet | 6 | 0 | 0 | 24.3s |
| scale | 7 | 0 | 0 | 13.8s |
| singlepage | 6 | 0 | 0 | 17.3s |
| overlay | 4 | 0 | 0 | 7.4s |
| stamp | 8 | 0 | 0 | 12.5s |
| removeblank | 4 | 0 | 0 | 16.4s |
| linearize | 6 | 0 | 0 | 14.0s |
| adjustcolors | 5 | 0 | 0 | 47.3s |
| replacecolors | 7 | 0 | 0 | 18.7s |
| bookmarks | 4 | 0 | 0 | 9.7s |
| metadata | 6 | 0 | 0 | 20.7s |
| attachments | 5 | 0 | 0 | 9.0s |
| removeannots | 3 | 0 | 0 | 4.1s |
| removeimages | 3 | 0 | 0 | 9.9s |
| extractimages | 5 | 0 | 0 | 9.1s |
| flatten | 5 | 0 | 0 | 13.3s |
| unlockforms | 4 | 0 | 0 | 26.2s |
| sanitize | 8 | 0 | 0 | 13.9s |
| permissions | 3 | 0 | 0 | 8.7s |
| info | 4 | 0 | 0 | 9.8s |
| autorename | 3 | 0 | 0 | 8.2s |
| showjs | 4 | 0 | 0 | 14.5s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT REPRODUCED | 1 linked check(s) passed, e.g. u5b-attachments-encrypted: passed |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT REPRODUCED | 25 linked check(s) passed, e.g. redact-tracemonkey: black box covers the word on screen; redact-aws-invoice: black box covers the word on screen |
| 3 | Redact search misses phrases split across text items | NOT REPRODUCED | 4 linked check(s) passed, e.g. redact-find-split-uk-IPPH353: search finds a phrase split across text items; redact-find-split-uk-AFPS-Form-17: search finds a phrase split across text items |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | NOT TESTED | no corpus case |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT TESTED | no corpus case |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT TESTED | no corpus case |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT TESTED | no corpus case |
| 10 | OCR English only, assets from CDN (not offline) | NOT REPRODUCED | 24 linked check(s) passed, e.g. ocr-fax-printed: no network fetches outside the page origin; ocr-fips-printed: no network fetches outside the page origin |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | SOFT WARN | soft only, 7 linked check(s) passed; warn: ocr-darwin-with-text-layer: skips pages that already have text (33 words before, +33 added); ocr-born-digital-invoice: skips pages that already have text (105 words before, +105 added) (+1 more) |
| 12 | Merge/split drop outlines, AcroForm, links | NOT TESTED | no corpus case |
| 13 | Crop rejects rotated, ignores box origin | NOT TESTED | no corpus case |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | NOT TESTED | no corpus case |
| 16 | PDF to Excel number parsing loses leading zeros / formats | NOT TESTED | no corpus case |
| 17 | PDF to PPT slides are flat images, fixed slide size | NOT TESTED | no corpus case |
| 18 | Office to PDF quick mode is screenshots (no text) | NOT TESTED | no corpus case |
| 19 | HiFi engine from unpinned CDN, font substitution | NOT TESTED | CDN pinning is a config review item; font fidelity not scored |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | NOT TESTED | no corpus case |
| 22 | Protect: comma in password splits MuPDF options | NOT REPRODUCED | 7 linked check(s) passed, e.g. protect-comma-password: comma password refused with a clear message; g2-protect-permissions-only: printing and copying blocked |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | NOT TESTED | no corpus case |
| 24 | Sign is visual only, one placement | NOT TESTED | feature gap (no PAdES / multi-place API to call) |
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 28 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (6.0x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (10.9x input) (+1 more) |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT REPRODUCED | 5 linked check(s) passed, e.g. repair-budget-bookmarks: bookmarks kept; repair-fw9-form: form fields kept |
| 27 | Compare by page index only; inserted page breaks the rest | NOT REPRODUCED | 6 linked check(s) passed, e.g. compare-inserted-page: only the inserted page differs; compare-911-self: passed |
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
| 42 | Self-test uses only synthetic fixtures | SOFT WARN | soft only, 0 linked check(s) passed; warn: health-selftest: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) |

## Failures by tool

- **ocr** (1): `g2-ocr-geometry` turned: output written

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | PASS | recovered 1, rasterized 0, lost 0 | 19.3s, heap 8 MB |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | PASS |  | 18.8s |
| repair | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>repair-fuzzed-395</sub> | PASS |  | 19.3s |
| repair | pdfjs-bug1020226.pdf<br><sub>repair-bug1020226</sub> | PASS |  | 19.3s |
| repair | pdfjs-Pages-tree-refs.pdf<br><sub>repair-pages-tree-refs</sub> | PASS | recovered 1, rasterized 0, lost 1 | 0.2s, heap 10 MB |
| repair | pdf20-offset-start.pdf<br><sub>repair-offset-start</sub> | PASS | recovered 1, rasterized 0, lost 0 | 0.1s, heap 10 MB |
| repair | us-budget-2024.pdf<br><sub>repair-budget-bookmarks</sub> | PASS | recovered 184, rasterized 0, lost 0 | 5.2s, heap 43 MB |
| repair | irs-fw9.pdf<br><sub>repair-fw9-form</sub> | PASS | recovered 6, rasterized 0, lost 0 | 0.6s, heap 10 MB |
| repair | us-budget-2024.pdf<br><sub>g2-repair-keeps-structure</sub> | PASS | rewrite, 27 of 27 bookmarks | 5.4s, heap 34 MB |
| repair | irs-fw9.pdf<br><sub>g2-repair-keeps-fields</sub> | PASS | rewrite, 23 of 23 fields | 0.2s, heap 12 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | PASS | Standard V5 R6 256-bit AES | 3.7s, heap 9 MB |
| protect | 911-commission-report.pdf<br><sub>protect-911-large</sub> | PASS | Standard V5 R6 256-bit AES | 1.9s, heap 10 MB |
| protect | owner-only-irs-fw9.pdf<br><sub>protect-owner-only-input</sub> | PASS | Standard V5 R6 256-bit AES | 2.5s, heap 8 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 2.7s |
| protect | aws-invoice.pdf<br><sub>protect-unicode-password</sub> | PASS | Standard V5 R6 256-bit AES | 3.1s, heap 9 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-permissions-only</sub> | PASS | Standard V5 R6 256-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 0.7s, heap 9 MB |
| protect | irs-fw9.pdf<br><sub>g2-protect-open-and-owner</sub> | PASS | {"print":true,"copy":true,"edit":false,"annotate":true,"form":true,"assemble":false,"print-hq":true} | 1.7s, heap 10 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-aes128-tracemonkey</sub> | PASS | Standard V4 R4 128-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":false,"assemble":true,"print-hq":false} | 0.6s, heap 10 MB |
| protect | aws-invoice.pdf<br><sub>g2-protect-rc4-40-invoice</sub> | PASS | Standard V1 R2 40-bit RC4, {"print":false,"copy":true,"edit":false,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 0.2s, heap 9 MB |
| protect | irs-fw9.pdf<br><sub>g2-protect-aes256-fw9</sub> | PASS | Standard V5 R6 256-bit AES, {"print":true,"copy":true,"edit":true,"annotate":true,"form":false,"assemble":false,"print-hq":false} | 1.0s, heap 9 MB |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | PASS | removed: none listed, had user password | 4.9s, heap 8 MB |
| unlock | pdfjs-issue6010_1.pdf<br><sub>unlock-issue6010_1</sub> | PASS | removed: none listed, had user password | 0.6s, heap 10 MB |
| unlock | pdfjs-issue6010_2.pdf<br><sub>unlock-issue6010_2</sub> | PASS | removed: none listed, had user password | 4.9s, heap 8 MB |
| unlock | pdfjs-bug1782186.pdf<br><sub>unlock-bug1782186</sub> | PASS | removed: none listed, had user password | 0.2s, heap 10 MB |
| unlock | pdfjs-issue21579.pdf<br><sub>unlock-issue21579</sub> | PASS | removed: copying text, editing, annotating, reordering pages, had user password | 3.2s, heap 10 MB |
| unlock | pdfjs-issue15893_reduced.pdf<br><sub>unlock-issue15893_reduced</sub> | PASS | removed: none listed, had user password | 4.9s, heap 8 MB |
| unlock | pdfjs-saslprep-r6.pdf<br><sub>unlock-saslprep-r6</sub> | PASS | removed: none listed, had user password | 0.3s, heap 10 MB |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | PASS | removed: none listed, had user password | 1.0s, heap 10 MB |
| unlock | pdfjs-empty_protected.pdf<br><sub>unlock-empty-protected</sub> | PASS | removed: copying text, editing, reordering pages | 0.3s, heap 10 MB |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 1.2s, heap 10 MB |
| unlock | owner-only-aws-invoice.pdf<br><sub>unlock-owner-only-invoice</sub> | PASS | removed: printing, high-quality printing, copying text | 1.0s, heap 10 MB |
| unlock | pdfjs-bug1782186.pdf<br><sub>unlock-wrong-password</sub> | PASS |  | 0.2s |
| unlock | a-owner-only-us-budget.pdf<br><sub>g2-unlock-owner-only-fast</sub> | PASS | 672 ms, removed: printing, copying text, editing | 5.3s, heap 10 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 397 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc" | 29.1s, heap 10 MB |
| ocr | sub-fips-p5-6.pdf<br><sub>ocr-fips-printed</sub> | PASS | 91 words, sample "N RS-466 PROCEDURES FOR DOCUMENT FACSIMILE TRANSMI" | 22.6s, heap 9 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>ocr-darwin-with-text-layer</sub> | PASS | 97 words, sample " CONTENTS PAGE EDITOR'S INTRODUCTION . 5 5 3 e o "; warn: skips pages that already have text (33 words before, +33 added) | 16.7s, heap 9 MB |
| ocr | sub-lincoln-p3-4.pdf<br><sub>ocr-lincoln-letter</sub> | PASS | 0 words, sample " "; warn: some text recognised (+0 words (OCR saw nothing: page renders blank, JPX scan)) | 5.9s, heap 10 MB |
| ocr | letter-to-benjamin-glover.pdf<br><sub>ocr-glover-handwritten</sub> | PASS | 449 words, sample "Tl , AR caiksie feATT \| \| i RE 0 ie \| \| Aili i pT " | 133.5s, heap 12 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>ocr-ndl-japanese-scan</sub> | PASS | 20 words, sample "¢- © - REN gE RTT ERY A TR a A RY A SN a IPS EVIDE" | 17.5s, heap 11 MB |
| ocr | oyo.pdf<br><sub>ocr-born-digital-invoice</sub> | PASS | 183 words, sample "OoYO PAYMENT RECEIPT Guest Name: Sanjay Date: 31/1"; warn: skips pages that already have text (105 words before, +105 added) | 8.6s, heap 11 MB |
| ocr | udhr-korean.pdf<br><sub>ocr-intl-korean</sub> | PASS | 376 words, sample "MA Ql MA ME DE QR FHM MEO EYE S551 FTE + gle HEE"; warn: skips pages that already have text (0 words before, +36 added) | 89.6s, heap 11 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-geometry</sub> | FAIL | turned: output written | 95.7s, heap 13 MB |
| ocr | udhr-chinese-simplified.pdf<br><sub>g2-ocr-scan-chinese</sub> | PASS | 451 words, 0 without a font, coverage 0.92, "世界 人 权 宣 告 联合 国 大 会 一 九 四 八 年 十 二 月 十 日" | 19.9s, heap 12 MB |
| ocr | udhr-japanese.pdf<br><sub>g2-ocr-scan-japanese</sub> | PASS | 399 words, 0 without a font, coverage 0.96, "『 世 界 人 権 宣言 』 ( 1948.12.10 第 3 回 国連 総会" | 17.9s, heap 13 MB |
| ocr | udhr-korean.pdf<br><sub>g2-ocr-scan-korean</sub> | PASS | 460 words, 0 without a font, coverage 0.99, "세계인권선언 전 문 모든 인류 구성원의 천부의 존엄성과 동등하고 양도" | 21.4s, heap 12 MB |
| ocr | udhr-arabic.pdf<br><sub>g2-ocr-scan-arabic</sub> | PASS | 290 words, 1 without a font, coverage 1.00, "UDHR - Arabic, Standard https://unicode." | 22.8s, heap 16 MB |
| ocr | udhr-hindi.pdf<br><sub>g2-ocr-scan-hindi</sub> | PASS | 547 words, 8 without a font, coverage undefined, "ह्ड - प़ंएतां मानव अधिकारों की सार्वमौम " | 30.5s, heap 20 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-scan-mixed-eng-deu</sub> | PASS | 724 words, 0 without a font, coverage 0.97, ". . . . . . Trace-based Just-in-Time Typ" | 32.9s, heap 24 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-fax-force</sub> | PASS | 397 words on 2 pages (0 skipped), turned 0, "10/25/2008 15:38 FAX 202 225 1992 Congre" | 18.7s, heap 15 MB |
| ocr | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-ocr-lincoln-36p</sub> | PASS | 80 words on 24 pages (12 skipped), turned 0, " TEL ey +o '] i ¥ 7, x - 3 - a, )" | 66.7s, heap 16 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-konoye-jpn</sub> | PASS | 21 words on 1 pages (0 skipped), turned 0, "ii \| TPS EVIDENTIARY DOCUMENT wo ンズ の 村 " | 18.6s, heap 14 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-ndl-japanese-handwritten</sub> | PASS | 21 words, 2 CJK characters; warn: Japanese characters recognised (2 CJK characters) | 21.6s, heap 16 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>g2-ocr-skip-text-pages</sub> | PASS | read 1, skipped 2 | 2.5s, heap 15 MB |
| ocr | oyo.pdf<br><sub>g2-ocr-force-text-pages</sub> | PASS | 183 words | 8.8s, heap 15 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-cancel</sub> | PASS | stopped at 3003 ms during "Page 1 of 2, recognizing", next run 334 words | 18.0s, heap 14 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 6.0x size; warn: size stays reasonable (<= 3x) (6.0x input) | 11.0s, heap 12 MB |
| redact | aws-invoice.pdf<br><sub>redact-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 5.2s, heap 11 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.9x size; warn: size stays reasonable (<= 3x) (10.9x input) | 7.5s, heap 13 MB |
| redact | pdfjs-rotation.pdf<br><sub>redact-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 4.5x size; warn: size stays reasonable (<= 3x) (4.5x input) | 2.5s, heap 9 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>redact-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 1.8s, heap 11 MB |
| redact | uk-IPPH353.pdf<br><sub>redact-find-split-uk-IPPH353</sub> | PASS |  | 0.4s, heap 11 MB |
| redact | uk-AFPS-Form-17.pdf<br><sub>redact-find-split-uk-AFPS-Form-17</sub> | PASS |  | 0.2s, heap 13 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.98x size, 407 ms | 1.9s, heap 10 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.12x size, 438 ms | 6.4s, heap 22 MB |
| redact | pdfjs-rotation.pdf<br><sub>g3-redact-remove-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 0.94x size, 6 ms | 0.2s, heap 11 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.00x size, 50 ms | 0.6s, heap 15 MB |
| redact | c-rot270-cropbox.pdf<br><sub>g3-redact-remove-rot270-cropbox</sub> | PASS | 16 boxes on 2 page(s), 1.07x size, 159 ms | 1.0s, heap 11 MB |
| redact | c-rot180-origin.pdf<br><sub>g3-redact-remove-rot180-origin</sub> | PASS | 16 boxes on 2 page(s), 1.07x size, 199 ms | 1.2s, heap 10 MB |
| redact | aws-invoice.pdf<br><sub>g3-redact-remove-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 42 ms | 0.6s, heap 12 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-image-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.88x size, 2985 ms | 6.6s, heap 15 MB |
| redact | flipkart-invoice.pdf<br><sub>g3-redact-remove-flipkart</sub> | PASS | 6 boxes on 1 page(s), 1.02x size, 27 ms | 1.1s, heap 11 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-image-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.96x size, 2928 ms | 6.7s, heap 13 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | PASS |  | 0.2s, heap 11 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | PASS |  | 0.4s, heap 11 MB |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | PASS |  | 1.3s, heap 10 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 113 ms | 0.9s, heap 11 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.2s, heap 16 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-regex-budget-phones</sub> | PASS | 6 boxes, (202) 512-1530, (888) 293-6498, (202) 512-1800 | 3.0s, heap 14 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.4s, heap 10 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 0.7s, heap 14 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 2.3s, heap 8 MB |
| compare | pdfjs-tracemonkey.pdf + pdfjs-tracemonkey_with_annotations.pdf<br><sub>compare-with-annotations</sub> | PASS | +0 -0, changed pages none | 3.3s, heap 9 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | PASS | +1213 -0, changed pages 3 | 0.7s, heap 11 MB |
| compare | 911-commission-report.pdf + 911-commission-report.pdf<br><sub>compare-911-self</sub> | PASS | +0 -0, changed pages none | 12.8s, heap 97 MB |
| compare | us-economic-report-president-2024.pdf + us-economic-report-president-2024.pdf<br><sub>compare-dense-econ-self</sub> | PASS | +0 -0, changed pages none | 20.1s, heap 148 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>g2-compare-inserted-overlay</sub> | PASS | 531 ms, +1213 -0, changed 3, overlay max 0.00% | 2.5s, heap 18 MB |
| compare | pdfjs-TAMReview.pdf + pdfjs-TAMReview.pdf<br><sub>g2-compare-tamreview-self</sub> | PASS | 724 ms, +0 -0, changed none, overlay max 0.00% | 5.0s, heap 13 MB |
| compare | aws-invoice.pdf + origin-shift-aws-invoice.pdf<br><sub>g2-compare-origin-shift</sub> | PASS | 107 ms, +0 -0, changed none, overlay max 0.00% | 0.4s, heap 10 MB |
| compare | pdfjs-tracemonkey.pdf<br><sub>g2-compare-removed-page</sub> | PASS | 841 ms, -1260 words, changed pairs 4 | 1.3s, heap 107 MB |
| compare | us-economic-report-president-2024.pdf<br><sub>g2-compare-dense-removed-page</sub> | PASS | 14019 ms, -251 words, changed pairs 10 | 16.4s, heap 150 MB |
| health | -<br><sub>health-selftest</sub> | PASS | 49 checks, 0 failed; warn: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) | 23.7s, heap 24 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-0</sub> | PASS | 4247 ms, turned 0 of 2, osd 0/4.9 0/5.5 | 6.5s, heap 10 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-90</sub> | PASS | 5095 ms, turned 2 of 2, osd 270/0.4 270/2.2 | 7.3s, heap 11 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-180</sub> | PASS | 6073 ms, turned 2 of 2, osd 180/3.4 180/5.3 | 7.2s, heap 10 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-270</sub> | PASS | 3724 ms, turned 2 of 2, osd 90/0.3 90/2.3 | 6.4s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-0</sub> | PASS | 37058 ms, turned 0 of 36, osd 0/0.0 180/0.1 180/0.6 0/0.0 0/0.0 0/4.3 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/20.4 0/30.3 0/0.0 0/0.0 180/1.0 180/0.8 0/0.0 0/0.0 0/0.0 0/0.0 0/9.6 0/1.3 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/0.5 0/0.0 180/0.2 | 38.2s, heap 11 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-90</sub> | PASS | 34516 ms, turned 36 of 36, osd 0/0.0 90/0.1 0/0.0 0/0.0 0/0.0 270/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/21.2 270/27.6 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/6.5 270/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/1.0 0/0.4 180/0.9 | 35.3s, heap 11 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-180</sub> | PASS | 30944 ms, turned 36 of 36, osd 0/0.0 0/0.0 0/0.7 0/0.0 0/0.0 180/3.5 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/18.5 180/30.7 0/0.0 0/0.0 0/1.0 0/0.6 0/0.0 0/0.0 0/0.0 0/0.0 180/8.4 180/1.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.5 0/0.0 0/0.4 | 31.3s, heap 11 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-270</sub> | PASS | 37249 ms, turned 36 of 36, osd 0/0.0 180/0.1 0/0.0 0/0.0 0/0.0 90/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 90/22.3 90/28.7 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 90/7.0 90/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/1.0 270/0.3 0/0.6 | 37.7s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-0</sub> | PASS | 4228 ms, turned 0 of 1, osd 0/0.4 | 4.4s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-90</sub> | PASS | 3803 ms, turned 0 of 1, osd 270/1.2; warn: every page back upright (not detected: p1) | 4.1s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-180</sub> | PASS | 3569 ms, turned 0 of 1, osd 180/0.4; warn: every page back upright (not detected: p1) | 3.9s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-270</sub> | PASS | 3499 ms, turned 0 of 1, osd 90/1.1; warn: every page back upright (not detected: p1) | 3.7s, heap 10 MB |
| nup | pdfjs-tracemonkey.pdf<br><sub>u5a-nup4-tracemonkey</sub> | PASS | 14 pages on 4 sheets, 2x2, 10 markers placed right, 1.0 MB | 3.6s, heap 9 MB |
| nup | aws-invoice.pdf<br><sub>u5a-nup2-aws-invoice</sub> | PASS | 1 pages on 1 sheets, 2x1, 1 markers placed right, 0.1 MB | 1.3s, heap 8 MB |
| nup | arxiv-1706.03762-attention.pdf<br><sub>u5a-nup6-cols-rtl-attention</sub> | PASS | 15 pages on 3 sheets, 3x2, 15 markers placed right, 1.8 MB | 7.6s, heap 29 MB |
| nup | rot90-cropbox-bert.pdf<br><sub>u5a-nup9-a4-rot90-cropbox</sub> | PASS | 16 pages on 2 sheets, 3x3, 16 markers placed right, 0.7 MB | 0.8s, heap 44 MB |
| nup | c-rot270-cropbox.pdf<br><sub>u5a-nup4-rot270-cropbox</sub> | PASS | 2 pages on 1 sheets, 2x2, 2 markers placed right, 0.2 MB | 0.3s, heap 19 MB |
| nup | origin-shift-aws-invoice.pdf<br><sub>u5a-nup2-origin-shift</sub> | PASS | 1 pages on 1 sheets, 2x1, 1 markers placed right, 0.1 MB | 0.2s, heap 16 MB |
| nup | c-mixed.pdf<br><sub>u5a-nup3x2-custom-mixed</sub> | PASS | 5 pages on 1 sheets, 3x2, 5 markers placed right, 0.5 MB | 0.3s, heap 19 MB |
| nup | arxiv-2307.09288-llama2.pdf<br><sub>u5a-nup16-llama2</sub> | PASS | 77 pages on 5 sheets, 4x4, 45 markers placed right, 13.2 MB | 5.7s, heap 31 MB |
| booklet | pdfjs-tracemonkey.pdf<br><sub>u5a-booklet-tracemonkey</sub> | PASS | 14 pages on 4 sheets, first sides -\|1 / 2\|- | 3.3s, heap 16 MB |
| booklet | aws-invoice.pdf<br><sub>u5a-booklet-aws-invoice</sub> | PASS | 1 pages on 1 sheets, first sides -\|1 / -\|- | 3.0s, heap 9 MB |
| booklet | arxiv-1706.03762-attention.pdf<br><sub>u5a-booklet-attention-spine-right-gutter</sub> | PASS | 15 pages on 4 sheets, first sides 1\|- / 15\|2 | 7.1s, heap 42 MB |
| booklet | c-mixed.pdf<br><sub>u5a-booklet-mixed-fronts</sub> | PASS | 5 pages on 2 sheets, first sides -\|1 / -\|3 | 1.7s, heap 8 MB |
| booklet | rot90-cropbox-bert.pdf<br><sub>u5a-booklet-flipshort-rot90-a4</sub> | PASS | 16 pages on 4 sheets, first sides 16\|1 / 2\|15 | 2.7s, heap 11 MB |
| booklet | arxiv-2307.09288-llama2.pdf<br><sub>u5a-booklet-llama2</sub> | PASS | 77 pages on 20 sheets, first sides -\|1 / 2\|- | 6.5s, heap 20 MB |
| scale | pdfjs-tracemonkey.pdf<br><sub>u5a-scale-a4-fit-tracemonkey</sub> | PASS | 14 pages, first 595x842 pt | 3.5s, heap 8 MB |
| scale | aws-invoice.pdf<br><sub>u5a-scale-half-aws-invoice</sub> | PASS | 1 pages, first 306x396 pt | 2.0s, heap 8 MB |
| scale | arxiv-1706.03762-attention.pdf<br><sub>u5a-scale-a3-attention</sub> | PASS | 15 pages, first 842x1191 pt | 5.1s, heap 38 MB |
| scale | c-rot270-cropbox.pdf<br><sub>u5a-scale-letter-landscape-rot270</sub> | PASS | 2 pages, first 792x612 pt | 0.3s, heap 44 MB |
| scale | rot90-cropbox-bert.pdf<br><sub>u5a-scale-a4-rot90-cropbox</sub> | PASS | 16 pages, first 842x595 pt | 2.2s, heap 8 MB |
| scale | origin-shift-aws-invoice.pdf<br><sub>u5a-scale-a5-origin-shift</sub> | PASS | 1 pages, first 420x595 pt | 0.2s, heap 48 MB |
| scale | c-mixed.pdf<br><sub>u5a-scale-150pc-mixed</sub> | PASS | 5 pages, first 918x1188 pt | 0.5s, heap 17 MB |
| singlepage | pdfjs-tracemonkey.pdf<br><sub>u5a-single-tracemonkey</sub> | PASS | 14 pages, 612 x 11088 pt | 2.7s, heap 8 MB |
| singlepage | aws-invoice.pdf<br><sub>u5a-single-aws-invoice</sub> | PASS | 1 pages, 612 x 792 pt | 2.3s, heap 9 MB |
| singlepage | arxiv-1706.03762-attention.pdf<br><sub>u5a-single-attention</sub> | PASS | 15 pages, 612 x 11880 pt | 4.6s, heap 26 MB |
| singlepage | c-mixed.pdf<br><sub>u5a-single-mixed</sub> | PASS | 5 pages, 792 x 2902 pt | 1.7s, heap 8 MB |
| singlepage | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-single-lincoln-scan-scaled</sub> | PASS | 36 pages, 330 x 14399 pt, scaled 79% | 0.3s, heap 18 MB |
| singlepage | arxiv-2307.09288-llama2.pdf<br><sub>u5a-single-llama2-scaled</sub> | PASS | 77 pages, 145 x 14399 pt, scaled 24% | 5.8s, heap 22 MB |
| overlay | pdfjs-tracemonkey.pdf + aws-invoice.pdf<br><sub>u5a-overlay-interleaved-tracemonkey-aws</sub> | PASS | 14 pages, interleaved, foreground | 1.9s, heap 9 MB |
| overlay | c-rot270-cropbox.pdf + aws-invoice.pdf<br><sub>u5a-overlay-background-rot270</sub> | PASS | 2 pages, interleaved, background | 2.6s, heap 8 MB |
| overlay | arxiv-1706.03762-attention.pdf + aws-invoice.pdf<br><sub>u5a-overlay-sequential-attention-aws</sub> | PASS | 15 pages, sequential, foreground | 2.3s, heap 25 MB |
| overlay | rot90-cropbox-bert.pdf + origin-shift-aws-invoice.pdf<br><sub>u5a-overlay-repeat3-rot90-origin</sub> | PASS | 16 pages, repeat, foreground | 0.5s, heap 12 MB |
| stamp | pdfjs-tracemonkey.pdf<br><sub>u5a-stamp-topright-tokens-tracemonkey</sub> | PASS |  | 2.0s, heap 8 MB |
| stamp | aws-invoice.pdf<br><sub>u5a-stamp-arabic-aws</sub> | PASS |  | 1.7s, heap 8 MB |
| stamp | arxiv-1706.03762-attention.pdf<br><sub>u5a-stamp-pages-2-3-attention</sub> | PASS |  | 4.4s, heap 22 MB |
| stamp | rot90-cropbox-bert.pdf<br><sub>u5a-stamp-bottomleft-rot90-cropbox</sub> | PASS |  | 0.3s, heap 25 MB |
| stamp | c-rot270-cropbox.pdf<br><sub>u5a-stamp-cjk-rot270</sub> | PASS |  | 1.1s, heap 12 MB |
| stamp | origin-shift-aws-invoice.pdf<br><sub>u5a-stamp-turned45-origin-shift</sub> | PASS |  | 0.1s, heap 17 MB |
| stamp | c-rot270-cropbox.pdf<br><sub>u5a-stamp-image-centre-rot270</sub> | PASS |  | 0.6s, heap 24 MB |
| stamp | c-mixed.pdf<br><sub>u5a-stamp-mixed-rotations</sub> | PASS |  | 2.3s, heap 8 MB |
| removeblank | fax-jean-schmidt-doe.pdf<br><sub>u5a-blank-fax-inserted</sub> | PASS | found 1, 3 (inserted 1, 3) in 0.5 s | 1.9s, heap 8 MB |
| removeblank | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-blank-lincoln-scan-inserted</sub> | PASS | found 2, 7, 20, 40 (inserted 2, 7, 20, 40) in 11.3 s | 12.9s, heap 12 MB |
| removeblank | c-mixed.pdf<br><sub>u5a-blank-mixed-inserted</sub> | PASS | found 3, 6 (inserted 3, 6) in 0.2 s | 1.0s, heap 11 MB |
| removeblank | pdfjs-tracemonkey.pdf<br><sub>u5a-blank-tracemonkey-none</sub> | PASS | found none (inserted none) in 0.4 s | 0.6s, heap 11 MB |
| linearize | pdfjs-tracemonkey.pdf<br><sub>u5a-lin-tracemonkey</sub> | PASS | 14 pages, 74 shared groups, 0.96 MB (input 0.97 MB), 190 ms | 1.8s, heap 8 MB |
| linearize | aws-invoice.pdf<br><sub>u5a-lin-aws-invoice</sub> | PASS | 1 pages, 18 shared groups, 0.15 MB (input 0.15 MB), 31 ms | 0.2s, heap 12 MB |
| linearize | arxiv-1706.03762-attention.pdf<br><sub>u5a-lin-attention</sub> | PASS | 15 pages, 78 shared groups, 2.06 MB (input 2.11 MB), 841 ms | 5.0s, heap 23 MB |
| linearize | rot90-cropbox-bert.pdf<br><sub>u5a-lin-rot90-cropbox</sub> | PASS | 16 pages, 95 shared groups, 0.71 MB (input 0.63 MB), 115 ms | 0.4s, heap 12 MB |
| linearize | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-lin-lincoln-relinearize</sub> | PASS | 36 pages, 6 shared groups, 0.52 MB (input 0.52 MB), 15 ms | 0.9s, heap 13 MB |
| linearize | arxiv-2307.09288-llama2.pdf<br><sub>u5a-lin-llama2</sub> | PASS | 77 pages, 102 shared groups, 12.97 MB (input 13.03 MB), 1365 ms | 5.6s, heap 15 MB |
| adjustcolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-adjust-contrast-fax</sub> | PASS | layers, change 21/24, worst MuPDF p2 mean 1.02 p99 2, 186 KB from 186 KB, 35 ms | 3.0s, heap 11 MB |
| adjustcolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-adjust-desat-lincoln</sub> | PASS | layers, change 17, worst MuPDF p1 mean 0.76 p99 2, 537 KB from 529 KB, 117 ms | 6.3s, heap 11 MB |
| adjustcolors | c-mixed.pdf<br><sub>u5a-adjust-bright-mixed</sub> | PASS | layers, change 36/37, worst MuPDF p1 mean 0.18 p99 1, 480 KB from 478 KB, 41 ms | 5.7s, heap 11 MB |
| adjustcolors | pdfjs-tracemonkey.pdf<br><sub>u5a-adjust-dark-tracemonkey</sub> | PASS | layers, change 72, worst pdf.js p1 mean 0.1 p99 1, 946 KB from 992 KB, 277 ms | 1.5s, heap 9 MB |
| adjustcolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-adjust-saturate-images-lincoln</sub> | PASS | images, change 16/20, worst MuPDF p2 mean 2.06 p99 8, 1949 KB from 529 KB, 26872 ms | 30.9s, heap 21 MB |
| replacecolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-replace-invert-fax</sub> | PASS | layers, change 224/243, worst pdf.js p2 mean 0.52 p99 0, 186 KB from 186 KB, 41 ms | 3.0s, heap 11 MB |
| replacecolors | pdfjs-tracemonkey.pdf<br><sub>u5a-replace-invert-tracemonkey</sub> | PASS | layers, change 228, worst MuPDF p1 mean 0.37 p99 0, 946 KB from 992 KB, 319 ms | 2.7s, heap 13 MB |
| replacecolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-replace-yellow-on-black-lincoln</sub> | PASS | layers, change 96/83, worst pdf.js p3 mean 0.37 p99 2, 537 KB from 529 KB, 94 ms | 4.2s, heap 10 MB |
| replacecolors | c-mixed.pdf<br><sub>u5a-replace-white-on-black-mixed</sub> | PASS | layers, change 234/234/227, worst MuPDF p1 mean 0.29 p99 1, 480 KB from 478 KB, 39 ms | 1.1s, heap 10 MB |
| replacecolors | aws-invoice.pdf<br><sub>u5a-replace-custom-aws</sub> | PASS | layers, change 12, worst MuPDF p1 mean 0.4 p99 1, 148 KB from 151 KB, 56 ms | 1.9s, heap 8 MB |
| replacecolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-replace-grayscale-lincoln</sub> | PASS | layers, change 29/27, worst MuPDF p1 mean 0.02 p99 1, 533 KB from 529 KB, 111 ms | 5.2s, heap 12 MB |
| replacecolors | c-rot270-cropbox.pdf<br><sub>u5a-replace-green-on-black-rot270</sub> | PASS | layers, change 234, worst pdf.js p1 mean 0.03 p99 1, 206 KB from 205 KB, 33 ms | 0.6s, heap 11 MB |
| bookmarks | pdfjs-outlines_se.pdf<br><sub>u5b-bookmarks-outlines-se</sub> | PASS | run to result 1949 ms: 6 bookmarks. | 4.2s, heap 11 MB |
| bookmarks | pdfjs-nested_outline.pdf<br><sub>u5b-bookmarks-nested</sub> | PASS | run to result 25 ms: 12 bookmarks. | 0.3s, heap 11 MB |
| bookmarks | pdfjs-tracemonkey.pdf<br><sub>u5b-bookmarks-tracemonkey</sub> | PASS | run to result 898 ms: 3 bookmarks. | 2.6s, heap 13 MB |
| bookmarks | arxiv-1706.03762-attention.pdf<br><sub>u5b-bookmarks-headings-attention</sub> | PASS | run to result 1299 ms: 13 bookmarks. | 2.6s, heap 24 MB |
| metadata | pdfjs-tracemonkey.pdf<br><sub>u5b-metadata-tracemonkey</sub> | PASS | run to result 3419 ms: Info and XMP updated. | 5.7s, heap 13 MB |
| metadata | pdfjs-tracemonkey.pdf<br><sub>u5b-metadata-tracemonkey-delete-all</sub> | PASS | run to result 1146 ms: All metadata removed. | 2.7s, heap 11 MB |
| metadata | aws-invoice.pdf<br><sub>u5b-metadata-aws</sub> | PASS | run to result 1251 ms: Info and XMP updated. | 3.2s, heap 9 MB |
| metadata | aws-invoice.pdf<br><sub>u5b-metadata-aws-delete-all</sub> | PASS | run to result 649 ms: All metadata removed. | 1.5s, heap 8 MB |
| metadata | arxiv-1706.03762-attention.pdf<br><sub>u5b-metadata-attention</sub> | PASS | run to result 1579 ms: Info and XMP updated. | 3.6s, heap 16 MB |
| metadata | arxiv-1706.03762-attention.pdf<br><sub>u5b-metadata-attention-delete-all</sub> | PASS | run to result 2001 ms: All metadata removed. | 3.9s, heap 28 MB |
| attachments | pdfjs-tracemonkey.pdf<br><sub>u5b-attachments-tracemonkey</sub> | PASS | run to result 1366 ms: 2 files attached. | 5.7s, heap 13 MB |
| attachments | aws-invoice.pdf<br><sub>u5b-attachments-aws</sub> | PASS | run to result 814 ms: 2 files attached. | 2.6s, heap 10 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-fileattachment</sub> | PASS | run to result 27 ms: 2 files attached. | 0.3s, heap 11 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-remove-annotation</sub> | PASS | run to result 8 ms, 1 attachment(s) | 0.1s, heap 12 MB |
| attachments | pdfjs-encrypted-attachment.pdf<br><sub>u5b-attachments-encrypted</sub> | PASS |  | 0.2s |
| removeannots | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-removeannots-tracemonkey</sub> | PASS | run to result 588 ms: 4 annotations removed. | 1.7s, heap 8 MB |
| removeannots | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-removeannots-fileattachment</sub> | PASS | run to result 710 ms: 1 annotation removed. | 2.1s, heap 8 MB |
| removeannots | irs-fw9.pdf<br><sub>u5b-removeannots-fw9-fields</sub> | PASS | run to result 108 ms: 23 annotations removed. | 0.3s, heap 9 MB |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | PASS | run to result 1178 ms: Images removed on 3 pages, 289.2 KB saved. | 2.6s, heap 12 MB |
| removeimages | aws-invoice.pdf<br><sub>u5b-removeimages-aws</sub> | PASS | run to result 894 ms: Images removed on 1 page, 69.3 KB saved. | 2.3s, heap 9 MB |
| removeimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-removeimages-attention</sub> | PASS | run to result 2430 ms: Images removed on 2 pages, 1.25 MB saved. | 5.0s, heap 18 MB |
| extractimages | pdfjs-tracemonkey.pdf<br><sub>u5b-extractimages-tracemonkey</sub> | PASS | run to result 606 ms: 90 images. | 1.8s, heap 8 MB |
| extractimages | aws-invoice.pdf<br><sub>u5b-extractimages-aws</sub> | PASS | run to result 959 ms: 1 image, 1 kept as JPEG. | 3.0s, heap 9 MB |
| extractimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-extractimages-attention</sub> | PASS | run to result 1448 ms: 3 images. | 3.6s, heap 18 MB |
| extractimages | pdfjs-cmykjpeg.pdf<br><sub>u5b-extractimages-cmyk-png</sub> | PASS | run to result 189 ms: 1 image. | 0.5s, heap 9 MB |
| extractimages | pdfjs-cmykjpeg.pdf<br><sub>u5b-extractimages-cmyk-jpg</sub> | PASS | run to result 107 ms: 1 image. | 0.3s, heap 19 MB |
| flatten | xfa-issue14315.pdf<br><sub>u5b-flatten-xfa-dynamic</sub> | PASS |  | 2.0s |
| flatten | irs-fw9.pdf<br><sub>u5b-flatten-fw9</sub> | PASS | run to result 1169 ms: 23 fields flattened. | 3.2s, heap 15 MB |
| flatten | uscis-i-9.pdf<br><sub>u5b-flatten-i9</sub> | PASS | run to result 1801 ms: 128 fields flattened. | 5.7s, heap 23 MB |
| flatten | irs-fw4.pdf<br><sub>u5b-flatten-fw4</sub> | PASS | run to result 450 ms: 48 fields flattened. | 1.5s, heap 23 MB |
| flatten | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-flatten-full-tracemonkey</sub> | PASS | run to result 429 ms: 4 annotations flattened. | 1.0s, heap 9 MB |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-fw9</sub> | PASS | run to result 817 ms: Unlocked 23 fields, 23 XFA locks. | 2.3s, heap 12 MB |
| unlockforms | uscis-i-9.pdf<br><sub>u5b-unlockforms-i9</sub> | PASS | run to result 1106 ms: Unlocked 128 fields. | 10.8s, heap 14 MB |
| unlockforms | xfa-imm1344e-filled.pdf<br><sub>u5b-unlockforms-xfa</sub> | PASS | run to result 758 ms: Unlocked 1 field, 299 XFA locks. | 3.2s, heap 11 MB |
| unlockforms | xfa-issue14315.pdf<br><sub>u5b-unlockforms-xfa-nothing-locked</sub> | PASS | run to result 1103 ms: No read-only fields, the file is unchanged. | 9.9s, heap 9 MB |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | PASS | run to result 795 ms: Removed 6 scripts, 1 XFA form. | 2.0s, heap 8 MB |
| sanitize | uscis-i-9.pdf<br><sub>u5b-sanitize-i9</sub> | PASS | run to result 887 ms: Removed 28 scripts, 32 triggers. | 2.5s, heap 14 MB |
| sanitize | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-sanitize-fileattachment</sub> | PASS | run to result 1203 ms: Removed 1 attached file. | 3.3s, heap 9 MB |
| sanitize | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-sanitize-all-tracemonkey</sub> | PASS | run to result 1471 ms: Removed 1 info dictionary, 24 embedded fonts. | 3.1s, heap 11 MB |
| sanitize | pdfjs-tracemonkey.pdf<br><sub>u5b-sanitize-tracemonkey</sub> | PASS | run to result 83 ms: Nothing found to remove. | 0.4s, heap 11 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-aws</sub> | PASS | run to result 8 ms: Nothing found to remove. | 0.1s, heap 14 MB |
| sanitize | arxiv-1706.03762-attention.pdf<br><sub>u5b-sanitize-attention</sub> | PASS | run to result 535 ms: Nothing found to remove. | 1.6s, heap 21 MB |
| sanitize | owner-only-aws-invoice.pdf<br><sub>u5b-sanitize-owner-only-aws</sub> | PASS | run to result 283 ms: Nothing found to remove. | 0.9s, heap 13 MB |
| permissions | owner-only-aws-invoice.pdf<br><sub>u5b-permissions-owner-only-aws</sub> | PASS | run to result 1041 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 4.2s, heap 11 MB |
| permissions | pdfjs-tracemonkey.pdf<br><sub>u5b-permissions-tracemonkey</sub> | PASS | run to result 318 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 0.9s, heap 11 MB |
| permissions | irs-fw9.pdf<br><sub>u5b-permissions-fw9</sub> | PASS | run to result 2123 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 3.6s, heap 12 MB |
| info | pdfjs-tracemonkey.pdf<br><sub>u5b-info-tracemonkey</sub> | PASS | run to result 513 ms: 14 pages, 24 fonts, 90 images. | 2.2s, heap 8 MB |
| info | aws-invoice.pdf<br><sub>u5b-info-aws</sub> | PASS | run to result 395 ms: 1 page, 3 fonts, 1 image. | 1.5s, heap 8 MB |
| info | irs-fw9.pdf<br><sub>u5b-info-fw9</sub> | PASS | run to result 553 ms: 6 pages, 6 fonts, 0 images. | 2.2s, heap 9 MB |
| info | arxiv-1706.03762-attention.pdf<br><sub>u5b-info-attention</sub> | PASS | run to result 1588 ms: 15 pages, 34 fonts, 3 images. | 3.8s, heap 18 MB |
| autorename | pdfjs-tracemonkey.pdf<br><sub>u5b-autorename-tracemonkey</sub> | PASS | run to result 687 ms: Named after its heading. Was pdfjs-tracemonkey.pdf. | 1.9s, heap 8 MB |
| autorename | arxiv-1706.03762-attention.pdf<br><sub>u5b-autorename-attention</sub> | PASS | run to result 1227 ms: Named after its heading. Was arxiv-1706.03762-attention.pdf. | 3.2s, heap 20 MB |
| autorename | aws-invoice.pdf<br><sub>u5b-autorename-aws</sub> | PASS | run to result 746 ms: Named after its heading. Was aws-invoice.pdf. | 3.0s, heap 8 MB |
| showjs | pdfjs-outlines_se.pdf<br><sub>u5b-showjs-none-outlines</sub> | PASS |  | 3.0s |
| showjs | irs-fw9.pdf<br><sub>u5b-showjs-fw9</sub> | PASS | run to result 410 ms: 3 scripts. | 2.1s, heap 8 MB |
| showjs | uscis-i-9.pdf<br><sub>u5b-showjs-i9</sub> | PASS | run to result 683 ms: 30 scripts. | 7.6s, heap 8 MB |
| showjs | xfa-issue14315.pdf<br><sub>u5b-showjs-xfa</sub> | PASS | run to result 407 ms: 3 scripts. | 1.8s, heap 8 MB |
