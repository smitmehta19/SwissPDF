# Corpus scorecard: polishB-touched

Run: 2026-10-27 17:50 UTC, 11.7 min. Command: `npm run test:corpus -- --light --shards 2 --tool removeannots,split,booklet,ocr,autorotate,bookmarks,pdf2md,sign,info,forms,protect,compare,redact,sanitize,showjs,removeimages,attachments --name polishB-touched`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **239 PASS, 0 FAIL, 0 SKIP** of 239 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| split | 6 | 0 | 0 | 15.6s |
| sign | 16 | 0 | 0 | 5.2s |
| protect | 16 | 0 | 0 | 4.4s |
| ocr | 22 | 0 | 0 | 360.5s |
| pdf2md | 12 | 0 | 0 | 11.8s |
| redact | 56 | 0 | 0 | 40.2s |
| forms | 40 | 0 | 0 | 16.3s |
| compare | 10 | 0 | 0 | 33.5s |
| autorotate | 12 | 0 | 0 | 101.4s |
| booklet | 8 | 0 | 0 | 11.7s |
| bookmarks | 6 | 0 | 0 | 5.4s |
| attachments | 8 | 0 | 0 | 7.3s |
| sanitize | 9 | 0 | 0 | 5.6s |
| removeannots | 4 | 0 | 0 | 1.9s |
| removeimages | 5 | 0 | 0 | 3.7s |
| info | 4 | 0 | 0 | 2.7s |
| showjs | 5 | 0 | 0 | 1.7s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT TESTED | no corpus case |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT REPRODUCED | 25 linked check(s) passed, e.g. redact-tracemonkey: black box covers the word on screen; redact-aws-invoice: black box covers the word on screen |
| 3 | Redact search misses phrases split across text items | NOT REPRODUCED | 4 linked check(s) passed, e.g. redact-find-split-uk-IPPH353: search finds a phrase split across text items; redact-find-split-uk-AFPS-Form-17: search finds a phrase split across text items |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | NOT TESTED | no corpus case |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT TESTED | no corpus case |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT REPRODUCED | 18 linked check(s) passed, e.g. sign-tracemonkey: signature where the user clicked (50%, 85%), upright; sign-rotation-quirk: signature where the user clicked (50%, 85%), upright |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT REPRODUCED | 10 linked check(s) passed, e.g. c-forms-fill-zh: value stored in the field; c-forms-fill-zh-flat: flattened value extracts back (pdf.js) |
| 10 | OCR English only, assets from CDN (not offline) | NOT REPRODUCED | 24 linked check(s) passed, e.g. ocr-fax-printed: no network fetches outside the page origin; ocr-fips-printed: no network fetches outside the page origin |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | SOFT WARN | soft only, 8 linked check(s) passed; warn: ocr-darwin-with-text-layer: skips pages that already have text (33 words before, +33 added); ocr-born-digital-invoice: skips pages that already have text (105 words before, +106 added) (+1 more) |
| 12 | Merge/split drop outlines, AcroForm, links | NOT REPRODUCED | 2 linked check(s) passed, e.g. split-budget-bookmarks: bookmarks kept in parts; split-form-f1040: form fields kept in parts |
| 13 | Crop rejects rotated, ignores box origin | NOT TESTED | no corpus case |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | NOT REPRODUCED | 2 linked check(s) passed, e.g. h-md-tracemonkey-columns: column lines stay in reading order (90%+); h-md-bert-columns: column lines stay in reading order (90%+) |
| 16 | PDF to Excel number parsing loses leading zeros / formats | NOT TESTED | no corpus case |
| 17 | PDF to PPT slides are flat images, fixed slide size | NOT TESTED | no corpus case |
| 18 | Office to PDF quick mode is screenshots (no text) | NOT TESTED | no corpus case |
| 19 | HiFi engine from unpinned CDN, font substitution | NOT TESTED | CDN pinning is a config review item; font fidelity not scored |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT REPRODUCED | 3 linked check(s) passed, e.g. pdf2md-noembed-sjis: words carried over (85%+); pdf2md-noembed-eucjp: words carried over (85%+) |
| 21 | Forms: XFA not handled, slow widget map | NOT REPRODUCED | 35 linked check(s) passed, e.g. forms-list-irs-f1040: field scan under 10 s; forms-list-irs-fw9: field scan under 10 s |
| 22 | Protect: comma in password splits MuPDF options | NOT REPRODUCED | 7 linked check(s) passed, e.g. protect-comma-password: comma password refused with a clear message; g2-protect-permissions-only: printing and copying blocked |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | NOT TESTED | no corpus case |
| 24 | Sign is visual only, one placement | NOT REPRODUCED | 3 linked check(s) passed, e.g. g3-sign-multi-rot90: signature and initials on page 1; g3-sign-multi-rot90: initials on every page, where placed |
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 28 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (5.9x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (10.8x input) (+1 more) |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT TESTED | no corpus case |
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
| 42 | Self-test uses only synthetic fixtures | NOT TESTED | no corpus case |

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | PASS | 14 pages -> 7 + 7 | 5.0s, heap 9 MB |
| split | us-budget-2024.pdf<br><sub>split-budget-bookmarks</sub> | PASS | 184 pages -> 92 + 92 | 4.3s, heap 44 MB |
| split | 911-commission-report.pdf<br><sub>split-911-large</sub> | PASS | 585 pages -> 292 + 293 | 2.5s, heap 53 MB |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 0.8s, heap 53 MB |
| split | irs-f1040.pdf<br><sub>split-form-f1040</sub> | PASS | 2 pages -> 1 + 1 | 0.5s, heap 14 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 1.4s, heap 9 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 0.2s, heap 13 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | PASS | centre (0.50, 0.85) | 0.4s, heap 13 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>sign-origin-shift</sub> | PASS | centre (0.50, 0.85) | 0.1s, heap 13 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>sign-issue1155r-origin</sub> | PASS | centre (0.50, 0.85) | 0.6s, heap 13 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>c-sign-rot90-cropbox</sub> | PASS |  | 0.2s, heap 14 MB |
| sign | pdfjs-hello_world_rotated.pdf<br><sub>c-sign-hello-rot90</sub> | PASS |  | 0.1s, heap 16 MB |
| sign | pdfjs-rotation.pdf<br><sub>c-sign-rotation-quirk</sub> | PASS |  | 0.1s, heap 14 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>c-sign-issue1155r-crop</sub> | PASS |  | 0.1s, heap 14 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>c-sign-origin-shift</sub> | PASS |  | 0.1s, heap 14 MB |
| sign | xfa-imm1344e-filled.pdf<br><sub>c-sign-xfa-origin</sub> | PASS |  | 0.9s, heap 15 MB |
| sign | c-rot180-origin.pdf<br><sub>c-sign-c-rot180-origin</sub> | PASS |  | 0.1s, heap 10 MB |
| sign | c-rot270-cropbox.pdf<br><sub>c-sign-c-rot270-cropbox</sub> | PASS |  | 0.2s, heap 11 MB |
| sign | c-mixed.pdf<br><sub>c-sign-c-mixed</sub> | PASS |  | 0.2s, heap 12 MB |
| sign | fax-jean-schmidt-doe.pdf<br><sub>c-sign-fax-mixed</sub> | PASS |  | 0.1s, heap 14 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>g3-sign-multi-rot90</sub> | PASS |  | 0.3s, heap 14 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | PASS | Standard V5 R6 256-bit AES | 1.2s, heap 9 MB |
| protect | 911-commission-report.pdf<br><sub>protect-911-large</sub> | PASS | Standard V5 R6 256-bit AES | 0.7s, heap 10 MB |
| protect | owner-only-irs-fw9.pdf<br><sub>protect-owner-only-input</sub> | PASS | Standard V5 R6 256-bit AES | 0.3s, heap 9 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 0.1s |
| protect | aws-invoice.pdf<br><sub>protect-unicode-password</sub> | PASS | Standard V5 R6 256-bit AES | 0.2s, heap 9 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-permissions-only</sub> | PASS | Standard V5 R6 256-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 0.3s, heap 9 MB |
| protect | irs-fw9.pdf<br><sub>g2-protect-open-and-owner</sub> | PASS | {"print":true,"copy":true,"edit":false,"annotate":true,"form":true,"assemble":false,"print-hq":true} | 0.2s, heap 9 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-aes128-tracemonkey</sub> | PASS | Standard V4 R4 128-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":false,"assemble":true,"print-hq":false} | 0.2s, heap 9 MB |
| protect | aws-invoice.pdf<br><sub>g2-protect-rc4-40-invoice</sub> | PASS | Standard V1 R2 40-bit RC4, {"print":false,"copy":true,"edit":false,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 0.1s, heap 10 MB |
| protect | irs-fw9.pdf<br><sub>g2-protect-aes256-fw9</sub> | PASS | Standard V5 R6 256-bit AES, {"print":true,"copy":true,"edit":true,"annotate":true,"form":false,"assemble":false,"print-hq":false} | 0.2s, heap 10 MB |
| protect | aws-invoice.pdf<br><sub>g2-protect-aes256-unicode-pdfjs</sub> | PASS |  | 0.2s, heap 10 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes128-emoji-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-rc4-nbsp-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes128-cjk-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes256-softhyphen-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes256-fullwidth-refused</sub> | PASS |  | 0.1s |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 423 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc" | 14.0s, heap 10 MB |
| ocr | sub-fips-p5-6.pdf<br><sub>ocr-fips-printed</sub> | PASS | 92 words, sample "N RS-466 PROCEDURES FOR DOCUMENT FACSIMILE TRANSMI" | 8.2s, heap 11 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>ocr-darwin-with-text-layer</sub> | PASS | 106 words, sample " CONTENTS PAGE EDITOR'S INTRODUCTION . 5 5 3 e o "; warn: skips pages that already have text (33 words before, +33 added) | 4.0s, heap 10 MB |
| ocr | sub-lincoln-p3-4.pdf<br><sub>ocr-lincoln-letter</sub> | PASS | 0 words, sample " "; warn: some text recognised (+0 words (OCR saw nothing: page renders blank, JPX scan)) | 2.7s, heap 11 MB |
| ocr | letter-to-benjamin-glover.pdf<br><sub>ocr-glover-handwritten</sub> | PASS | 1616 words, sample "Tl , AR caiksie feATT \| \| i RE 0 ie \| \| Aili i pT " | 61.0s, heap 11 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>ocr-ndl-japanese-scan</sub> | PASS | 25 words, sample "¢- © - REN gE RTT ERY A TR a A RY A SN a IPS EVIDE" | 9.0s, heap 17 MB |
| ocr | oyo.pdf<br><sub>ocr-born-digital-invoice</sub> | PASS | 184 words, sample "OoYO PAYMENT RECEIPT Guest Name: Sanjay Date: 31/1"; warn: skips pages that already have text (105 words before, +106 added) | 5.3s, heap 11 MB |
| ocr | udhr-korean.pdf<br><sub>ocr-intl-korean</sub> | PASS | 674 words, sample "MA Ql MA ME DE QR FHM MEO EYE S551 FTE + gle HEE"; warn: skips pages that already have text (0 words before, +86 added) | 45.2s, heap 12 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-geometry</sub> | PASS | upright 46/47 median 1.7pt; turned 45/46 median 1.6pt; rot90crop 46/47 median 1.5pt; skew 41/43 median 1.8pt | 47.5s, heap 15 MB |
| ocr | udhr-chinese-simplified.pdf<br><sub>g2-ocr-scan-chinese</sub> | PASS | 464 words, 0 without a font, coverage 0.94, "世界 人 权 宣 告 联合 国 大 会 一 九 四 八 年 十 二 月 十 日" | 11.1s, heap 14 MB |
| ocr | udhr-japanese.pdf<br><sub>g2-ocr-scan-japanese</sub> | PASS | 401 words, 0 without a font, coverage 0.96, "『 世 界 人 権 宣言 』 ( 1948.12.10 第 3 回 国連 総会" | 10.3s, heap 13 MB |
| ocr | udhr-korean.pdf<br><sub>g2-ocr-scan-korean</sub> | PASS | 460 words, 0 without a font, coverage 0.99, "세계인권선언 전 문 모든 인류 구성원의 천부의 존엄성과 동등하고 양도" | 10.0s, heap 16 MB |
| ocr | udhr-arabic.pdf<br><sub>g2-ocr-scan-arabic</sub> | PASS | 290 words, 1 without a font, coverage 1.00, "UDHR - Arabic, Standard https://unicode." | 10.0s, heap 19 MB |
| ocr | udhr-hindi.pdf<br><sub>g2-ocr-scan-hindi</sub> | PASS | 554 words, 8 without a font, coverage undefined, "ह्ड - प़ंएतां मानव अधिकारों की सार्वमौम " | 16.8s, heap 23 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-scan-mixed-eng-deu</sub> | PASS | 735 words, 0 without a font, coverage 0.99, ". . . . . . Trace-based Just-in-Time Typ" | 16.9s, heap 16 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-fax-force</sub> | PASS | 423 words on 2 pages (0 skipped), turned 0, "10/25/2008 15:38 FAX 202 225 1992 Congre" | 11.1s, heap 17 MB |
| ocr | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-ocr-lincoln-36p</sub> | PASS | 153 words on 24 pages (12 skipped), turned 0, " TEL ey +o '] i ¥ 7, x - 3 - a, )" | 36.7s, heap 17 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-konoye-jpn</sub> | PASS | 24 words on 1 pages (0 skipped), turned 0, "ii \| TPS EVIDENTIARY DOCUMENT wo ンズ の 村 " | 10.8s, heap 16 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-ndl-japanese-handwritten</sub> | PASS | 24 words, 5 CJK characters | 11.3s, heap 15 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>g2-ocr-skip-text-pages</sub> | PASS | read 1, skipped 2 | 1.9s, heap 16 MB |
| ocr | oyo.pdf<br><sub>g2-ocr-force-text-pages</sub> | PASS | 184 words | 5.5s, heap 16 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-cancel</sub> | PASS | stopped at 3007 ms during "Page 1 of 2, recognizing", next run 355 words | 11.3s, heap 17 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 85802 chars, 14 headings, 11 tables | 4.2s, heap 12 MB |
| pdf2md | us-budget-2024.pdf<br><sub>pdf2md-budget</sub> | PASS | 596818 chars, 29 headings, 125 tables | 3.0s, heap 28 MB |
| pdf2md | aws-invoice.pdf<br><sub>pdf2md-aws-invoice</sub> | PASS | 2073 chars, 4 headings, 3 tables | 0.2s, heap 34 MB |
| pdf2md | udhr-chinese-simplified.pdf<br><sub>pdf2md-chinese</sub> | PASS | 5895 chars, 0 headings, 0 tables | 0.3s, heap 36 MB |
| pdf2md | udhr-japanese.pdf<br><sub>pdf2md-japanese</sub> | PASS | 4587 chars, 0 headings, 0 tables | 0.2s, heap 44 MB |
| pdf2md | pdfjs-noembed-sjis.pdf<br><sub>pdf2md-noembed-sjis</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.1s, heap 48 MB |
| pdf2md | pdfjs-noembed-eucjp.pdf<br><sub>pdf2md-noembed-eucjp</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.1s, heap 48 MB |
| pdf2md | pdfjs-vertical.pdf<br><sub>pdf2md-vertical</sub> | PASS | 20 chars, 0 headings, 0 tables | 0.1s, heap 48 MB |
| pdf2md | udhr-arabic.pdf<br><sub>pdf2md-arabic</sub> | PASS | 8269 chars, 0 headings, 0 tables | 0.2s, heap 48 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | PASS | 85802 chars, 11 tables, 14 headings | 1.9s, heap 41 MB |
| pdf2md | arxiv-1810.04805-bert.pdf<br><sub>h-md-bert-columns</sub> | PASS | 68224 chars, 14 tables, 13 headings | 1.1s, heap 13 MB |
| pdf2md | netpresse-invoice.pdf<br><sub>h-md-netpresse-tables</sub> | PASS | 1472 chars, 2 tables, 0 headings | 0.3s, heap 36 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.9x size; warn: size stays reasonable (<= 3x) (5.9x input) | 5.3s, heap 17 MB |
| redact | aws-invoice.pdf<br><sub>redact-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 1.4s, heap 12 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.8x size; warn: size stays reasonable (<= 3x) (10.8x input) | 4.3s, heap 29 MB |
| redact | pdfjs-rotation.pdf<br><sub>redact-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 4.4x size; warn: size stays reasonable (<= 3x) (4.4x input) | 0.3s, heap 12 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>redact-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 1.1s, heap 13 MB |
| redact | uk-IPPH353.pdf<br><sub>redact-find-split-uk-IPPH353</sub> | PASS |  | 0.2s, heap 11 MB |
| redact | uk-AFPS-Form-17.pdf<br><sub>redact-find-split-uk-AFPS-Form-17</sub> | PASS |  | 0.1s, heap 13 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.94x size, 318 ms | 1.0s, heap 15 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.00x size, 352 ms | 0.9s, heap 16 MB |
| redact | pdfjs-rotation.pdf<br><sub>g3-redact-remove-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 0.83x size, 3 ms | 0.1s, heap 34 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 28 ms | 0.2s, heap 13 MB |
| redact | c-rot270-cropbox.pdf<br><sub>g3-redact-remove-rot270-cropbox</sub> | PASS | 16 boxes on 2 page(s), 0.99x size, 75 ms | 0.4s, heap 23 MB |
| redact | c-rot180-origin.pdf<br><sub>g3-redact-remove-rot180-origin</sub> | PASS | 16 boxes on 2 page(s), 0.99x size, 126 ms | 0.5s, heap 13 MB |
| redact | aws-invoice.pdf<br><sub>g3-redact-remove-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 0.96x size, 39 ms | 0.4s, heap 34 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-image-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.77x size, 2490 ms | 4.9s, heap 41 MB |
| redact | flipkart-invoice.pdf<br><sub>g3-redact-remove-flipkart</sub> | PASS | 6 boxes on 1 page(s), 1.01x size, 27 ms | 0.5s, heap 41 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-image-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.93x size, 1699 ms | 3.9s, heap 37 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | PASS |  | 0.1s, heap 14 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | PASS |  | 0.2s, heap 11 MB |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | PASS |  | 0.4s, heap 12 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-remove</sub> | PASS | review #1, raster pages none | 0.1s, heap 11 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-image</sub> | PASS | review #1, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-remove</sub> | PASS | review #2, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-image</sub> | PASS | review #2, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-image</sub> | PASS | review #3, raster pages 1 | 0.3s, heap 13 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-image</sub> | PASS | review #3, raster pages 1 | 0.2s, heap 13 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-remove</sub> | PASS | review #4, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-image</sub> | PASS | review #4, raster pages 1 | 0.6s, heap 12 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-remove</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-image</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-remove</sub> | PASS | review #6, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-image</sub> | PASS | review #6, raster pages 1 | 0.1s, heap 12 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-remove</sub> | PASS | review #7, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-image</sub> | PASS | review #7, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-remove</sub> | PASS | review #8, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-image</sub> | PASS | review #8, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-remove</sub> | PASS | review #r2-2, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-image</sub> | PASS | review #r2-2, raster pages 1 | 0.3s, heap 12 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.1s, heap 12 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-image</sub> | PASS | review #r2-1, raster pages 1 | 0.1s, heap 12 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-image</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-remove</sub> | PASS | review #r2-3, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-image</sub> | PASS | review #r2-3, raster pages 1 | 0.3s, heap 12 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-remove</sub> | PASS | review #r2-6, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-image</sub> | PASS | review #r2-6, raster pages 1 | 0.3s, heap 12 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-remove</sub> | PASS |  | 0.3s, heap 12 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-image</sub> | PASS |  | 0.9s, heap 12 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-actualtext-us-budget</sub> | PASS |  | 2.3s, heap 53 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 151 ms | 0.7s, heap 60 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.1s, heap 71 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-regex-budget-phones</sub> | PASS | 6 boxes, (202) 512-1530, (888) 293-6498, (202) 512-1800 | 3.2s, heap 123 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.4s, heap 134 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 0.6s, heap 135 MB |
| forms | irs-f1040.pdf<br><sub>forms-list-irs-f1040</sub> | PASS | 199 fields (199 widgets) in 144 ms, pdf.js 199, has XFA | 0.8s, heap 9 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 34 ms, pdf.js 23, has XFA | 0.1s, heap 12 MB |
| forms | irs-fw4.pdf<br><sub>forms-list-irs-fw4</sub> | PASS | 48 fields (48 widgets) in 177 ms, pdf.js 48, has XFA | 0.2s, heap 12 MB |
| forms | irs-f1040sa.pdf<br><sub>forms-list-irs-f1040sa</sub> | PASS | 33 fields (33 widgets) in 11 ms, pdf.js 33, has XFA | 0.1s, heap 14 MB |
| forms | uscis-i-9.pdf<br><sub>forms-list-uscis-i-9</sub> | PASS | 128 fields (130 widgets) in 90 ms, pdf.js 128 | 0.2s, heap 17 MB |
| forms | uscis-i-485.pdf<br><sub>forms-list-uscis-i-485</sub> | PASS | 730 fields (730 widgets) in 1393 ms, pdf.js 730, has XFA | 1.5s, heap 42 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-list-uk-IPPH353</sub> | PASS | 92 fields (92 widgets) in 295 ms, pdf.js 92 | 0.3s, heap 27 MB |
| forms | uk-AFPS-Form-17.pdf<br><sub>forms-list-uk-AFPS-Form-17</sub> | PASS | 24 fields (24 widgets) in 44 ms, pdf.js 24 | 0.1s, heap 38 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-list-xfa-imm1344e-filled</sub> | PASS | 1 fields (1 widgets) in 5 ms, pdf.js 1, has XFA | 0.1s, heap 12 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 1 ms, pdf.js 0, has XFA | 0.1s, heap 13 MB |
| forms | annotation-button-widget.pdf<br><sub>forms-list-annotation-button-widget</sub> | PASS | 6 fields (9 widgets) in 6 ms, pdf.js 6, has XFA | 0.1s, heap 13 MB |
| forms | annotation-choice-widget.pdf<br><sub>forms-list-annotation-choice-widget</sub> | PASS | 5 fields (5 widgets) in 7 ms, pdf.js 5, has XFA | 0.1s, heap 14 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-list-annotation-text-widget</sub> | PASS | 7 fields (7 widgets) in 2 ms, pdf.js 7, has XFA | 0.1s, heap 15 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 0.8s, heap 15 MB |
| forms | irs-fw9.pdf<br><sub>forms-fill-fw9</sub> | PASS | 3 filled | 0.3s, heap 21 MB |
| forms | uscis-i-9.pdf<br><sub>forms-fill-i9</sub> | PASS | 3 filled | 0.7s, heap 36 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-fill-xfa-imm1344e</sub> | PASS |  | 0.1s, heap 36 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 0.7s, heap 40 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-fill-flatten-ipph353</sub> | PASS | 3 filled, flattened | 0.9s, heap 34 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-fill-flatten-text-widget</sub> | PASS | 3 filled, flattened | 0.1s, heap 23 MB |
| forms | uscis-i-485.pdf<br><sub>forms-flatten-i485</sub> | PASS | 730 fields flattened | 2.2s, heap 44 MB |
| forms | c-fw9-rot90.pdf<br><sub>c-forms-add-fw9-rot90</sub> | PASS |  | 0.6s, heap 26 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>c-forms-add-xfa-origin</sub> | PASS |  | 0.1s, heap 39 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-add-fw9</sub> | PASS |  | 0.2s, heap 42 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh</sub> | PASS |  | 0.3s, heap 28 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh-flat</sub> | PASS |  | 0.2s, heap 43 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar</sub> | PASS |  | 0.3s, heap 25 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar-flat</sub> | PASS |  | 0.2s, heap 41 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi</sub> | PASS |  | 0.3s, heap 37 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi-flat</sub> | PASS |  | 0.2s, heap 38 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja</sub> | PASS |  | 0.4s, heap 43 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja-flat</sub> | PASS |  | 0.3s, heap 37 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru</sub> | PASS |  | 0.3s, heap 18 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru-flat</sub> | PASS |  | 0.2s, heap 36 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-inspect-irs-fw9</sub> | PASS | 23 fields, 23 widgets, 28 ms | 0.1s, heap 35 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 1 ms | 0.1s, heap 38 MB |
| forms | uscis-i-9.pdf<br><sub>g3-forms-inspect-uscis-i-9</sub> | PASS | 128 fields, 130 widgets, 99 ms | 0.2s, heap 38 MB |
| forms | uscis-i-485.pdf<br><sub>g3-forms-inspect-uscis-i-485</sub> | PASS | 730 fields, 730 widgets, 1500 ms | 1.6s, heap 46 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 0.2s, heap 41 MB |
| forms | irs-f1040.pdf<br><sub>g3-forms-fill-xfa-irs-f1040-flat</sub> | PASS |  | 0.4s, heap 50 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 1.2s, heap 9 MB |
| compare | pdfjs-tracemonkey.pdf + pdfjs-tracemonkey_with_annotations.pdf<br><sub>compare-with-annotations</sub> | PASS | +0 -0, changed pages none | 0.3s, heap 11 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | PASS | +1213 -0, changed pages 3 | 0.2s, heap 20 MB |
| compare | 911-commission-report.pdf + 911-commission-report.pdf<br><sub>compare-911-self</sub> | PASS | +0 -0, changed pages none | 7.2s, heap 93 MB |
| compare | us-economic-report-president-2024.pdf + us-economic-report-president-2024.pdf<br><sub>compare-dense-econ-self</sub> | PASS | +0 -0, changed pages none | 9.2s, heap 95 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>g2-compare-inserted-overlay</sub> | PASS | 271 ms, +1213 -0, changed 3, overlay max 0.00% | 1.3s, heap 89 MB |
| compare | pdfjs-TAMReview.pdf + pdfjs-TAMReview.pdf<br><sub>g2-compare-tamreview-self</sub> | PASS | 407 ms, +0 -0, changed none, overlay max 0.00% | 3.3s, heap 90 MB |
| compare | aws-invoice.pdf + origin-shift-aws-invoice.pdf<br><sub>g2-compare-origin-shift</sub> | PASS | 43 ms, +0 -0, changed none, overlay max 0.00% | 0.2s, heap 10 MB |
| compare | pdfjs-tracemonkey.pdf<br><sub>g2-compare-removed-page</sub> | PASS | 413 ms, -1260 words, changed pairs 4 | 0.7s, heap 13 MB |
| compare | us-economic-report-president-2024.pdf<br><sub>g2-compare-dense-removed-page</sub> | PASS | 8280 ms, -251 words, changed pairs 10 | 9.9s, heap 149 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-0</sub> | PASS | 2787 ms, turned 0 of 2, osd 0/4.9 0/5.5 | 3.4s, heap 10 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-90</sub> | PASS | 1767 ms, turned 2 of 2, osd 270/0.4 270/2.2 | 1.9s, heap 11 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-180</sub> | PASS | 1950 ms, turned 2 of 2, osd 180/3.4 180/5.3 | 2.1s, heap 10 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-270</sub> | PASS | 1645 ms, turned 2 of 2, osd 90/0.3 90/2.3 | 1.8s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-0</sub> | PASS | 19659 ms, turned 0 of 36, osd 0/0.0 180/0.1 180/0.6 0/0.0 0/0.0 0/4.3 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/20.4 0/30.3 0/0.0 0/0.0 180/1.0 180/0.8 0/0.0 0/0.0 0/0.0 0/0.0 0/9.6 0/1.3 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/0.4 0/0.0 180/0.2 | 19.8s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-90</sub> | PASS | 20242 ms, turned 36 of 36, osd 0/0.0 90/0.1 0/0.0 0/0.0 0/0.0 270/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/21.2 270/27.6 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/6.5 270/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/1.0 0/0.4 180/0.9 | 20.5s, heap 11 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-180</sub> | PASS | 20205 ms, turned 36 of 36, osd 0/0.0 0/0.0 0/0.7 0/0.0 0/0.0 180/3.5 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/18.5 180/30.7 0/0.0 0/0.0 0/1.0 0/0.6 0/0.0 0/0.0 0/0.0 0/0.0 180/8.4 180/1.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.5 0/0.0 0/0.4 | 20.5s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-270</sub> | PASS | 19976 ms, turned 36 of 36, osd 0/0.0 180/0.1 0/0.0 0/0.0 0/0.0 90/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 90/22.3 90/28.7 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 90/7.0 90/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/1.0 270/0.3 0/0.6 | 20.2s, heap 11 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-0</sub> | PASS | 2982 ms, turned 0 of 1, osd 0/0.4 | 3.2s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-90</sub> | PASS | 2813 ms, turned 0 of 1, osd 270/1.2; warn: every page back upright (not detected: p1) | 2.9s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-180</sub> | PASS | 2758 ms, turned 0 of 1, osd 180/0.4; warn: every page back upright (not detected: p1) | 2.9s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-270</sub> | PASS | 2192 ms, turned 0 of 1, osd 90/1.1; warn: every page back upright (not detected: p1) | 2.3s, heap 10 MB |
| booklet | pdfjs-tracemonkey.pdf<br><sub>u5a-booklet-tracemonkey</sub> | PASS | 14 pages on 4 sheets, first sides -\|1 / 2\|- | 1.1s, heap 9 MB |
| booklet | aws-invoice.pdf<br><sub>u5a-booklet-aws-invoice</sub> | PASS | 1 pages on 1 sheets, first sides -\|1 / -\|- | 0.1s, heap 15 MB |
| booklet | arxiv-1706.03762-attention.pdf<br><sub>u5a-booklet-attention-spine-right-gutter</sub> | PASS | 15 pages on 4 sheets, first sides 1\|- / 15\|2 | 3.4s, heap 35 MB |
| booklet | c-mixed.pdf<br><sub>u5a-booklet-mixed-fronts</sub> | PASS | 5 pages on 2 sheets, first sides -\|1 / -\|3 | 0.2s, heap 36 MB |
| booklet | rot90-cropbox-bert.pdf<br><sub>u5a-booklet-long-edge-rot90-a4</sub> | PASS | 16 pages on 4 sheets, first sides 16\|1 / 2\|15 | 0.4s, heap 42 MB |
| booklet | arxiv-2307.09288-llama2.pdf<br><sub>u5a-booklet-llama2</sub> | PASS | 77 pages on 20 sheets, first sides -\|1 / 2\|- | 3.8s, heap 45 MB |
| booklet | arxiv-1706.03762-attention.pdf<br><sub>u5a-booklet-raw-attention</sub> | PASS | 15 pages on 4 sheets, first sides -\|1 / 2\|15 | 2.4s, heap 49 MB |
| booklet | irs-fw9.pdf<br><sub>u5a-booklet-filled-fw9</sub> | PASS | 6 pages on 2 sheets, first sides -\|1 / 2\|- | 0.3s, heap 43 MB |
| bookmarks | pdfjs-outlines_se.pdf<br><sub>u5b-bookmarks-outlines-se</sub> | PASS | run to result 538 ms: 6 bookmarks. | 1.6s, heap 9 MB |
| bookmarks | pdfjs-nested_outline.pdf<br><sub>u5b-bookmarks-nested</sub> | PASS | run to result 14 ms: 12 bookmarks. | 0.1s, heap 11 MB |
| bookmarks | pdfjs-outline_goto_action.pdf<br><sub>u5b-bookmarks-goto-action</sub> | PASS | run to result 8 ms: 5 bookmarks. | 0.1s, heap 12 MB |
| bookmarks | pdfjs-tracemonkey.pdf<br><sub>u5b-bookmarks-tracemonkey</sub> | PASS | run to result 240 ms: 3 bookmarks. | 0.7s, heap 11 MB |
| bookmarks | arxiv-1706.03762-attention.pdf<br><sub>u5b-bookmarks-headings-attention</sub> | PASS | run to result 1475 ms: 11 bookmarks. | 2.7s, heap 18 MB |
| bookmarks | xfa-imm1344e-filled.pdf<br><sub>u5b-bookmarks-xfa-imm1344e</sub> | PASS | run to result 79 ms: 21 bookmarks. | 0.2s, heap 18 MB |
| attachments | pdfjs-tracemonkey.pdf<br><sub>u5b-attachments-tracemonkey</sub> | PASS | run to result 314 ms: 2 files attached. | 1.3s, heap 9 MB |
| attachments | aws-invoice.pdf<br><sub>u5b-attachments-aws</sub> | PASS | run to result 10 ms: 2 files attached. | 0.2s, heap 10 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-fileattachment</sub> | PASS | run to result 17 ms: 2 files attached. | 0.2s, heap 11 MB |
| attachments | aws-invoice.pdf<br><sub>u5b-attachments-big-aws</sub> | PASS | run to result 1027 ms: 4 files attached. | 5.2s, heap 12 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-remove-annotation</sub> | PASS | run to result 8 ms, 1 attachment(s) | 0.1s, heap 10 MB |
| attachments | aws-invoice.pdf<br><sub>u5b-attachments-facturx</sub> | PASS | run to result 8 ms, 2 attachment(s) | 0.1s, heap 11 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-tagged-annotation</sub> | PASS | run to result 7 ms, 1 attachment(s) | 0.1s, heap 11 MB |
| attachments | pdfjs-encrypted-attachment.pdf<br><sub>u5b-attachments-encrypted</sub> | PASS |  | 0.1s |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-facturx</sub> | PASS | run to result 484 ms: Removed 1 attached file. | 1.5s, heap 9 MB |
| sanitize | xfa-imm1344e-filled.pdf<br><sub>u5b-sanitize-xfa-imm1344e</sub> | PASS | run to result 116 ms: Removed 39 scripts, 355 XFA scripts. | 0.3s, heap 11 MB |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | PASS | run to result 110 ms: Removed 3 scripts, 1 XFA form. | 0.3s, heap 12 MB |
| sanitize | uscis-i-9.pdf<br><sub>u5b-sanitize-i9</sub> | PASS | run to result 329 ms: Removed 28 scripts, 32 triggers. | 0.7s, heap 12 MB |
| sanitize | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-sanitize-fileattachment</sub> | PASS | run to result 5 ms: Removed 1 attached file. | 0.1s, heap 16 MB |
| sanitize | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-sanitize-all-tracemonkey</sub> | PASS | run to result 47 ms: Removed 1 info dictionary, 24 embedded fonts. | 0.3s, heap 17 MB |
| sanitize | pdfjs-tracemonkey.pdf<br><sub>u5b-sanitize-tracemonkey</sub> | PASS | run to result 91 ms: Nothing found to remove. | 0.4s, heap 16 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-aws</sub> | PASS | run to result 8 ms: Nothing found to remove. | 0.1s, heap 10 MB |
| sanitize | arxiv-1706.03762-attention.pdf<br><sub>u5b-sanitize-attention</sub> | PASS | run to result 771 ms: Nothing found to remove. | 1.8s, heap 24 MB |
| removeannots | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-removeannots-tracemonkey</sub> | PASS | run to result 600 ms: 4 annotations removed. | 1.5s, heap 9 MB |
| removeannots | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-removeannots-fileattachment</sub> | PASS | run to result 13 ms: 1 annotation removed. | 0.1s, heap 12 MB |
| removeannots | irs-fw9.pdf<br><sub>u5b-removeannots-fw9-fields</sub> | PASS | run to result 61 ms: 23 annotations removed. | 0.2s, heap 13 MB |
| removeannots | xfa-imm1344e-filled.pdf<br><sub>u5b-removeannots-fields-xfa-imm1344e</sub> | PASS |  | 0.1s |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | PASS | run to result 607 ms: Images removed on 3 pages, 177.9 KB saved. | 1.6s, heap 9 MB |
| removeimages | aws-invoice.pdf<br><sub>u5b-removeimages-aws</sub> | PASS | run to result 9 ms: Images removed on 1 page, 66.6 KB saved. | 0.1s, heap 13 MB |
| removeimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-removeimages-attention</sub> | PASS | run to result 301 ms: Images removed on 2 pages, 604.8 KB saved. | 1.1s, heap 11 MB |
| removeimages | udhr-hebrew.pdf<br><sub>u5b-removeimages-inline-hebrew</sub> | PASS | run to result 18 ms: No images found, the file is unchanged. | 0.2s, heap 23 MB |
| removeimages | arxiv-2005.14165-gpt3.pdf<br><sub>u5b-removeimages-inline-gpt3</sub> | PASS | run to result 130 ms: Images removed on 26 pages, 5.97 MB saved. | 0.7s, heap 10 MB |
| info | pdfjs-tracemonkey.pdf<br><sub>u5b-info-tracemonkey</sub> | PASS | run to result 261 ms: 14 pages, 24 fonts, 90 images. | 0.8s, heap 9 MB |
| info | aws-invoice.pdf<br><sub>u5b-info-aws</sub> | PASS | run to result 21 ms: 1 page, 3 fonts, 1 image. | 0.1s, heap 12 MB |
| info | irs-fw9.pdf<br><sub>u5b-info-fw9</sub> | PASS | run to result 108 ms: 6 pages, 6 fonts, 0 images. | 0.2s, heap 12 MB |
| info | arxiv-1706.03762-attention.pdf<br><sub>u5b-info-attention</sub> | PASS | run to result 865 ms: 15 pages, 34 fonts, 3 images. | 1.5s, heap 13 MB |
| showjs | pdfjs-outlines_se.pdf<br><sub>u5b-showjs-none-outlines</sub> | PASS |  | 0.9s |
| showjs | irs-fw9.pdf<br><sub>u5b-showjs-fw9</sub> | PASS | run to result 21 ms: 3 XFA <script> tags, 0 self-closing, 0 empty | 0.2s, heap 10 MB |
| showjs | uscis-i-9.pdf<br><sub>u5b-showjs-i9</sub> | PASS | run to result 31 ms: 0 XFA <script> tags, 0 self-closing, 0 empty | 0.2s, heap 12 MB |
| showjs | xfa-issue14315.pdf<br><sub>u5b-showjs-xfa</sub> | PASS | run to result 2 ms: 0 XFA <script> tags, 0 self-closing, 0 empty | 0.1s, heap 17 MB |
| showjs | xfa-imm1344e-filled.pdf<br><sub>u5b-showjs-xfa-imm1344e</sub> | PASS | run to result 42 ms: 1437 XFA <script> tags, 1082 self-closing, 0 empty | 0.2s, heap 17 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | PASS | ready 1.2s, click to download 1.0s: 2 PDFs, 14 pages in total | 2.5s, heap 13 MB |
