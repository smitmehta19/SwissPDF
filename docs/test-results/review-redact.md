# Corpus scorecard: review-redact

Run: 2026-10-27 00:14 UTC, 2.3 min. Command: `npm run test:corpus -- --case redact|forms --name review-redact`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **82 PASS, 1 FAIL, 0 SKIP** of 83 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| merge | 1 | 0 | 0 | 26.0s |
| redact | 25 | 0 | 0 | 50.2s |
| forms | 39 | 1 | 0 | 20.0s |
| unlockforms | 4 | 0 | 0 | 3.3s |
| intake | 13 | 0 | 0 | 18.3s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT REPRODUCED | 6 linked check(s) passed, e.g. intake-forms/uk-AFPS-Form-17.pdf: accepted; intake-forms/uk-AFPS-Form-17.pdf: says restrictions were removed |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT REPRODUCED | 25 linked check(s) passed, e.g. redact-tracemonkey: black box covers the word on screen; redact-aws-invoice: black box covers the word on screen |
| 3 | Redact search misses phrases split across text items | NOT REPRODUCED | 4 linked check(s) passed, e.g. redact-find-split-uk-IPPH353: search finds a phrase split across text items; redact-find-split-uk-AFPS-Form-17: search finds a phrase split across text items |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | NOT TESTED | no corpus case |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT REPRODUCED | 10 linked check(s) passed, e.g. intake-forms/annotation-button-widget.pdf: accepted; intake-forms/annotation-choice-widget.pdf: accepted |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT REPRODUCED | 3 linked check(s) passed, e.g. c-forms-add-fw9-rot90: field box where drawn (60, 80) 200x22; c-forms-add-xfa-origin: field box where drawn (60, 80) 200x22 |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT REPRODUCED | 10 linked check(s) passed, e.g. c-forms-fill-zh: value stored in the field; c-forms-fill-zh-flat: flattened value extracts back (pdf.js) |
| 10 | OCR English only, assets from CDN (not offline) | NOT TESTED | no corpus case |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | NOT TESTED | no corpus case |
| 12 | Merge/split drop outlines, AcroForm, links | NOT REPRODUCED | 3 linked check(s) passed, e.g. merge-forms: form fields kept; merge-forms: field names unique |
| 13 | Crop rejects rotated, ignores box origin | NOT TESTED | no corpus case |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | NOT TESTED | no corpus case |
| 16 | PDF to Excel number parsing loses leading zeros / formats | NOT TESTED | no corpus case |
| 17 | PDF to PPT slides are flat images, fixed slide size | NOT TESTED | no corpus case |
| 18 | Office to PDF quick mode is screenshots (no text) | NOT TESTED | no corpus case |
| 19 | HiFi engine from unpinned CDN, font substitution | NOT TESTED | CDN pinning is a config review item; font fidelity not scored |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | CONFIRMED | forms-fill-xfa-imm1344e: found text fields to fill (0) |
| 22 | Protect: comma in password splits MuPDF options | NOT TESTED | no corpus case |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | NOT TESTED | no corpus case |
| 24 | Sign is visual only, one placement | NOT TESTED | feature gap (no PAdES / multi-place API to call) |
| 25 | Redact rasterizes whole pages (size balloons) | SOFT WARN | soft only, 28 linked check(s) passed; warn: redact-tracemonkey: size stays reasonable (<= 3x) (11.9x input); redact-rot90-cropbox: size stays reasonable (<= 3x) (10.9x input) (+1 more) |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT TESTED | no corpus case |
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

## Failures by tool

