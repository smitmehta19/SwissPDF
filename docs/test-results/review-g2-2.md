# Corpus scorecard: review-g2-2

Run: 2026-10-27 09:27 UTC, 11.7 min. Command: `npm run test:corpus -- --tool ocr,autorotate,protect,unlock,repair,compare,health --name review-g2-2`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **85 PASS, 0 FAIL, 0 SKIP** of 85 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| repair | 11 | 0 | 0 | 33.6s |
| protect | 16 | 0 | 0 | 6.3s |
| unlock | 13 | 0 | 0 | 5.8s |
| ocr | 22 | 0 | 0 | 465.6s |
| compare | 10 | 0 | 0 | 41.8s |
| health | 1 | 0 | 0 | 16.9s |
| autorotate | 12 | 0 | 0 | 107.6s |

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
| 10 | OCR English only, assets from CDN (not offline) | NOT REPRODUCED | 24 linked check(s) passed, e.g. ocr-fax-printed: no network fetches outside the page origin; ocr-fips-printed: no network fetches outside the page origin |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | SOFT WARN | soft only, 8 linked check(s) passed; warn: ocr-darwin-with-text-layer: skips pages that already have text (33 words before, +33 added); ocr-born-digital-invoice: skips pages that already have text (105 words before, +105 added) (+1 more) |
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
| 25 | Redact rasterizes whole pages (size balloons) | NOT TESTED | no corpus case |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT REPRODUCED | 6 linked check(s) passed, e.g. repair-budget-bookmarks: bookmarks kept; repair-fw9-form: form fields kept |
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

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | PASS | recovered 1, rasterized 0, lost 0 | 13.9s, heap 8 MB |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | PASS |  | 0.1s |
| repair | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>repair-fuzzed-395</sub> | PASS |  | 0.1s |
| repair | pdfjs-bug1020226.pdf<br><sub>repair-bug1020226</sub> | PASS |  | 0.1s |
| repair | pdfjs-Pages-tree-refs.pdf<br><sub>repair-pages-tree-refs</sub> | PASS | recovered 1, rasterized 0, lost 1 | 0.1s, heap 11 MB |
| repair | pdf20-offset-start.pdf<br><sub>repair-offset-start</sub> | PASS | recovered 1, rasterized 0, lost 0 | 0.1s, heap 12 MB |
| repair | us-budget-2024.pdf<br><sub>repair-budget-bookmarks</sub> | PASS | recovered 184, rasterized 0, lost 0 | 3.3s, heap 28 MB |
| repair | irs-fw9.pdf<br><sub>repair-fw9-form</sub> | PASS | recovered 6, rasterized 0, lost 0 | 0.1s, heap 42 MB |
| repair | us-budget-2024.pdf<br><sub>g2-repair-keeps-structure</sub> | PASS | rewrite, 27 of 27 bookmarks | 3.0s, heap 68 MB |
| repair | irs-fw9.pdf<br><sub>g2-repair-keeps-fields</sub> | PASS | rewrite, 23 of 23 fields | 0.1s, heap 43 MB |
| repair | us-budget-2024.pdf<br><sub>g2-repair-truncated-bookmarks</sub> | PASS | rebuild, 183 pages, 27/27 bookmarks, intake: File was damaged and has been repaired. 1 of 184 pages could not be recovered | 12.5s, heap 71 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | PASS | Standard V5 R6 256-bit AES | 1.5s, heap 8 MB |
| protect | 911-commission-report.pdf<br><sub>protect-911-large</sub> | PASS | Standard V5 R6 256-bit AES | 1.6s, heap 10 MB |
| protect | owner-only-irs-fw9.pdf<br><sub>protect-owner-only-input</sub> | PASS | Standard V5 R6 256-bit AES | 0.5s, heap 10 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 0.1s |
| protect | aws-invoice.pdf<br><sub>protect-unicode-password</sub> | PASS | Standard V5 R6 256-bit AES | 0.4s, heap 10 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-permissions-only</sub> | PASS | Standard V5 R6 256-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 0.5s, heap 10 MB |
| protect | irs-fw9.pdf<br><sub>g2-protect-open-and-owner</sub> | PASS | {"print":true,"copy":true,"edit":false,"annotate":true,"form":true,"assemble":false,"print-hq":true} | 0.2s, heap 10 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-aes128-tracemonkey</sub> | PASS | Standard V4 R4 128-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":false,"assemble":true,"print-hq":false} | 0.3s, heap 10 MB |
| protect | aws-invoice.pdf<br><sub>g2-protect-rc4-40-invoice</sub> | PASS | Standard V1 R2 40-bit RC4, {"print":false,"copy":true,"edit":false,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 0.1s, heap 10 MB |
| protect | irs-fw9.pdf<br><sub>g2-protect-aes256-fw9</sub> | PASS | Standard V5 R6 256-bit AES, {"print":true,"copy":true,"edit":true,"annotate":true,"form":false,"assemble":false,"print-hq":false} | 0.3s, heap 10 MB |
| protect | aws-invoice.pdf<br><sub>g2-protect-aes256-unicode-pdfjs</sub> | PASS |  | 0.2s, heap 10 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes128-emoji-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-rc4-nbsp-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes128-cjk-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes256-softhyphen-refused</sub> | PASS |  | 0.1s |
| protect | pdfjs-TAMReview.pdf<br><sub>g2-protect-aes256-fullwidth-refused</sub> | PASS |  | 0.1s |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | PASS | removed: none listed, had user password | 0.9s, heap 8 MB |
| unlock | pdfjs-issue6010_1.pdf<br><sub>unlock-issue6010_1</sub> | PASS | removed: none listed, had user password | 0.2s, heap 11 MB |
| unlock | pdfjs-issue6010_2.pdf<br><sub>unlock-issue6010_2</sub> | PASS | removed: none listed, had user password | 0.3s, heap 11 MB |
| unlock | pdfjs-bug1782186.pdf<br><sub>unlock-bug1782186</sub> | PASS | removed: none listed, had user password | 0.1s, heap 11 MB |
| unlock | pdfjs-issue21579.pdf<br><sub>unlock-issue21579</sub> | PASS | removed: copying text, editing, annotating, reordering pages, had user password | 0.1s, heap 11 MB |
| unlock | pdfjs-issue15893_reduced.pdf<br><sub>unlock-issue15893_reduced</sub> | PASS | removed: none listed, had user password | 0.1s, heap 11 MB |
| unlock | pdfjs-saslprep-r6.pdf<br><sub>unlock-saslprep-r6</sub> | PASS | removed: none listed, had user password | 0.2s, heap 11 MB |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | PASS | removed: none listed, had user password | 0.6s, heap 11 MB |
| unlock | pdfjs-empty_protected.pdf<br><sub>unlock-empty-protected</sub> | PASS | removed: copying text, editing, reordering pages | 0.2s, heap 11 MB |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 0.5s, heap 11 MB |
| unlock | owner-only-aws-invoice.pdf<br><sub>unlock-owner-only-invoice</sub> | PASS | removed: printing, high-quality printing, copying text | 0.3s, heap 10 MB |
| unlock | pdfjs-bug1782186.pdf<br><sub>unlock-wrong-password</sub> | PASS |  | 0.1s |
| unlock | a-owner-only-us-budget.pdf<br><sub>g2-unlock-owner-only-fast</sub> | PASS | 603 ms, removed: printing, copying text, editing | 2.0s, heap 10 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 397 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc" | 24.4s, heap 11 MB |
| ocr | sub-fips-p5-6.pdf<br><sub>ocr-fips-printed</sub> | PASS | 91 words, sample "N RS-466 PROCEDURES FOR DOCUMENT FACSIMILE TRANSMI" | 10.5s, heap 12 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>ocr-darwin-with-text-layer</sub> | PASS | 97 words, sample " CONTENTS PAGE EDITOR'S INTRODUCTION . 5 5 3 e o "; warn: skips pages that already have text (33 words before, +33 added) | 5.3s, heap 10 MB |
| ocr | sub-lincoln-p3-4.pdf<br><sub>ocr-lincoln-letter</sub> | PASS | 0 words, sample " "; warn: some text recognised (+0 words (OCR saw nothing: page renders blank, JPX scan)) | 3.3s, heap 11 MB |
| ocr | letter-to-benjamin-glover.pdf<br><sub>ocr-glover-handwritten</sub> | PASS | 449 words, sample "Tl , AR caiksie feATT \| \| i RE 0 ie \| \| Aili i pT " | 94.4s, heap 11 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>ocr-ndl-japanese-scan</sub> | PASS | 20 words, sample "¢- © - REN gE RTT ERY A TR a A RY A SN a IPS EVIDE" | 11.7s, heap 10 MB |
| ocr | oyo.pdf<br><sub>ocr-born-digital-invoice</sub> | PASS | 183 words, sample "OoYO PAYMENT RECEIPT Guest Name: Sanjay Date: 31/1"; warn: skips pages that already have text (105 words before, +105 added) | 5.1s, heap 11 MB |
| ocr | udhr-korean.pdf<br><sub>ocr-intl-korean</sub> | PASS | 376 words, sample "MA Ql MA ME DE QR FHM MEO EYE S551 FTE + gle HEE"; warn: skips pages that already have text (0 words before, +36 added) | 55.5s, heap 12 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-geometry</sub> | PASS | upright 45/46 median 1.7pt; turned 45/46 median 1.6pt; rot90crop 46/47 median 1.5pt; skew 41/43 median 1.8pt | 59.8s, heap 13 MB |
| ocr | udhr-chinese-simplified.pdf<br><sub>g2-ocr-scan-chinese</sub> | PASS | 451 words, 0 without a font, coverage 0.92, "世界 人 权 宣 告 联合 国 大 会 一 九 四 八 年 十 二 月 十 日" | 11.1s, heap 18 MB |
| ocr | udhr-japanese.pdf<br><sub>g2-ocr-scan-japanese</sub> | PASS | 399 words, 0 without a font, coverage 0.96, "『 世 界 人 権 宣言 』 ( 1948.12.10 第 3 回 国連 総会" | 14.4s, heap 16 MB |
| ocr | udhr-korean.pdf<br><sub>g2-ocr-scan-korean</sub> | PASS | 460 words, 0 without a font, coverage 0.99, "세계인권선언 전 문 모든 인류 구성원의 천부의 존엄성과 동등하고 양도" | 13.8s, heap 16 MB |
| ocr | udhr-arabic.pdf<br><sub>g2-ocr-scan-arabic</sub> | PASS | 290 words, 1 without a font, coverage 1.00, "UDHR - Arabic, Standard https://unicode." | 13.7s, heap 14 MB |
| ocr | udhr-hindi.pdf<br><sub>g2-ocr-scan-hindi</sub> | PASS | 547 words, 8 without a font, coverage undefined, "ह्ड - प़ंएतां मानव अधिकारों की सार्वमौम " | 18.1s, heap 21 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-scan-mixed-eng-deu</sub> | PASS | 724 words, 0 without a font, coverage 0.97, ". . . . . . Trace-based Just-in-Time Typ" | 19.1s, heap 16 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-fax-force</sub> | PASS | 397 words on 2 pages (0 skipped), turned 0, "10/25/2008 15:38 FAX 202 225 1992 Congre" | 10.7s, heap 16 MB |
| ocr | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-ocr-lincoln-36p</sub> | PASS | 80 words on 24 pages (12 skipped), turned 0, " TEL ey +o '] i ¥ 7, x - 3 - a, )" | 43.9s, heap 16 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-konoye-jpn</sub> | PASS | 21 words on 1 pages (0 skipped), turned 0, "ii \| TPS EVIDENTIARY DOCUMENT wo ンズ の 村 " | 17.5s, heap 15 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-ndl-japanese-handwritten</sub> | PASS | 21 words, 2 CJK characters; warn: Japanese characters recognised (2 CJK characters) | 12.7s, heap 15 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>g2-ocr-skip-text-pages</sub> | PASS | read 1, skipped 2 | 1.9s, heap 16 MB |
| ocr | oyo.pdf<br><sub>g2-ocr-force-text-pages</sub> | PASS | 183 words | 6.3s, heap 16 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-cancel</sub> | PASS | stopped at 3006 ms during "Page 1 of 2, recognizing", next run 334 words | 12.5s, heap 17 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 3.5s, heap 9 MB |
| compare | pdfjs-tracemonkey.pdf + pdfjs-tracemonkey_with_annotations.pdf<br><sub>compare-with-annotations</sub> | PASS | +0 -0, changed pages none | 0.7s, heap 12 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | PASS | +1213 -0, changed pages 3 | 0.4s, heap 20 MB |
| compare | 911-commission-report.pdf + 911-commission-report.pdf<br><sub>compare-911-self</sub> | PASS | +0 -0, changed pages none | 8.4s, heap 89 MB |
| compare | us-economic-report-president-2024.pdf + us-economic-report-president-2024.pdf<br><sub>compare-dense-econ-self</sub> | PASS | +0 -0, changed pages none | 10.2s, heap 249 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>g2-compare-inserted-overlay</sub> | PASS | 250 ms, +1213 -0, changed 3, overlay max 0.00% | 1.3s, heap 91 MB |
| compare | pdfjs-TAMReview.pdf + pdfjs-TAMReview.pdf<br><sub>g2-compare-tamreview-self</sub> | PASS | 526 ms, +0 -0, changed none, overlay max 0.00% | 3.6s, heap 91 MB |
| compare | aws-invoice.pdf + origin-shift-aws-invoice.pdf<br><sub>g2-compare-origin-shift</sub> | PASS | 88 ms, +0 -0, changed none, overlay max 0.00% | 0.3s, heap 10 MB |
| compare | pdfjs-tracemonkey.pdf<br><sub>g2-compare-removed-page</sub> | PASS | 450 ms, -1260 words, changed pairs 4 | 0.8s, heap 13 MB |
| compare | us-economic-report-president-2024.pdf<br><sub>g2-compare-dense-removed-page</sub> | PASS | 11089 ms, -251 words, changed pairs 10 | 12.6s, heap 141 MB |
| health | -<br><sub>health-selftest</sub> | PASS | 49 checks, 0 failed; warn: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) | 16.9s, heap 28 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-0</sub> | PASS | 2791 ms, turned 0 of 2, osd 0/4.9 0/5.5 | 3.8s, heap 11 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-90</sub> | PASS | 1753 ms, turned 2 of 2, osd 270/0.4 270/2.2 | 1.9s, heap 11 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-180</sub> | PASS | 1720 ms, turned 2 of 2, osd 180/3.4 180/5.3 | 1.9s, heap 10 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-270</sub> | PASS | 1821 ms, turned 2 of 2, osd 90/0.3 90/2.3 | 2.0s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-0</sub> | PASS | 24564 ms, turned 0 of 36, osd 0/0.0 180/0.1 180/0.6 0/0.0 0/0.0 0/4.3 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/20.4 0/30.3 0/0.0 0/0.0 180/1.0 180/0.8 0/0.0 0/0.0 0/0.0 0/0.0 0/9.6 0/1.3 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/0.5 0/0.0 180/0.2 | 24.8s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-90</sub> | PASS | 22248 ms, turned 36 of 36, osd 0/0.0 90/0.1 0/0.0 0/0.0 0/0.0 270/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/21.2 270/27.6 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/6.5 270/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/1.0 0/0.4 180/0.9 | 22.5s, heap 11 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-180</sub> | PASS | 21441 ms, turned 36 of 36, osd 0/0.0 0/0.0 0/0.7 0/0.0 0/0.0 180/3.5 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/18.5 180/30.7 0/0.0 0/0.0 0/1.0 0/0.6 0/0.0 0/0.0 0/0.0 0/0.0 180/8.4 180/1.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.5 0/0.0 0/0.4 | 21.7s, heap 11 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-270</sub> | PASS | 20697 ms, turned 36 of 36, osd 0/0.0 180/0.1 0/0.0 0/0.0 0/0.0 90/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 90/22.3 90/28.7 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 90/7.0 90/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/1.0 270/0.3 0/0.6 | 20.9s, heap 11 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-0</sub> | PASS | 1753 ms, turned 0 of 1, osd 0/0.4 | 1.9s, heap 11 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-90</sub> | PASS | 2036 ms, turned 0 of 1, osd 270/1.2; warn: every page back upright (not detected: p1) | 2.2s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-180</sub> | PASS | 2044 ms, turned 0 of 1, osd 180/0.4; warn: every page back upright (not detected: p1) | 2.2s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-270</sub> | PASS | 1861 ms, turned 0 of 1, osd 90/1.1; warn: every page back upright (not detected: p1) | 2.0s, heap 10 MB |
