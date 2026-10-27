# Corpus scorecard: 2026-10-27-reviewB-touched

Run: 2026-10-27 18:42 UTC, 8 min. Command: `npm run test:corpus -- --light --shards 2 --tool removeannots,split,booklet,info,sign,compare,flatten,unlockforms,removeimages,sanitize,autorotate,watermark,autorename,ocr,bookmarks,pdf2md,redact,forms --name 2026-10-27-reviewB-touched`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **292 PASS, 0 FAIL, 0 SKIP** of 292 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| split | 6 | 0 | 0 | 15.4s |
| watermark | 67 | 0 | 0 | 20.6s |
| sign | 16 | 0 | 0 | 5.1s |
| ocr | 22 | 0 | 0 | 347.4s |
| pdf2md | 12 | 0 | 0 | 11.5s |
| redact | 56 | 0 | 0 | 41.7s |
| forms | 40 | 0 | 0 | 19.1s |
| compare | 10 | 0 | 0 | 33.1s |
| autorotate | 12 | 0 | 0 | 98.1s |
| booklet | 8 | 0 | 0 | 16.0s |
| bookmarks | 6 | 0 | 0 | 6.6s |
| sanitize | 9 | 0 | 0 | 5.3s |
| removeannots | 4 | 0 | 0 | 2.6s |
| removeimages | 5 | 0 | 0 | 4.4s |
| flatten | 7 | 0 | 0 | 5.5s |
| unlockforms | 5 | 0 | 0 | 3.4s |
| info | 4 | 0 | 0 | 3.3s |
| autorename | 3 | 0 | 0 | 3.7s |

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
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT REPRODUCED | 68 linked check(s) passed, e.g. watermark-tracemonkey: mark inside the visible page; watermark-rotation-quirk: mark inside the visible page |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT REPRODUCED | 47 linked check(s) passed, e.g. watermark-cyrillic: non-Latin mark present; c-watermark-text-zh: text extracts back (pdf.js) |
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
| 22 | Protect: comma in password splits MuPDF options | NOT TESTED | no corpus case |
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
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | PASS | 14 pages -> 7 + 7 | 3.1s, heap 9 MB |
| split | us-budget-2024.pdf<br><sub>split-budget-bookmarks</sub> | PASS | 184 pages -> 92 + 92 | 3.9s, heap 52 MB |
| split | 911-commission-report.pdf<br><sub>split-911-large</sub> | PASS | 585 pages -> 292 + 293 | 4.7s, heap 16 MB |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 0.3s, heap 51 MB |
| split | irs-f1040.pdf<br><sub>split-form-f1040</sub> | PASS | 2 pages -> 1 + 1 | 0.4s, heap 40 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-tracemonkey</sub> | PASS | 14 marks | 0.8s, heap 9 MB |
| watermark | pdfjs-rotation.pdf<br><sub>watermark-rotation-quirk</sub> | PASS | 2 marks | 0.8s, heap 9 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>watermark-rot90-cropbox</sub> | PASS | 16 marks | 0.3s, heap 13 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>watermark-origin-shift</sub> | PASS | 1 marks | 0.1s, heap 10 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>watermark-issue1155r-origin</sub> | PASS | 1 marks | 0.1s, heap 15 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-cyrillic</sub> | PASS |  | 0.8s, heap 11 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-0</sub> | PASS | 16 marks | 0.3s, heap 16 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-45</sub> | PASS | 16 marks | 0.3s, heap 15 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-90</sub> | PASS | 16 marks | 0.2s, heap 17 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox--30</sub> | PASS | 16 marks | 0.2s, heap 15 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-0</sub> | PASS | 5 marks | 0.1s, heap 11 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-45</sub> | PASS | 5 marks | 0.1s, heap 18 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-90</sub> | PASS | 5 marks | 0.1s, heap 11 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90--30</sub> | PASS | 5 marks | 0.1s, heap 18 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-0</sub> | PASS | 2 marks | 0.1s, heap 18 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-45</sub> | PASS | 2 marks | 0.1s, heap 11 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-90</sub> | PASS | 2 marks | 0.1s, heap 19 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk--30</sub> | PASS | 2 marks | 0.1s, heap 12 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-0</sub> | PASS | 1 marks | 0.1s, heap 19 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-45</sub> | PASS | 1 marks | 0.1s, heap 12 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-90</sub> | PASS | 1 marks | 0.1s, heap 19 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop--30</sub> | PASS | 1 marks | 0.1s, heap 12 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-0</sub> | PASS | 1 marks | 0.1s, heap 12 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-45</sub> | PASS | 1 marks | 0.1s, heap 19 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-90</sub> | PASS | 1 marks | 0.1s, heap 13 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift--30</sub> | PASS | 1 marks | 0.1s, heap 12 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-0</sub> | PASS | 1 marks | 0.3s, heap 13 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-45</sub> | PASS | 1 marks | 0.5s, heap 13 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-90</sub> | PASS | 1 marks | 0.2s, heap 10 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin--30</sub> | PASS | 1 marks | 0.3s, heap 14 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-0</sub> | PASS | 2 marks | 0.1s, heap 16 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-45</sub> | PASS | 2 marks | 0.1s, heap 12 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-90</sub> | PASS | 2 marks | 0.2s, heap 17 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin--30</sub> | PASS | 2 marks | 0.1s, heap 13 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-0</sub> | PASS | 2 marks | 0.1s, heap 14 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-45</sub> | PASS | 2 marks | 0.1s, heap 12 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-90</sub> | PASS | 2 marks | 0.1s, heap 15 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox--30</sub> | PASS | 2 marks | 0.1s, heap 13 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-0</sub> | PASS | 5 marks | 0.1s, heap 10 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-45</sub> | PASS | 5 marks | 0.1s, heap 15 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-90</sub> | PASS | 5 marks | 0.1s, heap 12 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed--30</sub> | PASS | 5 marks | 0.2s, heap 16 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-0</sub> | PASS | 2 marks | 0.1s, heap 18 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-45</sub> | PASS | 2 marks | 0.3s, heap 14 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-90</sub> | PASS | 2 marks | 0.1s, heap 18 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed--30</sub> | PASS | 2 marks | 0.1s, heap 14 MB |
| watermark | us-budget-2024.pdf<br><sub>c-watermark-budget-mixed-rot-45</sub> | PASS | 40 marks | 2.4s, heap 55 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-tile-c-mixed</sub> | PASS |  | 0.3s, heap 14 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-tile-rot90-cropbox</sub> | PASS |  | 0.3s, heap 55 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-zh</sub> | PASS |  | 0.7s, heap 10 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ja</sub> | PASS |  | 0.3s, heap 41 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ko</sub> | PASS |  | 0.5s, heap 13 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar</sub> | PASS |  | 0.4s, heap 50 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar-mixed</sub> | PASS |  | 0.5s, heap 13 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar-decimal</sub> | PASS |  | 0.6s, heap 61 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar-digits</sub> | PASS |  | 0.4s, heap 15 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-he-date</sub> | PASS |  | 0.4s, heap 50 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-zh-hant</sub> | PASS |  | 0.4s, heap 21 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ko-hanja</sub> | PASS |  | 0.5s, heap 57 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-bn</sub> | PASS |  | 0.3s, heap 14 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ta</sub> | PASS |  | 0.3s, heap 45 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-th</sub> | PASS |  | 0.5s, heap 22 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-symbols</sub> | PASS |  | 0.5s, heap 54 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-he</sub> | PASS |  | 0.4s, heap 18 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-hi</sub> | PASS |  | 0.4s, heap 63 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ru</sub> | PASS |  | 0.6s, heap 14 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-mixed</sub> | PASS |  | 0.4s, heap 23 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 1.4s, heap 9 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 0.7s, heap 9 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | PASS | centre (0.50, 0.85) | 0.3s, heap 11 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>sign-origin-shift</sub> | PASS | centre (0.50, 0.85) | 0.3s, heap 10 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>sign-issue1155r-origin</sub> | PASS | centre (0.50, 0.85) | 0.1s, heap 15 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>c-sign-rot90-cropbox</sub> | PASS |  | 0.4s, heap 11 MB |
| sign | pdfjs-hello_world_rotated.pdf<br><sub>c-sign-hello-rot90</sub> | PASS |  | 0.1s, heap 11 MB |
| sign | pdfjs-rotation.pdf<br><sub>c-sign-rotation-quirk</sub> | PASS |  | 0.1s, heap 13 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>c-sign-issue1155r-crop</sub> | PASS |  | 0.1s, heap 13 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>c-sign-origin-shift</sub> | PASS |  | 0.2s, heap 12 MB |
| sign | xfa-imm1344e-filled.pdf<br><sub>c-sign-xfa-origin</sub> | PASS |  | 0.3s, heap 12 MB |
| sign | c-rot180-origin.pdf<br><sub>c-sign-c-rot180-origin</sub> | PASS |  | 0.1s, heap 13 MB |
| sign | c-rot270-cropbox.pdf<br><sub>c-sign-c-rot270-cropbox</sub> | PASS |  | 0.1s, heap 14 MB |
| sign | c-mixed.pdf<br><sub>c-sign-c-mixed</sub> | PASS |  | 0.2s, heap 14 MB |
| sign | fax-jean-schmidt-doe.pdf<br><sub>c-sign-fax-mixed</sub> | PASS |  | 0.1s, heap 13 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>g3-sign-multi-rot90</sub> | PASS |  | 0.4s, heap 14 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 423 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc" | 13.9s, heap 10 MB |
| ocr | sub-fips-p5-6.pdf<br><sub>ocr-fips-printed</sub> | PASS | 92 words, sample "N RS-466 PROCEDURES FOR DOCUMENT FACSIMILE TRANSMI" | 11.7s, heap 10 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>ocr-darwin-with-text-layer</sub> | PASS | 106 words, sample " CONTENTS PAGE EDITOR'S INTRODUCTION . 5 5 3 e o "; warn: skips pages that already have text (33 words before, +33 added) | 3.9s, heap 12 MB |
| ocr | sub-lincoln-p3-4.pdf<br><sub>ocr-lincoln-letter</sub> | PASS | 0 words, sample " "; warn: some text recognised (+0 words (OCR saw nothing: page renders blank, JPX scan)) | 1.9s, heap 10 MB |
| ocr | letter-to-benjamin-glover.pdf<br><sub>ocr-glover-handwritten</sub> | PASS | 1616 words, sample "Tl , AR caiksie feATT \| \| i RE 0 ie \| \| Aili i pT " | 58.9s, heap 11 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>ocr-ndl-japanese-scan</sub> | PASS | 25 words, sample "¢- © - REN gE RTT ERY A TR a A RY A SN a IPS EVIDE" | 9.6s, heap 20 MB |
| ocr | oyo.pdf<br><sub>ocr-born-digital-invoice</sub> | PASS | 184 words, sample "OoYO PAYMENT RECEIPT Guest Name: Sanjay Date: 31/1"; warn: skips pages that already have text (105 words before, +106 added) | 4.3s, heap 11 MB |
| ocr | udhr-korean.pdf<br><sub>ocr-intl-korean</sub> | PASS | 674 words, sample "MA Ql MA ME DE QR FHM MEO EYE S551 FTE + gle HEE"; warn: skips pages that already have text (0 words before, +86 added) | 42.8s, heap 13 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-geometry</sub> | PASS | upright 46/47 median 1.7pt; turned 45/46 median 1.6pt; rot90crop 46/47 median 1.5pt; skew 41/43 median 1.8pt | 48.7s, heap 11 MB |
| ocr | udhr-chinese-simplified.pdf<br><sub>g2-ocr-scan-chinese</sub> | PASS | 464 words, 0 without a font, coverage 0.94, "世界 人 权 宣 告 联合 国 大 会 一 九 四 八 年 十 二 月 十 日" | 10.9s, heap 12 MB |
| ocr | udhr-japanese.pdf<br><sub>g2-ocr-scan-japanese</sub> | PASS | 401 words, 0 without a font, coverage 0.96, "『 世 界 人 権 宣言 』 ( 1948.12.10 第 3 回 国連 総会" | 8.7s, heap 13 MB |
| ocr | udhr-korean.pdf<br><sub>g2-ocr-scan-korean</sub> | PASS | 460 words, 0 without a font, coverage 0.99, "세계인권선언 전 문 모든 인류 구성원의 천부의 존엄성과 동등하고 양도" | 8.7s, heap 14 MB |
| ocr | udhr-arabic.pdf<br><sub>g2-ocr-scan-arabic</sub> | PASS | 290 words, 1 without a font, coverage 1.00, "UDHR - Arabic, Standard https://unicode." | 9.6s, heap 15 MB |
| ocr | udhr-hindi.pdf<br><sub>g2-ocr-scan-hindi</sub> | PASS | 554 words, 8 without a font, coverage undefined, "ह्ड - प़ंएतां मानव अधिकारों की सार्वमौम " | 15.6s, heap 21 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-scan-mixed-eng-deu</sub> | PASS | 735 words, 0 without a font, coverage 0.99, ". . . . . . Trace-based Just-in-Time Typ" | 17.3s, heap 16 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-fax-force</sub> | PASS | 423 words on 2 pages (0 skipped), turned 0, "10/25/2008 15:38 FAX 202 225 1992 Congre" | 10.7s, heap 15 MB |
| ocr | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-ocr-lincoln-36p</sub> | PASS | 153 words on 24 pages (12 skipped), turned 0, " TEL ey +o '] i ¥ 7, x - 3 - a, )" | 32.6s, heap 16 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-konoye-jpn</sub> | PASS | 24 words on 1 pages (0 skipped), turned 0, "ii \| TPS EVIDENTIARY DOCUMENT wo ンズ の 村 " | 10.0s, heap 16 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-ndl-japanese-handwritten</sub> | PASS | 24 words, 5 CJK characters | 10.1s, heap 16 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>g2-ocr-skip-text-pages</sub> | PASS | read 1, skipped 2 | 1.4s, heap 14 MB |
| ocr | oyo.pdf<br><sub>g2-ocr-force-text-pages</sub> | PASS | 184 words | 5.3s, heap 15 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-cancel</sub> | PASS | stopped at 3007 ms during "Page 1 of 2, recognizing", next run 355 words | 10.7s, heap 15 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 85802 chars, 14 headings, 11 tables | 3.4s, heap 12 MB |
| pdf2md | us-budget-2024.pdf<br><sub>pdf2md-budget</sub> | PASS | 596818 chars, 29 headings, 125 tables | 3.4s, heap 14 MB |
| pdf2md | aws-invoice.pdf<br><sub>pdf2md-aws-invoice</sub> | PASS | 2073 chars, 4 headings, 3 tables | 0.3s, heap 20 MB |
| pdf2md | udhr-chinese-simplified.pdf<br><sub>pdf2md-chinese</sub> | PASS | 5895 chars, 0 headings, 0 tables | 0.2s, heap 14 MB |
| pdf2md | udhr-japanese.pdf<br><sub>pdf2md-japanese</sub> | PASS | 4587 chars, 0 headings, 0 tables | 0.2s, heap 21 MB |
| pdf2md | pdfjs-noembed-sjis.pdf<br><sub>pdf2md-noembed-sjis</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.1s, heap 19 MB |
| pdf2md | pdfjs-noembed-eucjp.pdf<br><sub>pdf2md-noembed-eucjp</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.1s, heap 25 MB |
| pdf2md | pdfjs-vertical.pdf<br><sub>pdf2md-vertical</sub> | PASS | 20 chars, 0 headings, 0 tables | 0.1s, heap 19 MB |
| pdf2md | udhr-arabic.pdf<br><sub>pdf2md-arabic</sub> | PASS | 8269 chars, 0 headings, 0 tables | 0.2s, heap 25 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | PASS | 85802 chars, 11 tables, 14 headings | 2.1s, heap 39 MB |
| pdf2md | arxiv-1810.04805-bert.pdf<br><sub>h-md-bert-columns</sub> | PASS | 68224 chars, 14 tables, 13 headings | 1.1s, heap 20 MB |
| pdf2md | netpresse-invoice.pdf<br><sub>h-md-netpresse-tables</sub> | PASS | 1472 chars, 2 tables, 0 headings | 0.3s, heap 14 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.9x size; warn: size stays reasonable (<= 3x) (5.9x input) | 5.2s, heap 16 MB |
| redact | aws-invoice.pdf<br><sub>redact-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 2.2s, heap 10 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.8x size; warn: size stays reasonable (<= 3x) (10.8x input) | 4.3s, heap 25 MB |
| redact | pdfjs-rotation.pdf<br><sub>redact-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 4.4x size; warn: size stays reasonable (<= 3x) (4.4x input) | 0.2s, heap 12 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>redact-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 0.8s, heap 13 MB |
| redact | uk-IPPH353.pdf<br><sub>redact-find-split-uk-IPPH353</sub> | PASS |  | 0.6s, heap 13 MB |
| redact | uk-AFPS-Form-17.pdf<br><sub>redact-find-split-uk-AFPS-Form-17</sub> | PASS |  | 0.2s, heap 15 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.94x size, 630 ms | 1.7s, heap 22 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.00x size, 604 ms | 1.4s, heap 15 MB |
| redact | pdfjs-rotation.pdf<br><sub>g3-redact-remove-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 0.83x size, 14 ms | 0.1s, heap 11 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 55 ms | 0.4s, heap 11 MB |
| redact | c-rot270-cropbox.pdf<br><sub>g3-redact-remove-rot270-cropbox</sub> | PASS | 16 boxes on 2 page(s), 0.99x size, 80 ms | 0.3s, heap 13 MB |
| redact | c-rot180-origin.pdf<br><sub>g3-redact-remove-rot180-origin</sub> | PASS | 16 boxes on 2 page(s), 0.99x size, 77 ms | 0.3s, heap 16 MB |
| redact | aws-invoice.pdf<br><sub>g3-redact-remove-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 0.96x size, 32 ms | 0.2s, heap 14 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-image-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.77x size, 2332 ms | 4.7s, heap 30 MB |
| redact | flipkart-invoice.pdf<br><sub>g3-redact-remove-flipkart</sub> | PASS | 6 boxes on 1 page(s), 1.01x size, 15 ms | 0.2s, heap 14 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-image-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.93x size, 1404 ms | 3.5s, heap 22 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | PASS |  | 0.1s, heap 22 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | PASS |  | 0.3s, heap 23 MB |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | PASS |  | 0.6s, heap 23 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-remove</sub> | PASS | review #1, raster pages none | 0.1s, heap 14 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-image</sub> | PASS | review #1, raster pages none | 0.1s, heap 23 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-remove</sub> | PASS | review #2, raster pages none | 0.1s, heap 14 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-image</sub> | PASS | review #2, raster pages none | 0.1s, heap 24 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 24 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-image</sub> | PASS | review #3, raster pages 1 | 0.2s, heap 14 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 15 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-image</sub> | PASS | review #3, raster pages 1 | 0.2s, heap 24 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-remove</sub> | PASS | review #4, raster pages none | 0.2s, heap 24 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-image</sub> | PASS | review #4, raster pages 1 | 0.3s, heap 15 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-remove</sub> | PASS | review #5, raster pages 1 | 0.1s, heap 12 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-image</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-remove</sub> | PASS | review #6, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-image</sub> | PASS | review #6, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-remove</sub> | PASS | review #7, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-image</sub> | PASS | review #7, raster pages 1 | 0.2s, heap 13 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-remove</sub> | PASS | review #8, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-image</sub> | PASS | review #8, raster pages 1 | 0.3s, heap 13 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-remove</sub> | PASS | review #r2-2, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-image</sub> | PASS | review #r2-2, raster pages 1 | 0.2s, heap 13 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 14 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-image</sub> | PASS | review #r2-1, raster pages 1 | 0.1s, heap 12 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 14 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-image</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 13 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-remove</sub> | PASS | review #r2-3, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-image</sub> | PASS | review #r2-3, raster pages 1 | 0.3s, heap 14 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-remove</sub> | PASS | review #r2-6, raster pages none | 0.1s, heap 14 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-image</sub> | PASS | review #r2-6, raster pages 1 | 0.2s, heap 13 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-remove</sub> | PASS |  | 0.2s, heap 13 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-image</sub> | PASS |  | 0.6s, heap 12 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-actualtext-us-budget</sub> | PASS |  | 3.3s, heap 62 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 70 ms | 0.5s, heap 79 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.1s, heap 64 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-regex-budget-phones</sub> | PASS | 6 boxes, (202) 512-1530, (888) 293-6498, (202) 512-1800 | 4.0s, heap 86 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.2s, heap 69 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 0.6s, heap 60 MB |
| forms | irs-f1040.pdf<br><sub>forms-list-irs-f1040</sub> | PASS | 199 fields (199 widgets) in 167 ms, pdf.js 199, has XFA | 1.3s, heap 9 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 42 ms, pdf.js 23, has XFA | 0.1s, heap 12 MB |
| forms | irs-fw4.pdf<br><sub>forms-list-irs-fw4</sub> | PASS | 48 fields (48 widgets) in 234 ms, pdf.js 48, has XFA | 1.5s, heap 9 MB |
| forms | irs-f1040sa.pdf<br><sub>forms-list-irs-f1040sa</sub> | PASS | 33 fields (33 widgets) in 11 ms, pdf.js 33, has XFA | 0.1s, heap 12 MB |
| forms | uscis-i-9.pdf<br><sub>forms-list-uscis-i-9</sub> | PASS | 128 fields (130 widgets) in 136 ms, pdf.js 128 | 0.3s, heap 12 MB |
| forms | uscis-i-485.pdf<br><sub>forms-list-uscis-i-485</sub> | PASS | 730 fields (730 widgets) in 1511 ms, pdf.js 730, has XFA | 1.6s, heap 28 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-list-uk-IPPH353</sub> | PASS | 92 fields (92 widgets) in 403 ms, pdf.js 92 | 0.5s, heap 14 MB |
| forms | uk-AFPS-Form-17.pdf<br><sub>forms-list-uk-AFPS-Form-17</sub> | PASS | 24 fields (24 widgets) in 42 ms, pdf.js 24 | 0.1s, heap 30 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-list-xfa-imm1344e-filled</sub> | PASS | 1 fields (1 widgets) in 4 ms, pdf.js 1, has XFA | 0.1s, heap 12 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 1 ms, pdf.js 0, has XFA | 0.1s, heap 35 MB |
| forms | annotation-button-widget.pdf<br><sub>forms-list-annotation-button-widget</sub> | PASS | 6 fields (9 widgets) in 3 ms, pdf.js 6, has XFA | 0.1s, heap 14 MB |
| forms | annotation-choice-widget.pdf<br><sub>forms-list-annotation-choice-widget</sub> | PASS | 5 fields (5 widgets) in 6 ms, pdf.js 5, has XFA | 0.1s, heap 35 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-list-annotation-text-widget</sub> | PASS | 7 fields (7 widgets) in 3 ms, pdf.js 7, has XFA | 0.1s, heap 15 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 0.9s, heap 36 MB |
| forms | irs-fw9.pdf<br><sub>forms-fill-fw9</sub> | PASS | 3 filled | 0.2s, heap 21 MB |
| forms | uscis-i-9.pdf<br><sub>forms-fill-i9</sub> | PASS | 3 filled | 0.7s, heap 15 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-fill-xfa-imm1344e</sub> | PASS |  | 0.3s, heap 36 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 0.8s, heap 16 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-fill-flatten-ipph353</sub> | PASS | 3 filled, flattened | 1.1s, heap 27 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-fill-flatten-text-widget</sub> | PASS | 3 filled, flattened | 0.1s, heap 40 MB |
| forms | uscis-i-485.pdf<br><sub>forms-flatten-i485</sub> | PASS | 730 fields flattened | 2.1s, heap 44 MB |
| forms | c-fw9-rot90.pdf<br><sub>c-forms-add-fw9-rot90</sub> | PASS |  | 0.4s, heap 24 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>c-forms-add-xfa-origin</sub> | PASS |  | 0.2s, heap 43 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-add-fw9</sub> | PASS |  | 0.2s, heap 20 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh</sub> | PASS |  | 0.6s, heap 37 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh-flat</sub> | PASS |  | 0.2s, heap 29 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar</sub> | PASS |  | 0.3s, heap 29 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar-flat</sub> | PASS |  | 0.2s, heap 22 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi</sub> | PASS |  | 0.3s, heap 45 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi-flat</sub> | PASS |  | 0.3s, heap 41 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja</sub> | PASS |  | 0.4s, heap 47 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja-flat</sub> | PASS |  | 0.3s, heap 39 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru</sub> | PASS |  | 0.3s, heap 40 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru-flat</sub> | PASS |  | 0.2s, heap 32 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-inspect-irs-fw9</sub> | PASS | 23 fields, 23 widgets, 40 ms | 0.1s, heap 18 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 1 ms | 0.1s, heap 34 MB |
| forms | uscis-i-9.pdf<br><sub>g3-forms-inspect-uscis-i-9</sub> | PASS | 128 fields, 130 widgets, 95 ms | 0.2s, heap 34 MB |
| forms | uscis-i-485.pdf<br><sub>g3-forms-inspect-uscis-i-485</sub> | PASS | 730 fields, 730 widgets, 1295 ms | 1.4s, heap 50 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 0.2s, heap 26 MB |
| forms | irs-f1040.pdf<br><sub>g3-forms-fill-xfa-irs-f1040-flat</sub> | PASS |  | 0.5s, heap 36 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 1.2s, heap 9 MB |
| compare | pdfjs-tracemonkey.pdf + pdfjs-tracemonkey_with_annotations.pdf<br><sub>compare-with-annotations</sub> | PASS | +0 -0, changed pages none | 0.6s, heap 13 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | PASS | +1213 -0, changed pages 3 | 1.2s, heap 9 MB |
| compare | 911-commission-report.pdf + 911-commission-report.pdf<br><sub>compare-911-self</sub> | PASS | +0 -0, changed pages none | 6.8s, heap 83 MB |
| compare | us-economic-report-president-2024.pdf + us-economic-report-president-2024.pdf<br><sub>compare-dense-econ-self</sub> | PASS | +0 -0, changed pages none | 8.0s, heap 110 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>g2-compare-inserted-overlay</sub> | PASS | 160 ms, +1213 -0, changed 3, overlay max 0.00% | 0.7s, heap 114 MB |
| compare | pdfjs-TAMReview.pdf + pdfjs-TAMReview.pdf<br><sub>g2-compare-tamreview-self</sub> | PASS | 345 ms, +0 -0, changed none, overlay max 0.00% | 3.3s, heap 104 MB |
| compare | aws-invoice.pdf + origin-shift-aws-invoice.pdf<br><sub>g2-compare-origin-shift</sub> | PASS | 126 ms, +0 -0, changed none, overlay max 0.00% | 0.3s, heap 11 MB |
| compare | pdfjs-tracemonkey.pdf<br><sub>g2-compare-removed-page</sub> | PASS | 246 ms, -1260 words, changed pairs 4 | 0.5s, heap 10 MB |
| compare | us-economic-report-president-2024.pdf<br><sub>g2-compare-dense-removed-page</sub> | PASS | 8883 ms, -251 words, changed pairs 10 | 10.4s, heap 141 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-0</sub> | PASS | 2819 ms, turned 0 of 2, osd 0/4.9 0/5.5 | 3.5s, heap 10 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-90</sub> | PASS | 2989 ms, turned 2 of 2, osd 270/0.4 270/2.2 | 3.7s, heap 10 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-180</sub> | PASS | 1686 ms, turned 2 of 2, osd 180/3.4 180/5.3 | 1.9s, heap 11 MB |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-270</sub> | PASS | 1643 ms, turned 2 of 2, osd 90/0.3 90/2.3 | 1.8s, heap 11 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-0</sub> | PASS | 19545 ms, turned 0 of 36, osd 0/0.0 180/0.1 180/0.6 0/0.0 0/0.0 0/4.3 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/20.4 0/30.3 0/0.0 0/0.0 180/1.0 180/0.8 0/0.0 0/0.0 0/0.0 0/0.0 0/9.6 0/1.3 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/0.4 0/0.0 180/0.2 | 19.8s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-90</sub> | PASS | 20907 ms, turned 36 of 36, osd 0/0.0 90/0.1 0/0.0 0/0.0 0/0.0 270/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/21.2 270/27.6 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 270/6.5 270/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/1.0 0/0.4 180/0.9 | 21.2s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-180</sub> | PASS | 20866 ms, turned 36 of 36, osd 0/0.0 0/0.0 0/0.7 0/0.0 0/0.0 180/3.5 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/18.5 180/30.7 0/0.0 0/0.0 0/1.0 0/0.6 0/0.0 0/0.0 0/0.0 0/0.0 180/8.4 180/1.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.5 0/0.0 0/0.4 | 21.1s, heap 10 MB |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-270</sub> | PASS | 15488 ms, turned 36 of 36, osd 0/0.0 180/0.1 0/0.0 0/0.0 0/0.0 90/4.2 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 90/22.3 90/28.7 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 90/7.0 90/0.9 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 0/0.0 180/1.0 270/0.3 0/0.6 | 15.7s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-0</sub> | PASS | 2181 ms, turned 0 of 1, osd 0/0.4 | 2.5s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-90</sub> | PASS | 1643 ms, turned 0 of 1, osd 270/1.2; warn: every page back upright (not detected: p1) | 1.8s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-180</sub> | PASS | 2629 ms, turned 0 of 1, osd 180/0.4; warn: every page back upright (not detected: p1) | 2.9s, heap 10 MB |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-270</sub> | PASS | 2088 ms, turned 0 of 1, osd 90/1.1; warn: every page back upright (not detected: p1) | 2.2s, heap 10 MB |
| booklet | pdfjs-tracemonkey.pdf<br><sub>u5a-booklet-tracemonkey</sub> | PASS | 14 pages on 4 sheets, first sides -\|1 / 2\|- | 2.3s, heap 9 MB |
| booklet | aws-invoice.pdf<br><sub>u5a-booklet-aws-invoice</sub> | PASS | 1 pages on 1 sheets, first sides -\|1 / -\|- | 0.1s, heap 15 MB |
| booklet | arxiv-1706.03762-attention.pdf<br><sub>u5a-booklet-attention-spine-right-gutter</sub> | PASS | 15 pages on 4 sheets, first sides 1\|- / 15\|2 | 6.5s, heap 32 MB |
| booklet | c-mixed.pdf<br><sub>u5a-booklet-mixed-fronts</sub> | PASS | 5 pages on 2 sheets, first sides -\|1 / -\|3 | 0.3s, heap 36 MB |
| booklet | rot90-cropbox-bert.pdf<br><sub>u5a-booklet-long-edge-rot90-a4</sub> | PASS | 16 pages on 4 sheets, first sides 16\|1 / 2\|15 | 0.9s, heap 9 MB |
| booklet | arxiv-2307.09288-llama2.pdf<br><sub>u5a-booklet-llama2</sub> | PASS | 77 pages on 20 sheets, first sides -\|1 / 2\|- | 3.0s, heap 25 MB |
| booklet | arxiv-1706.03762-attention.pdf<br><sub>u5a-booklet-raw-attention</sub> | PASS | 15 pages on 4 sheets, first sides -\|1 / 2\|15 | 2.5s, heap 59 MB |
| booklet | irs-fw9.pdf<br><sub>u5a-booklet-filled-fw9</sub> | PASS | 6 pages on 2 sheets, first sides -\|1 / 2\|- | 0.3s, heap 51 MB |
| bookmarks | pdfjs-outlines_se.pdf<br><sub>u5b-bookmarks-outlines-se</sub> | PASS | run to result 279 ms: 6 bookmarks. | 0.9s, heap 9 MB |
| bookmarks | pdfjs-nested_outline.pdf<br><sub>u5b-bookmarks-nested</sub> | PASS | run to result 9 ms: 12 bookmarks. | 0.1s, heap 11 MB |
| bookmarks | pdfjs-outline_goto_action.pdf<br><sub>u5b-bookmarks-goto-action</sub> | PASS | run to result 613 ms: 5 bookmarks. | 1.7s, heap 9 MB |
| bookmarks | pdfjs-tracemonkey.pdf<br><sub>u5b-bookmarks-tracemonkey</sub> | PASS | run to result 202 ms: 3 bookmarks. | 0.4s, heap 11 MB |
| bookmarks | arxiv-1706.03762-attention.pdf<br><sub>u5b-bookmarks-headings-attention</sub> | PASS | run to result 1501 ms: 11 bookmarks. | 3.3s, heap 18 MB |
| bookmarks | xfa-imm1344e-filled.pdf<br><sub>u5b-bookmarks-xfa-imm1344e</sub> | PASS | run to result 82 ms: 21 bookmarks. | 0.3s, heap 18 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-facturx</sub> | PASS | run to result 244 ms: Removed 1 attached file. | 0.8s, heap 9 MB |
| sanitize | xfa-imm1344e-filled.pdf<br><sub>u5b-sanitize-xfa-imm1344e</sub> | PASS | run to result 509 ms: Removed 39 scripts, 355 XFA scripts. | 1.2s, heap 9 MB |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | PASS | run to result 90 ms: Removed 3 scripts, 1 XFA form. | 0.2s, heap 10 MB |
| sanitize | uscis-i-9.pdf<br><sub>u5b-sanitize-i9</sub> | PASS | run to result 352 ms: Removed 28 scripts, 32 triggers. | 0.8s, heap 11 MB |
| sanitize | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-sanitize-fileattachment</sub> | PASS | run to result 5 ms: Removed 1 attached file. | 0.1s, heap 12 MB |
| sanitize | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-sanitize-all-tracemonkey</sub> | PASS | run to result 73 ms: Removed 1 info dictionary, 24 embedded fonts. | 0.3s, heap 13 MB |
| sanitize | pdfjs-tracemonkey.pdf<br><sub>u5b-sanitize-tracemonkey</sub> | PASS | run to result 64 ms: Nothing found to remove. | 0.3s, heap 13 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-aws</sub> | PASS | run to result 6 ms: Nothing found to remove. | 0.1s, heap 15 MB |
| sanitize | arxiv-1706.03762-attention.pdf<br><sub>u5b-sanitize-attention</sub> | PASS | run to result 648 ms: Nothing found to remove. | 1.5s, heap 25 MB |
| removeannots | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-removeannots-tracemonkey</sub> | PASS | run to result 464 ms: 4 annotations removed. | 1.4s, heap 9 MB |
| removeannots | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-removeannots-fileattachment</sub> | PASS | run to result 8 ms: 1 annotation removed. | 0.2s, heap 12 MB |
| removeannots | irs-fw9.pdf<br><sub>u5b-removeannots-fw9-fields</sub> | PASS | run to result 328 ms: 23 annotations removed. | 0.8s, heap 9 MB |
| removeannots | xfa-imm1344e-filled.pdf<br><sub>u5b-removeannots-fields-xfa-imm1344e</sub> | PASS |  | 0.2s |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | PASS | run to result 330 ms: Images removed on 3 pages, 177.9 KB saved. | 1.0s, heap 9 MB |
| removeimages | aws-invoice.pdf<br><sub>u5b-removeimages-aws</sub> | PASS | run to result 10 ms: Images removed on 1 page, 66.6 KB saved. | 0.1s, heap 12 MB |
| removeimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-removeimages-attention</sub> | PASS | run to result 1044 ms: Images removed on 2 pages, 604.8 KB saved. | 2.6s, heap 17 MB |
| removeimages | udhr-hebrew.pdf<br><sub>u5b-removeimages-inline-hebrew</sub> | PASS | run to result 15 ms: No images found, the file is unchanged. | 0.1s, heap 12 MB |
| removeimages | arxiv-2005.14165-gpt3.pdf<br><sub>u5b-removeimages-inline-gpt3</sub> | PASS | run to result 161 ms: Images removed on 26 pages, 5.97 MB saved. | 0.6s, heap 13 MB |
| flatten | xfa-issue14315.pdf<br><sub>u5b-flatten-xfa-dynamic</sub> | PASS |  | 0.8s |
| flatten | xfa-imm1344e-filled.pdf<br><sub>u5b-flatten-xfa-imm1344e</sub> | PASS |  | 0.1s |
| flatten | xfa-imm1344e-filled.pdf<br><sub>u5b-flatten-full-xfa-imm1344e</sub> | PASS |  | 0.6s |
| flatten | irs-fw9.pdf<br><sub>u5b-flatten-fw9</sub> | PASS | run to result 344 ms: 23 fields flattened. | 0.6s, heap 10 MB |
| flatten | uscis-i-9.pdf<br><sub>u5b-flatten-i9</sub> | PASS | run to result 442 ms: 128 fields flattened. | 1.1s, heap 19 MB |
| flatten | irs-fw4.pdf<br><sub>u5b-flatten-fw4</sub> | PASS | run to result 791 ms: 48 fields flattened. | 1.7s, heap 19 MB |
| flatten | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-flatten-full-tracemonkey</sub> | PASS | run to result 114 ms: 4 annotations flattened. | 0.5s, heap 19 MB |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-fw9</sub> | PASS | run to result 298 ms: Unlocked 23 fields, 23 XFA locks. | 1.0s, heap 9 MB |
| unlockforms | uscis-i-9.pdf<br><sub>u5b-unlockforms-i9</sub> | PASS | run to result 73 ms: Unlocked 128 fields. | 0.3s, heap 12 MB |
| unlockforms | xfa-imm1344e-filled.pdf<br><sub>u5b-unlockforms-xfa</sub> | PASS | run to result 551 ms: Unlocked 1 field, 299 XFA locks. | 1.7s, heap 9 MB |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-xfa-single-stream</sub> | PASS | run to result 51 ms: Unlocked 23 fields, 23 XFA locks. | 0.3s, heap 11 MB |
| unlockforms | xfa-issue14315.pdf<br><sub>u5b-unlockforms-xfa-nothing-locked</sub> | PASS | run to result 3 ms: No read-only fields, the file is unchanged. | 0.1s, heap 10 MB |
| info | pdfjs-tracemonkey.pdf<br><sub>u5b-info-tracemonkey</sub> | PASS | run to result 229 ms: 14 pages, 24 fonts, 90 images. | 1.1s, heap 9 MB |
| info | aws-invoice.pdf<br><sub>u5b-info-aws</sub> | PASS | run to result 12 ms: 1 page, 3 fonts, 1 image. | 0.1s, heap 13 MB |
| info | irs-fw9.pdf<br><sub>u5b-info-fw9</sub> | PASS | run to result 222 ms: 6 pages, 6 fonts, 0 images. | 0.7s, heap 9 MB |
| info | arxiv-1706.03762-attention.pdf<br><sub>u5b-info-attention</sub> | PASS | run to result 714 ms: 15 pages, 34 fonts, 3 images. | 1.4s, heap 21 MB |
| autorename | pdfjs-tracemonkey.pdf<br><sub>u5b-autorename-tracemonkey</sub> | PASS | run to result 411 ms: Named after its heading. Was pdfjs-tracemonkey.pdf. | 1.2s, heap 9 MB |
| autorename | arxiv-1706.03762-attention.pdf<br><sub>u5b-autorename-attention</sub> | PASS | run to result 913 ms: Named after its heading. Was arxiv-1706.03762-attention.pdf. | 2.3s, heap 21 MB |
| autorename | aws-invoice.pdf<br><sub>u5b-autorename-aws</sub> | PASS | run to result 70 ms: Named after its heading. Was aws-invoice.pdf. | 0.2s, heap 13 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | PASS | ready 1.2s, click to download 1.3s: 2 PDFs, 14 pages in total | 3.0s, heap 13 MB |