- **forms** (1): `forms-fill-xfa-imm1344e` found text fields to fill: 0

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| merge | irs-fw9.pdf + irs-f1040sa.pdf<br><sub>merge-forms</sub> | PASS | 7 pages, 89 KB | 26.0s, heap 8 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 11.9x size; warn: size stays reasonable (<= 3x) (11.9x input) | 11.2s, heap 19 MB |
| redact | aws-invoice.pdf<br><sub>redact-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 1.6s, heap 10 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.9x size; warn: size stays reasonable (<= 3x) (10.9x input) | 7.9s, heap 13 MB |
| redact | pdfjs-rotation.pdf<br><sub>redact-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 4.5x size; warn: size stays reasonable (<= 3x) (4.5x input) | 0.5s, heap 10 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>redact-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.6x size | 1.9s, heap 10 MB |
| redact | uk-IPPH353.pdf<br><sub>redact-find-split-uk-IPPH353</sub> | PASS |  | 0.4s, heap 10 MB |
| redact | uk-AFPS-Form-17.pdf<br><sub>redact-find-split-uk-AFPS-Form-17</sub> | PASS |  | 0.4s, heap 11 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.98x size, 396 ms | 1.9s, heap 24 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.12x size, 305 ms | 1.1s, heap 11 MB |
| redact | pdfjs-rotation.pdf<br><sub>g3-redact-remove-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 0.94x size, 4 ms | 0.1s, heap 20 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.00x size, 38 ms | 0.6s, heap 10 MB |
| redact | c-rot270-cropbox.pdf<br><sub>g3-redact-remove-rot270-cropbox</sub> | PASS | 16 boxes on 2 page(s), 1.07x size, 137 ms | 1.0s, heap 11 MB |
| redact | c-rot180-origin.pdf<br><sub>g3-redact-remove-rot180-origin</sub> | PASS | 16 boxes on 2 page(s), 1.07x size, 130 ms | 0.9s, heap 12 MB |
| redact | aws-invoice.pdf<br><sub>g3-redact-remove-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 39 ms | 0.5s, heap 12 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-image-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 10.88x size, 2893 ms | 6.5s, heap 24 MB |
| redact | flipkart-invoice.pdf<br><sub>g3-redact-remove-flipkart</sub> | PASS | 6 boxes on 1 page(s), 1.02x size, 21 ms | 0.5s, heap 12 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-image-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.96x size, 2606 ms | 5.8s, heap 13 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | PASS |  | 0.1s, heap 13 MB |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | PASS |  | 0.4s, heap 11 MB |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | PASS |  | 1.5s, heap 11 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 128 ms | 0.8s, heap 11 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.2s, heap 11 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-regex-budget-phones</sub> | PASS | 6 boxes, (202) 512-1530, (888) 293-6498, (202) 512-1800 | 3.1s, heap 19 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.3s, heap 11 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 0.7s, heap 11 MB |
| forms | irs-f1040.pdf<br><sub>forms-list-irs-f1040</sub> | PASS | 199 fields (199 widgets) in 191 ms, pdf.js 199, has XFA | 1.2s, heap 8 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 54 ms, pdf.js 23, has XFA | 0.1s, heap 13 MB |
| forms | irs-fw4.pdf<br><sub>forms-list-irs-fw4</sub> | PASS | 48 fields (48 widgets) in 207 ms, pdf.js 48, has XFA | 0.3s, heap 13 MB |
| forms | irs-f1040sa.pdf<br><sub>forms-list-irs-f1040sa</sub> | PASS | 33 fields (33 widgets) in 15 ms, pdf.js 33, has XFA | 0.1s, heap 14 MB |
| forms | uscis-i-9.pdf<br><sub>forms-list-uscis-i-9</sub> | PASS | 128 fields (130 widgets) in 122 ms, pdf.js 128 | 0.5s, heap 16 MB |
| forms | uscis-i-485.pdf<br><sub>forms-list-uscis-i-485</sub> | PASS | 730 fields (730 widgets) in 1811 ms, pdf.js 730, has XFA | 2.1s, heap 25 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-list-uk-IPPH353</sub> | PASS | 92 fields (92 widgets) in 238 ms, pdf.js 92 | 0.3s, heap 27 MB |
| forms | uk-AFPS-Form-17.pdf<br><sub>forms-list-uk-AFPS-Form-17</sub> | PASS | 24 fields (24 widgets) in 56 ms, pdf.js 24 | 0.1s, heap 37 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-list-xfa-imm1344e-filled</sub> | PASS | 1 fields (1 widgets) in 7 ms, pdf.js 1, has XFA | 0.4s, heap 42 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 2 ms, pdf.js 0, has XFA | 0.3s, heap 11 MB |
| forms | annotation-button-widget.pdf<br><sub>forms-list-annotation-button-widget</sub> | PASS | 6 fields (9 widgets) in 3 ms, pdf.js 6, has XFA | 0.1s, heap 11 MB |
| forms | annotation-choice-widget.pdf<br><sub>forms-list-annotation-choice-widget</sub> | PASS | 5 fields (5 widgets) in 4 ms, pdf.js 5, has XFA | 0.1s, heap 12 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-list-annotation-text-widget</sub> | PASS | 7 fields (7 widgets) in 4 ms, pdf.js 7, has XFA | 0.1s, heap 13 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 1.1s, heap 13 MB |
| forms | irs-fw9.pdf<br><sub>forms-fill-fw9</sub> | PASS | 3 filled | 0.2s, heap 21 MB |
| forms | uscis-i-9.pdf<br><sub>forms-fill-i9</sub> | PASS | 3 filled | 0.7s, heap 32 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-fill-xfa-imm1344e</sub> | FAIL | found text fields to fill: 0 | 0.1s, heap 27 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 0.9s, heap 31 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-fill-flatten-ipph353</sub> | PASS | 3 filled, flattened | 1.1s, heap 38 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-fill-flatten-text-widget</sub> | PASS | 3 filled, flattened | 0.1s, heap 32 MB |
| forms | uscis-i-485.pdf<br><sub>forms-flatten-i485</sub> | PASS | 730 fields flattened | 2.3s, heap 39 MB |
| forms | c-fw9-rot90.pdf<br><sub>c-forms-add-fw9-rot90</sub> | PASS |  | 0.7s, heap 28 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>c-forms-add-xfa-origin</sub> | PASS |  | 0.1s, heap 26 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-add-fw9</sub> | PASS |  | 0.2s, heap 29 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh</sub> | PASS |  | 0.3s, heap 36 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh-flat</sub> | PASS |  | 0.3s, heap 30 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar</sub> | PASS |  | 0.4s, heap 47 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar-flat</sub> | PASS |  | 0.2s, heap 42 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi</sub> | PASS |  | 0.5s, heap 37 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi-flat</sub> | PASS |  | 0.3s, heap 18 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja</sub> | PASS |  | 0.4s, heap 42 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja-flat</sub> | PASS |  | 0.4s, heap 35 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru</sub> | PASS |  | 0.5s, heap 28 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru-flat</sub> | PASS |  | 0.4s, heap 47 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-inspect-irs-fw9</sub> | PASS | 23 fields, 23 widgets, 39 ms | 0.1s, heap 48 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 1 ms | 0.1s, heap 51 MB |
| forms | uscis-i-9.pdf<br><sub>g3-forms-inspect-uscis-i-9</sub> | PASS | 128 fields, 130 widgets, 103 ms | 0.2s, heap 51 MB |
| forms | uscis-i-485.pdf<br><sub>g3-forms-inspect-uscis-i-485</sub> | PASS | 730 fields, 730 widgets, 1495 ms | 1.6s, heap 52 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 0.2s, heap 49 MB |
| forms | irs-f1040.pdf<br><sub>g3-forms-fill-xfa-irs-f1040-flat</sub> | PASS |  | 0.6s, heap 17 MB |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-fw9</sub> | PASS | run to result 687 ms: Unlocked 23 fields, 23 XFA locks. | 2.2s, heap 12 MB |
| unlockforms | uscis-i-9.pdf<br><sub>u5b-unlockforms-i9</sub> | PASS | run to result 99 ms: Unlocked 128 fields. | 0.6s, heap 12 MB |
| unlockforms | xfa-imm1344e-filled.pdf<br><sub>u5b-unlockforms-xfa</sub> | PASS | run to result 132 ms: Unlocked 1 field, 299 XFA locks. | 0.5s, heap 17 MB |
| unlockforms | xfa-issue14315.pdf<br><sub>u5b-unlockforms-xfa-nothing-locked</sub> | PASS | run to result 12 ms: No read-only fields, the file is unchanged. | 0.1s, heap 13 MB |
| intake | annotation-button-widget.pdf<br><sub>intake-forms/annotation-button-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 23.2 KB" | 0.6s |
| intake | annotation-choice-widget.pdf<br><sub>intake-forms/annotation-choice-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 89.4 KB" | 0.6s |
| intake | annotation-text-widget.pdf<br><sub>intake-forms/annotation-text-widget.pdf</sub> | PASS | expect accept (1 p): "1 page, 91.0 KB" | 0.6s |
| intake | irs-f1040.pdf<br><sub>intake-forms/irs-f1040.pdf</sub> | PASS | expect accept (2 p): "2 pages, 215.1 KB" | 0.9s |
| intake | irs-f1040sa.pdf<br><sub>intake-forms/irs-f1040sa.pdf</sub> | PASS | expect accept (1 p): "1 page, 77.2 KB" | 0.9s |
| intake | irs-fw4.pdf<br><sub>intake-forms/irs-fw4.pdf</sub> | PASS | expect accept (5 p): "5 pages, 204.0 KB" | 1.2s |
| intake | irs-fw9.pdf<br><sub>intake-forms/irs-fw9.pdf</sub> | PASS | expect accept (6 p): "6 pages, 137.5 KB" | 1.2s |
| intake | uk-AFPS-Form-17.pdf<br><sub>intake-forms/uk-AFPS-Form-17.pdf</sub> | PASS | expect accept (5 p), encrypted: "5 pages, 978.1 KB" (Restrictions removed so the file can be edited) | 1.8s |
| intake | uk-IPPH353.pdf<br><sub>intake-forms/uk-IPPH353.pdf</sub> | PASS | expect accept (4 p), encrypted: "4 pages, 1.58 MB" (Restrictions removed so the file can be edited) | 1.2s |
| intake | uscis-i-485.pdf<br><sub>intake-forms/uscis-i-485.pdf</sub> | PASS | expect accept (24 p), encrypted: "24 pages, 2.55 MB" (Restrictions removed so the file can be edited) | 2.2s |
| intake | uscis-i-9.pdf<br><sub>intake-forms/uscis-i-9.pdf</sub> | PASS | expect accept (4 p): "4 pages, 511.8 KB" | 2.2s |
| intake | xfa-imm1344e-filled.pdf<br><sub>intake-forms/xfa-imm1344e-filled.pdf</sub> | PASS | expect accept (1 p): "1 page, 2.88 MB" | 2.5s |
| intake | xfa-issue14315.pdf<br><sub>intake-forms/xfa-issue14315.pdf</sub> | PASS | expect accept (1 p): "1 page, 11.3 KB" | 2.5s |
