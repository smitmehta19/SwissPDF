# Corpus scorecard: polishB2-touched

Run: 2026-10-27 20:05 UTC, 8.4 min. Command: `npm run test:corpus -- --light --shards 2 --tool sanitize,removeimages,redact,forms,ocr,repair,pdf2md,bookmarks --name polishB2-touched`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **165 PASS, 0 FAIL, 0 SKIP** of 165 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| repair | 11 | 0 | 0 | 19.6s |
| ocr | 22 | 0 | 0 | 300.1s |
| pdf2md | 12 | 0 | 0 | 13.0s |
| redact | 58 | 0 | 0 | 41.1s |
| forms | 40 | 0 | 0 | 18.0s |
| sanitize | 10 | 0 | 0 | 5.8s |
| removeimages | 6 | 0 | 0 | 3.5s |
| bookmarks | 6 | 0 | 0 | 6.4s |

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
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT REPRODUCED | 3 linked check(s) passed, e.g. c-forms-add-fw9-rot90: field box where drawn (60, 80) 200x22; c-forms-add-xfa-origin: field box where drawn (60, 80) 200x22 |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT REPRODUCED | 10 linked check(s) passed, e.g. c-forms-fill-zh: value stored in the field; c-forms-fill-zh-flat: flattened value extracts back (pdf.js) |
| 10 | OCR English only, assets from CDN (not offline) | NOT REPRODUCED | 24 linked check(s) passed, e.g. ocr-fax-printed: no network fetches outside the page origin; ocr-fips-printed: no network fetches outside the page origin |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | SOFT WARN | soft only, 8 linked check(s) passed; warn: ocr-darwin-with-text-layer: skips pages that already have text (33 words before, +33 added); ocr-born-digital-invoice: skips pages that already have text (105 words before, +106 added) (+1 more) |
| 12 | Merge/split drop outlines, AcroForm, links | NOT TESTED | no corpus case |
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
| 24 | Sign is visual only, one placement | NOT TESTED | feature gap (no PAdES / multi-place API to call) |
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 28 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (5.9x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (10.8x input) (+1 more) |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT REPRODUCED | 6 linked check(s) passed, e.g. repair-budget-bookmarks: bookmarks kept; repair-fw9-form: form fields kept |
| 27 | Compare by page index only; inserted page breaks the rest | NOT TESTED | no corpus case |
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
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | PASS | recovered 1, rasterized 0, lost 0 | 2.1s, heap 9 MB |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | PASS |  | 2.0s |
| repair | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>repair-fuzzed-395</sub> | PASS |  | 0.1s |
| repair | pdfjs-bug1020226.pdf<br><sub>repair-bug1020226</sub> | PASS |  | 0.1s |
| repair | pdfjs-Pages-tree-refs.pdf<br><sub>repair-pages-tree-refs</sub> | PASS | recovered 1, rasterized 0, lost 1 | 0.1s, heap 10 MB |
| repair | pdf20-offset-start.pdf<br><sub>repair-offset-start</sub> | PASS | recovered 1, rasterized 0, lost 0 | 0.1s, heap 10 MB |
| repair | us-budget-2024.pdf<br><sub>repair-budget-bookmarks</sub> | PASS | recovered 184, rasterized 0, lost 0 | 2.8s, heap 29 MB |
| repair | irs-fw9.pdf<br><sub>repair-fw9-form</sub> | PASS | recovered 6, rasterized 0, lost 0 | 0.1s, heap 28 MB |
| repair | us-budget-2024.pdf<br><sub>g2-repair-keeps-structure</sub> | PASS | rewrite, 27 of 27 bookmarks | 2.2s, heap 53 MB |
| repair | irs-fw9.pdf<br><sub>g2-repair-keeps-fields</sub> | PASS | rewrite, 23 of 23 fields | 0.2s, heap 11 MB |
| repair | us-budget-2024.pdf<br><sub>g2-repair-truncated-bookmarks</sub> | PASS | rebuild, 183 pages, 27/27 bookmarks, intake: File was damaged and has been repaired. 1 of 184 pages could not be recovered | 9.7s, heap 76 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 414 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc" | 9.0s, heap 13 MB |
| ocr | sub-fips-p5-6.pdf<br><sub>ocr-fips-printed</sub> | PASS | 91 words, sample "N RS-466 PROCEDURES FOR DOCUMENT FACSIMILE TRANSMI" | 5.0s, heap 11 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>ocr-darwin-with-text-layer</sub> | PASS | 97 words, sample " CONTENTS PAGE EDITOR'S INTRODUCTION . 5 5 3 e o "; warn: skips pages that already have text (33 words before, +33 added) | 6.4s, heap 10 MB |
| ocr | sub-lincoln-p3-4.pdf<br><sub>ocr-lincoln-letter</sub> | PASS | 0 words, sample " "; warn: some text recognised (+0 words (OCR saw nothing: page renders blank, JPX scan)) | 2.0s, heap 11 MB |
| ocr | letter-to-benjamin-glover.pdf<br><sub>ocr-glover-handwritten</sub> | PASS | 732 words, sample "Tl , AR caiksie feATT \| \| i RE 0 ie \| \| Aili i pT " | 48.2s, heap 14 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>ocr-ndl-japanese-scan</sub> | PASS | 20 words, sample "¢- © - REN gE RTT ERY A TR a A RY A SN a IPS EVIDE" | 6.5s, heap 10 MB |
| ocr | oyo.pdf<br><sub>ocr-born-digital-invoice</sub> | PASS | 184 words, sample "OoYO PAYMENT RECEIPT Guest Name: Sanjay Date: 31/1"; warn: skips pages that already have text (105 words before, +106 added) | 4.7s, heap 12 MB |
| ocr | udhr-korean.pdf<br><sub>ocr-intl-korean</sub> | PASS | 483 words, sample "MA Ql MA ME DE QR FHM MEO EYE S551 FTE + gle HEE"; warn: skips pages that already have text (0 words before, +73 added) | 31.6s, heap 13 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-geometry</sub> | PASS | upright 46/47 median 1.7pt; turned 45/46 median 1.6pt; rot90crop 46/47 median 1.5pt; skew 41/43 median 1.8pt | 42.8s, heap 12 MB |
| ocr | udhr-chinese-simplified.pdf<br><sub>g2-ocr-scan-chinese</sub> | PASS | 451 words, 0 without a font, coverage 0.92, "世界 人 权 宣 告 联合 国 大 会 一 九 四 八 年 十 二 月 十 日" | 9.2s, heap 11 MB |
| ocr | udhr-japanese.pdf<br><sub>g2-ocr-scan-japanese</sub> | PASS | 399 words, 0 without a font, coverage 0.96, "『 世 界 人 権 宣言 』 ( 1948.12.10 第 3 回 国連 総会" | 8.6s, heap 13 MB |
| ocr | udhr-korean.pdf<br><sub>g2-ocr-scan-korean</sub> | PASS | 460 words, 0 without a font, coverage 0.99, "세계인권선언 전 문 모든 인류 구성원의 천부의 존엄성과 동등하고 양도" | 8.4s, heap 20 MB |
| ocr | udhr-arabic.pdf<br><sub>g2-ocr-scan-arabic</sub> | PASS | 290 words, 1 without a font, coverage 1.00, "UDHR - Arabic, Standard https://unicode." | 10.1s, heap 15 MB |
| ocr | udhr-hindi.pdf<br><sub>g2-ocr-scan-hindi</sub> | PASS | 551 words, 8 without a font, coverage undefined, "ह्ड - प़ंएतां मानव अधिकारों की सार्वमौम " | 14.5s, heap 16 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-scan-mixed-eng-deu</sub> | PASS | 727 words, 0 without a font, coverage 0.97, ". . . . . . Trace-based Just-in-Time Typ" | 14.7s, heap 16 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-fax-force</sub> | PASS | 414 words on 2 pages (0 skipped), turned 0, "10/25/2008 15:38 FAX 202 225 1992 Congre" | 9.3s, heap 18 MB |
| ocr | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-ocr-lincoln-36p</sub> | PASS | 95 words on 24 pages (12 skipped), turned 0, " TEL ey +o '] i ¥ 7, x - 3 - a, )" | 33.8s, heap 17 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-konoye-jpn</sub> | PASS | 22 words on 1 pages (0 skipped), turned 0, "ii \| TPS EVIDENTIARY DOCUMENT wo ンズ の 村 " | 9.4s, heap 16 MB |
| ocr | sub-ndl-konoye-p1.pdf<br><sub>g2-ocr-ndl-japanese-handwritten</sub> | PASS | 22 words, 2 CJK characters; warn: Japanese characters recognised (2 CJK characters) | 9.9s, heap 16 MB |
| ocr | sub-darwin-p10-11.pdf<br><sub>g2-ocr-skip-text-pages</sub> | PASS | read 1, skipped 2 | 1.2s, heap 15 MB |
| ocr | oyo.pdf<br><sub>g2-ocr-force-text-pages</sub> | PASS | 184 words | 4.9s, heap 15 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-cancel</sub> | PASS | stopped at 3002 ms during "Page 1 of 2, recognizing", next run 348 words | 9.9s, heap 17 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 85802 chars, 14 headings, 11 tables | 2.9s, heap 12 MB |
| pdf2md | us-budget-2024.pdf<br><sub>pdf2md-budget</sub> | PASS | 596818 chars, 29 headings, 125 tables | 5.0s, heap 33 MB |
| pdf2md | aws-invoice.pdf<br><sub>pdf2md-aws-invoice</sub> | PASS | 2073 chars, 4 headings, 3 tables | 0.1s, heap 14 MB |
| pdf2md | udhr-chinese-simplified.pdf<br><sub>pdf2md-chinese</sub> | PASS | 5895 chars, 0 headings, 0 tables | 0.3s, heap 43 MB |
| pdf2md | udhr-japanese.pdf<br><sub>pdf2md-japanese</sub> | PASS | 4587 chars, 0 headings, 0 tables | 0.2s, heap 15 MB |
| pdf2md | pdfjs-noembed-sjis.pdf<br><sub>pdf2md-noembed-sjis</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.1s, heap 27 MB |
| pdf2md | pdfjs-noembed-eucjp.pdf<br><sub>pdf2md-noembed-eucjp</sub> | PASS | 6 chars, 0 headings, 0 tables | 0.1s, heap 19 MB |
| pdf2md | pdfjs-vertical.pdf<br><sub>pdf2md-vertical</sub> | PASS | 20 chars, 0 headings, 0 tables | 0.1s, heap 27 MB |
| pdf2md | udhr-arabic.pdf<br><sub>pdf2md-arabic</sub> | PASS | 8269 chars, 0 headings, 0 tables | 0.2s, heap 19 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | PASS | 85802 chars, 11 tables, 14 headings | 2.3s, heap 12 MB |
| pdf2md | arxiv-1810.04805-bert.pdf<br><sub>h-md-bert-columns</sub> | PASS | 68224 chars, 14 tables, 13 headings | 1.4s, heap 20 MB |
| pdf2md | netpresse-invoice.pdf<br><sub>h-md-netpresse-tables</sub> | PASS | 1472 chars, 2 tables, 0 headings | 0.2s, heap 18 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.9x size; warn: size stays reasonable (<= 3x) (5.9x input) | 5.3s, heap 17 MB |
| redact | aws-invoice.pdf<br><sub>redact-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 0.8s, heap 12 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.8x size; warn: size stays reasonable (<= 3x) (10.8x input) | 4.7s, heap 29 MB |
| redact | pdfjs-rotation.pdf<br><sub>redact-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 4.4x size; warn: size stays reasonable (<= 3x) (4.4x input) | 0.2s, heap 12 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>redact-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 1.9s, heap 10 MB |
| redact | letter-to-benjamin-glover.pdf<br><sub>redact-numbered-scan-letter-to-benjamin-glover</sub> | PASS |  | 1.3s, heap 13 MB |
| redact | fax-jean-schmidt-doe.pdf<br><sub>redact-numbered-scan-fax-jean-schmidt-doe</sub> | PASS |  | 0.5s, heap 16 MB |
| redact | uk-IPPH353.pdf<br><sub>redact-find-split-uk-IPPH353</sub> | PASS |  | 0.2s, heap 10 MB |
| redact | uk-AFPS-Form-17.pdf<br><sub>redact-find-split-uk-AFPS-Form-17</sub> | PASS |  | 0.1s, heap 12 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.94x size, 304 ms | 1.2s, heap 12 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.00x size, 594 ms | 1.4s, heap 31 MB |
| redact | pdfjs-rotation.pdf<br><sub>g3-redact-remove-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 0.83x size, 3 ms | 0.1s, heap 32 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 25 ms | 0.3s, heap 32 MB |
| redact | c-rot270-cropbox.pdf<br><sub>g3-redact-remove-rot270-cropbox</sub> | PASS | 16 boxes on 2 page(s), 0.99x size, 124 ms | 0.7s, heap 14 MB |
| redact | c-rot180-origin.pdf<br><sub>g3-redact-remove-rot180-origin</sub> | PASS | 16 boxes on 2 page(s), 0.99x size, 71 ms | 0.4s, heap 13 MB |
| redact | aws-invoice.pdf<br><sub>g3-redact-remove-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 0.96x size, 39 ms | 0.5s, heap 35 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-image-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.77x size, 1913 ms | 4.3s, heap 33 MB |
| redact | flipkart-invoice.pdf<br><sub>g3-redact-remove-flipkart</sub> | PASS | 6 boxes on 1 page(s), 1.01x size, 16 ms | 0.3s, heap 13 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-image-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.93x size, 1767 ms | 3.9s, heap 39 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | PASS |  | 0.1s, heap 13 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | PASS |  | 0.2s, heap 15 MB |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | PASS |  | 0.2s, heap 12 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-remove</sub> | PASS | review #1, raster pages none | 0.1s, heap 11 MB |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-image</sub> | PASS | review #1, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-remove</sub> | PASS | review #2, raster pages none | 0.1s, heap 11 MB |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-image</sub> | PASS | review #2, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-image</sub> | PASS | review #3, raster pages 1 | 0.2s, heap 13 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-remove</sub> | PASS | review #3, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-image</sub> | PASS | review #3, raster pages 1 | 0.1s, heap 13 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-remove</sub> | PASS | review #4, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-image</sub> | PASS | review #4, raster pages 1 | 0.3s, heap 13 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-remove</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 13 MB |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-image</sub> | PASS | review #5, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-remove</sub> | PASS | review #6, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-image</sub> | PASS | review #6, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-remove</sub> | PASS | review #7, raster pages none | 0.1s, heap 13 MB |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-image</sub> | PASS | review #7, raster pages 1 | 0.3s, heap 13 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-remove</sub> | PASS | review #8, raster pages none | 0.1s, heap 11 MB |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-image</sub> | PASS | review #8, raster pages 1 | 0.3s, heap 13 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-remove</sub> | PASS | review #r2-2, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-image</sub> | PASS | review #r2-2, raster pages 1 | 0.4s, heap 13 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-image</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-remove</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-image</sub> | PASS | review #r2-1, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-remove</sub> | PASS | review #r2-3, raster pages none | 0.1s, heap 12 MB |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-image</sub> | PASS | review #r2-3, raster pages 1 | 0.2s, heap 12 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-remove</sub> | PASS | review #r2-6, raster pages none | 0.1s, heap 11 MB |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-image</sub> | PASS | review #r2-6, raster pages 1 | 0.2s, heap 12 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-remove</sub> | PASS |  | 0.2s, heap 12 MB |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-image</sub> | PASS |  | 0.5s, heap 12 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-actualtext-us-budget</sub> | PASS |  | 2.2s, heap 80 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 123 ms | 0.5s, heap 12 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.1s, heap 23 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-regex-budget-phones</sub> | PASS | 6 boxes, (202) 512-1530, (888) 293-6498, (202) 512-1800 | 3.1s, heap 68 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.2s, heap 65 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 0.3s, heap 13 MB |
| forms | irs-f1040.pdf<br><sub>forms-list-irs-f1040</sub> | PASS | 199 fields (199 widgets) in 148 ms, pdf.js 199, has XFA | 0.6s, heap 9 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 32 ms, pdf.js 23, has XFA | 0.1s, heap 12 MB |
| forms | irs-fw4.pdf<br><sub>forms-list-irs-fw4</sub> | PASS | 48 fields (48 widgets) in 243 ms, pdf.js 48, has XFA | 1.0s, heap 9 MB |
| forms | irs-f1040sa.pdf<br><sub>forms-list-irs-f1040sa</sub> | PASS | 33 fields (33 widgets) in 9 ms, pdf.js 33, has XFA | 0.1s, heap 13 MB |
| forms | uscis-i-9.pdf<br><sub>forms-list-uscis-i-9</sub> | PASS | 128 fields (130 widgets) in 97 ms, pdf.js 128 | 0.2s, heap 13 MB |
| forms | uscis-i-485.pdf<br><sub>forms-list-uscis-i-485</sub> | PASS | 730 fields (730 widgets) in 1363 ms, pdf.js 730, has XFA | 1.5s, heap 28 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-list-uk-IPPH353</sub> | PASS | 92 fields (92 widgets) in 274 ms, pdf.js 92 | 0.4s, heap 17 MB |
| forms | uk-AFPS-Form-17.pdf<br><sub>forms-list-uk-AFPS-Form-17</sub> | PASS | 24 fields (24 widgets) in 26 ms, pdf.js 24 | 0.1s, heap 30 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-list-xfa-imm1344e-filled</sub> | PASS | 1 fields (1 widgets) in 3 ms, pdf.js 1, has XFA | 0.2s, heap 14 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 1 ms, pdf.js 0, has XFA | 0.1s, heap 35 MB |
| forms | annotation-button-widget.pdf<br><sub>forms-list-annotation-button-widget</sub> | PASS | 6 fields (9 widgets) in 2 ms, pdf.js 6, has XFA | 0.1s, heap 15 MB |
| forms | annotation-choice-widget.pdf<br><sub>forms-list-annotation-choice-widget</sub> | PASS | 5 fields (5 widgets) in 4 ms, pdf.js 5, has XFA | 0.1s, heap 35 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-list-annotation-text-widget</sub> | PASS | 7 fields (7 widgets) in 4 ms, pdf.js 7, has XFA | 0.1s, heap 16 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 0.9s, heap 36 MB |
| forms | irs-fw9.pdf<br><sub>forms-fill-fw9</sub> | PASS | 3 filled | 0.3s, heap 17 MB |
| forms | uscis-i-9.pdf<br><sub>forms-fill-i9</sub> | PASS | 3 filled | 0.7s, heap 13 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-fill-xfa-imm1344e</sub> | PASS |  | 0.1s, heap 21 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 0.8s, heap 21 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-fill-flatten-ipph353</sub> | PASS | 3 filled, flattened | 1.2s, heap 15 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-fill-flatten-text-widget</sub> | PASS | 3 filled, flattened | 0.1s, heap 26 MB |
| forms | uscis-i-485.pdf<br><sub>forms-flatten-i485</sub> | PASS | 730 fields flattened | 2.3s, heap 36 MB |
| forms | c-fw9-rot90.pdf<br><sub>c-forms-add-fw9-rot90</sub> | PASS |  | 0.2s, heap 28 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>c-forms-add-xfa-origin</sub> | PASS |  | 0.3s, heap 29 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-add-fw9</sub> | PASS |  | 0.2s, heap 36 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh</sub> | PASS |  | 0.3s, heap 14 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh-flat</sub> | PASS |  | 0.2s, heap 26 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar</sub> | PASS |  | 0.3s, heap 31 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar-flat</sub> | PASS |  | 0.2s, heap 44 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi</sub> | PASS |  | 0.3s, heap 26 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi-flat</sub> | PASS |  | 0.3s, heap 41 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja</sub> | PASS |  | 0.3s, heap 24 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja-flat</sub> | PASS |  | 0.3s, heap 46 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru</sub> | PASS |  | 0.3s, heap 40 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru-flat</sub> | PASS |  | 0.2s, heap 43 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-inspect-irs-fw9</sub> | PASS | 23 fields, 23 widgets, 27 ms | 0.1s, heap 16 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 1 ms | 0.1s, heap 19 MB |
| forms | uscis-i-9.pdf<br><sub>g3-forms-inspect-uscis-i-9</sub> | PASS | 128 fields, 130 widgets, 80 ms | 0.1s, heap 20 MB |
| forms | uscis-i-485.pdf<br><sub>g3-forms-inspect-uscis-i-485</sub> | PASS | 730 fields, 730 widgets, 1092 ms | 1.3s, heap 32 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 0.2s, heap 41 MB |
| forms | irs-f1040.pdf<br><sub>g3-forms-fill-xfa-irs-f1040-flat</sub> | PASS |  | 1.4s, heap 33 MB |
| sanitize | loose-attachment.pdf<br><sub>u5b-sanitize-loose-attachment</sub> | PASS | run to result 261 ms: Removed 1 attached file. | 0.7s, heap 9 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-facturx</sub> | PASS | run to result 539 ms: Removed 1 attached file. | 1.4s, heap 9 MB |
| sanitize | xfa-imm1344e-filled.pdf<br><sub>u5b-sanitize-xfa-imm1344e</sub> | PASS | run to result 140 ms: Removed 39 scripts, 355 XFA scripts, 1 attached file. | 0.3s, heap 11 MB |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | PASS | run to result 136 ms: Removed 3 scripts, 1 XFA form. | 0.3s, heap 12 MB |
| sanitize | uscis-i-9.pdf<br><sub>u5b-sanitize-i9</sub> | PASS | run to result 224 ms: Removed 28 scripts, 32 triggers. | 0.5s, heap 9 MB |
| sanitize | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-sanitize-fileattachment</sub> | PASS | run to result 6 ms: Removed 1 attached file. | 0.1s, heap 14 MB |
| sanitize | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-sanitize-all-tracemonkey</sub> | PASS | run to result 118 ms: Removed 1 info dictionary, 24 embedded fonts. | 0.4s, heap 12 MB |
| sanitize | pdfjs-tracemonkey.pdf<br><sub>u5b-sanitize-tracemonkey</sub> | PASS | run to result 69 ms: Nothing found to remove. | 0.3s, heap 14 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-aws</sub> | PASS | run to result 9 ms: Nothing found to remove. | 0.1s, heap 14 MB |
| sanitize | arxiv-1706.03762-attention.pdf<br><sub>u5b-sanitize-attention</sub> | PASS | run to result 459 ms: Nothing found to remove. | 1.5s, heap 26 MB |
| removeimages | loose-image.pdf<br><sub>u5b-removeimages-loose-image</sub> | PASS | run to result 259 ms: 1 image left over from an earlier version of the file removed, 170 B saved. | 0.7s, heap 9 MB |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | PASS | run to result 360 ms: Images removed on 3 pages, 177.9 KB saved. | 1.0s, heap 9 MB |
| removeimages | aws-invoice.pdf<br><sub>u5b-removeimages-aws</sub> | PASS | run to result 13 ms: Images removed on 1 page, 66.6 KB saved. | 0.1s, heap 9 MB |
| removeimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-removeimages-attention</sub> | PASS | run to result 334 ms: Images removed on 2 pages, 604.8 KB saved. | 1.1s, heap 12 MB |
| removeimages | udhr-hebrew.pdf<br><sub>u5b-removeimages-inline-hebrew</sub> | PASS | run to result 19 ms: No images found, the file is unchanged. | 0.1s, heap 18 MB |
| removeimages | arxiv-2005.14165-gpt3.pdf<br><sub>u5b-removeimages-inline-gpt3</sub> | PASS | run to result 158 ms: Images removed on 26 pages, 5.97 MB saved. | 0.5s, heap 18 MB |
| bookmarks | pdfjs-outlines_se.pdf<br><sub>u5b-bookmarks-outlines-se</sub> | PASS | run to result 458 ms: 6 bookmarks. | 1.3s, heap 9 MB |
| bookmarks | pdfjs-nested_outline.pdf<br><sub>u5b-bookmarks-nested</sub> | PASS | run to result 408 ms: 12 bookmarks. | 1.0s, heap 9 MB |
| bookmarks | pdfjs-outline_goto_action.pdf<br><sub>u5b-bookmarks-goto-action</sub> | PASS | run to result 9 ms: 5 bookmarks. | 0.1s, heap 11 MB |
| bookmarks | pdfjs-tracemonkey.pdf<br><sub>u5b-bookmarks-tracemonkey</sub> | PASS | run to result 237 ms: 3 bookmarks. | 0.5s, heap 11 MB |
| bookmarks | arxiv-1706.03762-attention.pdf<br><sub>u5b-bookmarks-headings-attention</sub> | PASS | run to result 1261 ms: 11 bookmarks. | 3.0s, heap 24 MB |
| bookmarks | xfa-imm1344e-filled.pdf<br><sub>u5b-bookmarks-xfa-imm1344e</sub> | PASS | run to result 195 ms: 21 bookmarks. | 0.4s, heap 11 MB |
