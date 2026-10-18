# Corpus scorecard: G3-tools

Run: 2026-10-17 19:17 UTC, 2.4 min. Command: `npm run test:corpus -- --tool redact,forms,pagenumbers,sign,crop,edit --shards 4 --name G3-tools`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **158 PASS, 1 FAIL, 0 SKIP** of 159 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| pagenumbers | 39 | 0 | 0 | 42.3s |
| sign | 16 | 0 | 0 | 17.7s |
| crop | 15 | 0 | 0 | 20.3s |
| edit | 29 | 0 | 0 | 23.8s |
| redact | 20 | 0 | 0 | 107.2s |
| forms | 39 | 1 | 0 | 54.8s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT TESTED | no corpus case |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT REPRODUCED | 21 linked check(s) passed, e.g. redact-tracemonkey: black box covers the word on screen; redact-aws-invoice: black box covers the word on screen |
| 3 | Redact search misses phrases split across text items | NOT REPRODUCED | 4 linked check(s) passed, e.g. redact-find-split-uk-IPPH353: search finds a phrase split across text items; redact-find-split-uk-AFPS-Form-17: search finds a phrase split across text items |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | NOT TESTED | no corpus case |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT TESTED | no corpus case |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT REPRODUCED | 109 linked check(s) passed, e.g. pagenumbers-tracemonkey: number visible on every page; pagenumbers-tracemonkey: number at bottom centre, upright |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT REPRODUCED | 29 linked check(s) passed, e.g. c-pagenumbers-text-zh: text extracts back (pdf.js); c-pagenumbers-text-ja: text extracts back (pdf.js) |
| 10 | OCR English only, assets from CDN (not offline) | NOT TESTED | no corpus case |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | NOT TESTED | no corpus case |
| 12 | Merge/split drop outlines, AcroForm, links | NOT TESTED | no corpus case |
| 13 | Crop rejects rotated, ignores box origin | CONFIRMED | c-crop-rot90-cropbox: content inside the box stays where it was seen (5 of 46 words off p3 "models" want (0.516, 0.210) got (0.516, 0.154); p3 "pre-trained" want (0.516, 0.357) got (0.516, 0.301); p3 "with" want (0.516, 0.565) got (0.516, 0.509)) |
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
| 24 | Sign is visual only, one placement | NOT REPRODUCED | 3 linked check(s) passed, e.g. g3-sign-multi-rot90: signature and initials on page 1; g3-sign-multi-rot90: initials on every page, where placed |
| 25 | Redact rasterizes whole pages (size balloons) | CONFIRMED | redact-tracemonkey: size stays reasonable (<= 3x) (5.5x input)<br>redact-rot90-cropbox: size stays reasonable (<= 3x) (11.4x input)<br>redact-rotation-quirk: size stays reasonable (<= 3x) (3.8x input) |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT TESTED | no corpus case |
| 27 | Compare by page index only; inserted page breaks the rest | NOT TESTED | no corpus case |
| 28 | HTML to PDF is a screenshot, head styles dropped | NOT TESTED | no corpus case |
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
| 42 | Self-test uses only synthetic fixtures | NOT TESTED | no corpus case |

## Failures by tool

- **forms** (1): `forms-fill-xfa-imm1344e` found text fields to fill: 0

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>pagenumbers-tracemonkey</sub> | PASS |  | 3.0s, heap 7 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>pagenumbers-rotation-quirk</sub> | PASS |  | 2.7s, heap 7 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>pagenumbers-rot90-cropbox</sub> | PASS |  | 3.0s, heap 7 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>pagenumbers-origin-shift</sub> | PASS |  | 0.1s, heap 12 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>pagenumbers-issue1155r-origin</sub> | PASS |  | 0.1s, heap 10 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>c-pagenumbers-rot90-cropbox-bottom-center</sub> | PASS |  | 0.3s, heap 10 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>c-pagenumbers-rot90-cropbox-top-right</sub> | PASS |  | 0.6s, heap 10 MB |
| pagenumbers | pdfjs-hello_world_rotated.pdf<br><sub>c-pagenumbers-hello-rot90-bottom-center</sub> | PASS |  | 0.2s, heap 11 MB |
| pagenumbers | pdfjs-hello_world_rotated.pdf<br><sub>c-pagenumbers-hello-rot90-top-right</sub> | PASS |  | 0.1s, heap 11 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>c-pagenumbers-rotation-quirk-bottom-center</sub> | PASS |  | 2.6s, heap 7 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>c-pagenumbers-rotation-quirk-top-right</sub> | PASS |  | 0.1s, heap 11 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>c-pagenumbers-issue1155r-crop-bottom-center</sub> | PASS |  | 0.1s, heap 11 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>c-pagenumbers-issue1155r-crop-top-right</sub> | PASS |  | 0.2s, heap 10 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>c-pagenumbers-origin-shift-bottom-center</sub> | PASS |  | 0.2s, heap 11 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>c-pagenumbers-origin-shift-top-right</sub> | PASS |  | 0.1s, heap 12 MB |
| pagenumbers | xfa-imm1344e-filled.pdf<br><sub>c-pagenumbers-xfa-origin-bottom-center</sub> | PASS |  | 0.9s, heap 10 MB |
| pagenumbers | xfa-imm1344e-filled.pdf<br><sub>c-pagenumbers-xfa-origin-top-right</sub> | PASS |  | 1.8s, heap 12 MB |
| pagenumbers | c-rot180-origin.pdf<br><sub>c-pagenumbers-c-rot180-origin-bottom-center</sub> | PASS |  | 0.4s, heap 14 MB |
| pagenumbers | c-rot180-origin.pdf<br><sub>c-pagenumbers-c-rot180-origin-top-right</sub> | PASS |  | 0.2s, heap 10 MB |
| pagenumbers | c-rot270-cropbox.pdf<br><sub>c-pagenumbers-c-rot270-cropbox-bottom-center</sub> | PASS |  | 0.1s, heap 9 MB |
| pagenumbers | c-rot270-cropbox.pdf<br><sub>c-pagenumbers-c-rot270-cropbox-top-right</sub> | PASS |  | 0.2s, heap 9 MB |
| pagenumbers | c-mixed.pdf<br><sub>c-pagenumbers-c-mixed-bottom-center</sub> | PASS |  | 0.2s, heap 10 MB |
| pagenumbers | c-mixed.pdf<br><sub>c-pagenumbers-c-mixed-top-right</sub> | PASS |  | 0.3s, heap 12 MB |
| pagenumbers | fax-jean-schmidt-doe.pdf<br><sub>c-pagenumbers-fax-mixed-bottom-center</sub> | PASS |  | 0.1s, heap 9 MB |
| pagenumbers | fax-jean-schmidt-doe.pdf<br><sub>c-pagenumbers-fax-mixed-top-right</sub> | PASS |  | 0.2s, heap 14 MB |
| pagenumbers | us-budget-2024.pdf<br><sub>c-pagenumbers-budget-mixed-rot-bottom-center</sub> | PASS |  | 6.6s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-zh</sub> | PASS |  | 1.1s, heap 10 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ja</sub> | PASS |  | 3.5s, heap 33 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ko</sub> | PASS |  | 0.4s, heap 11 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar</sub> | PASS |  | 5.7s, heap 14 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar-mixed</sub> | PASS |  | 0.7s, heap 46 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-he</sub> | PASS |  | 0.5s, heap 14 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-hi</sub> | PASS |  | 1.9s, heap 15 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ru</sub> | PASS |  | 0.6s, heap 24 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-mixed</sub> | PASS |  | 1.3s, heap 10 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-template-skip</sub> | PASS |  | 0.5s, heap 17 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-facing</sub> | PASS |  | 0.5s, heap 20 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>g3-pagenumbers-bates-rot90</sub> | PASS |  | 0.3s, heap 14 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-margin-big</sub> | PASS |  | 0.6s, heap 29 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 4.5s, heap 7 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 2.4s, heap 7 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | PASS | centre (0.50, 0.85) | 0.5s, heap 11 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>sign-origin-shift</sub> | PASS | centre (0.50, 0.85) | 4.3s, heap 7 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>sign-issue1155r-origin</sub> | PASS | centre (0.50, 0.85) | 0.9s, heap 7 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>c-sign-rot90-cropbox</sub> | PASS |  | 1.1s, heap 8 MB |
| sign | pdfjs-hello_world_rotated.pdf<br><sub>c-sign-hello-rot90</sub> | PASS |  | 0.2s, heap 8 MB |
| sign | pdfjs-rotation.pdf<br><sub>c-sign-rotation-quirk</sub> | PASS |  | 0.2s, heap 8 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>c-sign-issue1155r-crop</sub> | PASS |  | 0.1s, heap 9 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>c-sign-origin-shift</sub> | PASS |  | 0.2s, heap 8 MB |
| sign | xfa-imm1344e-filled.pdf<br><sub>c-sign-xfa-origin</sub> | PASS |  | 1.5s, heap 11 MB |
| sign | c-rot180-origin.pdf<br><sub>c-sign-c-rot180-origin</sub> | PASS |  | 0.3s, heap 10 MB |
| sign | c-rot270-cropbox.pdf<br><sub>c-sign-c-rot270-cropbox</sub> | PASS |  | 0.3s, heap 13 MB |
| sign | c-mixed.pdf<br><sub>c-sign-c-mixed</sub> | PASS |  | 0.5s, heap 8 MB |
| sign | fax-jean-schmidt-doe.pdf<br><sub>c-sign-fax-mixed</sub> | PASS |  | 0.2s, heap 9 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>g3-sign-multi-rot90</sub> | PASS |  | 0.4s, heap 11 MB |
| crop | pdfjs-tracemonkey.pdf<br><sub>crop-tracemonkey</sub> | PASS | CropBox 61,317,367,713 | 2.2s, heap 7 MB |
| crop | pdfjs-rotation.pdf<br><sub>crop-rotation-quirk</sub> | PASS | CropBox 61,317,367,713 | 0.1s, heap 9 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>crop-rot90-cropbox</sub> | PASS | CropBox 93,135,358,511 | 2.1s, heap 7 MB |
| crop | origin-shift-aws-invoice.pdf<br><sub>crop-origin-shift</sub> | PASS | CropBox 261,617,567,1013 | 1.5s, heap 7 MB |
| crop | pdfjs-issue1155r.pdf<br><sub>crop-issue1155r-origin</sub> | PASS | CropBox 60,337,357,758 | 7.0s, heap 7 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>c-crop-rot90-cropbox</sub> | PASS | 46 words checked; warn: content inside the box stays where it was seen (5 of 46 words off p3 "models" want (0.516, 0.210) got (0.516, 0.154); p3 "pre-trained" want (0.516, 0.357) got (0.516, 0.301); p3 "with" want (0.516, 0.565) got (0.516, 0.509)) | 0.6s, heap 8 MB |
| crop | pdfjs-hello_world_rotated.pdf<br><sub>c-crop-hello-rot90</sub> | PASS | 0 words checked | 0.1s, heap 10 MB |
| crop | pdfjs-rotation.pdf<br><sub>c-crop-rotation-quirk</sub> | PASS | 2 words checked | 0.7s, heap 8 MB |
| crop | pdfjs-issue1155r.pdf<br><sub>c-crop-issue1155r-crop</sub> | PASS | 0 words checked | 0.1s, heap 9 MB |
| crop | origin-shift-aws-invoice.pdf<br><sub>c-crop-origin-shift</sub> | PASS | 3 words checked | 0.1s, heap 10 MB |
| crop | xfa-imm1344e-filled.pdf<br><sub>c-crop-xfa-origin</sub> | PASS | 0 words checked | 2.1s, heap 10 MB |
| crop | c-rot180-origin.pdf<br><sub>c-crop-c-rot180-origin</sub> | PASS | 6 words checked | 0.2s, heap 9 MB |
| crop | c-rot270-cropbox.pdf<br><sub>c-crop-c-rot270-cropbox</sub> | PASS | 6 words checked | 0.3s, heap 9 MB |
| crop | c-mixed.pdf<br><sub>c-crop-c-mixed</sub> | PASS | 15 words checked | 3.1s, heap 8 MB |
| crop | fax-jean-schmidt-doe.pdf<br><sub>c-crop-fax-mixed</sub> | PASS | 6 words checked | 0.1s, heap 9 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>edit-tracemonkey</sub> | PASS |  | 2.0s, heap 7 MB |
| edit | pdfjs-rotation.pdf<br><sub>edit-rotation-quirk</sub> | PASS |  | 1.1s, heap 7 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>edit-rot90-cropbox</sub> | PASS |  | 1.9s, heap 7 MB |
| edit | origin-shift-aws-invoice.pdf<br><sub>edit-origin-shift</sub> | PASS |  | 1.7s, heap 7 MB |
| edit | pdfjs-issue1155r.pdf<br><sub>edit-issue1155r-origin</sub> | PASS |  | 0.1s, heap 10 MB |
| edit | udhr-chinese-simplified.pdf<br><sub>edit-cjk-text</sub> | PASS |  | 0.6s, heap 8 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>c-edit-rot90-cropbox-p1</sub> | PASS |  | 2.2s, heap 11 MB |
| edit | pdfjs-hello_world_rotated.pdf<br><sub>c-edit-hello-rot90-p1</sub> | PASS |  | 0.4s, heap 11 MB |
| edit | pdfjs-rotation.pdf<br><sub>c-edit-rotation-quirk-p1</sub> | PASS |  | 0.3s, heap 12 MB |
| edit | pdfjs-issue1155r.pdf<br><sub>c-edit-issue1155r-crop-p1</sub> | PASS |  | 0.9s, heap 8 MB |
| edit | origin-shift-aws-invoice.pdf<br><sub>c-edit-origin-shift-p1</sub> | PASS |  | 0.7s, heap 11 MB |
| edit | xfa-imm1344e-filled.pdf<br><sub>c-edit-xfa-origin-p1</sub> | PASS |  | 1.2s, heap 9 MB |
| edit | c-rot180-origin.pdf<br><sub>c-edit-c-rot180-origin-p1</sub> | PASS |  | 0.2s, heap 11 MB |
| edit | c-rot270-cropbox.pdf<br><sub>c-edit-c-rot270-cropbox-p1</sub> | PASS |  | 0.2s, heap 11 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p1</sub> | PASS |  | 0.4s, heap 13 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p2</sub> | PASS |  | 0.7s, heap 12 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p3</sub> | PASS |  | 0.4s, heap 9 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p4</sub> | PASS |  | 0.4s, heap 12 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p5</sub> | PASS |  | 0.3s, heap 15 MB |
| edit | fax-jean-schmidt-doe.pdf<br><sub>c-edit-fax-mixed-p1</sub> | PASS |  | 0.2s, heap 14 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-zh</sub> | PASS |  | 0.9s, heap 14 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ja</sub> | PASS |  | 0.9s, heap 14 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ko</sub> | PASS |  | 0.8s, heap 10 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar</sub> | PASS |  | 0.9s, heap 10 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar-mixed</sub> | PASS |  | 1.0s, heap 11 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-he</sub> | PASS |  | 0.7s, heap 16 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-hi</sub> | PASS |  | 0.8s, heap 16 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ru</sub> | PASS |  | 0.7s, heap 15 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-mixed</sub> | PASS |  | 1.2s, heap 14 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.5x size; warn: size stays reasonable (<= 3x) (5.5x input) | 20.3s, heap 15 MB |
| redact | aws-invoice.pdf<br><sub>redact-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 2.3x size | 10.0s, heap 9 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 11.4x size; warn: size stays reasonable (<= 3x) (11.4x input) | 23.7s, heap 18 MB |
| redact | pdfjs-rotation.pdf<br><sub>redact-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 3.8x size; warn: size stays reasonable (<= 3x) (3.8x input) | 5.1s, heap 10 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>redact-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 2.4x size | 3.9s, heap 11 MB |
| redact | uk-IPPH353.pdf<br><sub>redact-find-split-uk-IPPH353</sub> | PASS |  | 0.7s, heap 8 MB |
| redact | uk-AFPS-Form-17.pdf<br><sub>redact-find-split-uk-AFPS-Form-17</sub> | PASS |  | 1.2s, heap 10 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 0.98x size, 583 ms | 2.6s, heap 17 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 1.12x size, 1059 ms | 4.0s, heap 17 MB |
| redact | pdfjs-rotation.pdf<br><sub>g3-redact-remove-rotation-quirk</sub> | PASS | 1 boxes on 1 page(s), 0.94x size, 13 ms | 0.3s, heap 12 MB |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | PASS | 13 boxes on 1 page(s), 1.00x size, 49 ms | 0.7s, heap 9 MB |
| redact | c-rot270-cropbox.pdf<br><sub>g3-redact-remove-rot270-cropbox</sub> | PASS | 16 boxes on 2 page(s), 1.07x size, 213 ms | 0.9s, heap 9 MB |
| redact | c-rot180-origin.pdf<br><sub>g3-redact-remove-rot180-origin</sub> | PASS | 16 boxes on 2 page(s), 1.07x size, 154 ms | 3.0s, heap 10 MB |
| redact | aws-invoice.pdf<br><sub>g3-redact-remove-aws-invoice</sub> | PASS | 13 boxes on 1 page(s), 0.98x size, 104 ms | 2.4s, heap 10 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-image-rot90-cropbox</sub> | PASS | 59 boxes on 12 page(s), 11.42x size, 12023 ms | 18.5s, heap 16 MB |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | PASS | 3 boxes, 95 ms | 3.0s, heap 12 MB |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | PASS | 9 boxes: info@qualityhosting.de, +49 6051 916 44 10, +49 6051 916 44 29, 044 241 601 03 | 0.3s, heap 10 MB |
| redact | us-budget-2024.pdf<br><sub>g3-redact-regex-budget-phones</sub> | PASS | 6 boxes, (202) 512-1530, (888) 293-6498, (202) 512-1800 | 4.6s, heap 15 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | PASS |  | 0.9s, heap 9 MB |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | PASS |  | 1.0s, heap 12 MB |
| forms | irs-f1040.pdf<br><sub>forms-list-irs-f1040</sub> | PASS | 199 fields (199 widgets) in 244 ms, pdf.js 199, has XFA | 1.6s, heap 7 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 85 ms, pdf.js 23, has XFA | 1.4s, heap 7 MB |
| forms | irs-fw4.pdf<br><sub>forms-list-irs-fw4</sub> | PASS | 48 fields (48 widgets) in 247 ms, pdf.js 48, has XFA | 1.8s, heap 7 MB |
| forms | irs-f1040sa.pdf<br><sub>forms-list-irs-f1040sa</sub> | PASS | 33 fields (33 widgets) in 26 ms, pdf.js 33, has XFA | 0.3s, heap 10 MB |
| forms | uscis-i-9.pdf<br><sub>forms-list-uscis-i-9</sub> | PASS | 128 fields (130 widgets) in 105 ms, pdf.js 128 | 1.4s, heap 8 MB |
| forms | uscis-i-485.pdf<br><sub>forms-list-uscis-i-485</sub> | PASS | 730 fields (730 widgets) in 2058 ms, pdf.js 730, has XFA | 2.3s, heap 38 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-list-uk-IPPH353</sub> | PASS | 92 fields (92 widgets) in 1105 ms, pdf.js 92 | 1.3s, heap 12 MB |
| forms | uk-AFPS-Form-17.pdf<br><sub>forms-list-uk-AFPS-Form-17</sub> | PASS | 24 fields (24 widgets) in 618 ms, pdf.js 24 | 0.8s, heap 12 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-list-xfa-imm1344e-filled</sub> | PASS | 1 fields (1 widgets) in 17 ms, pdf.js 1, has XFA | 3.1s, heap 12 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 3 ms, pdf.js 0, has XFA | 0.1s, heap 46 MB |
| forms | annotation-button-widget.pdf<br><sub>forms-list-annotation-button-widget</sub> | PASS | 6 fields (9 widgets) in 8 ms, pdf.js 6, has XFA | 0.2s, heap 13 MB |
| forms | annotation-choice-widget.pdf<br><sub>forms-list-annotation-choice-widget</sub> | PASS | 5 fields (5 widgets) in 9 ms, pdf.js 5, has XFA | 0.2s, heap 9 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-list-annotation-text-widget</sub> | PASS | 7 fields (7 widgets) in 8 ms, pdf.js 7, has XFA | 0.1s, heap 12 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 1.7s, heap 13 MB |
| forms | irs-fw9.pdf<br><sub>forms-fill-fw9</sub> | PASS | 3 filled | 0.7s, heap 10 MB |
| forms | uscis-i-9.pdf<br><sub>forms-fill-i9</sub> | PASS | 3 filled | 3.1s, heap 49 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-fill-xfa-imm1344e</sub> | FAIL | found text fields to fill: 0 | 0.9s, heap 26 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 1.4s, heap 15 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-fill-flatten-ipph353</sub> | PASS | 3 filled, flattened | 4.4s, heap 20 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-fill-flatten-text-widget</sub> | PASS | 3 filled, flattened | 1.1s, heap 16 MB |
| forms | uscis-i-485.pdf<br><sub>forms-flatten-i485</sub> | PASS | 730 fields flattened | 5.4s, heap 31 MB |
| forms | c-fw9-rot90.pdf<br><sub>c-forms-add-fw9-rot90</sub> | PASS |  | 0.6s, heap 31 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>c-forms-add-xfa-origin</sub> | PASS |  | 1.5s, heap 34 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-add-fw9</sub> | PASS |  | 0.7s, heap 23 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh</sub> | PASS |  | 3.4s, heap 18 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh-flat</sub> | PASS |  | 1.1s, heap 42 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar</sub> | PASS |  | 0.6s, heap 12 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar-flat</sub> | PASS |  | 0.4s, heap 13 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi</sub> | PASS |  | 1.2s, heap 26 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi-flat</sub> | PASS |  | 0.9s, heap 36 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja</sub> | PASS |  | 0.5s, heap 29 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja-flat</sub> | PASS |  | 0.5s, heap 18 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru</sub> | PASS |  | 1.1s, heap 18 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru-flat</sub> | PASS |  | 0.7s, heap 34 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-inspect-irs-fw9</sub> | PASS | 23 fields, 23 widgets, 62 ms | 0.1s, heap 35 MB |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | PASS | 0 fields, 0 widgets, 2 ms | 0.1s, heap 13 MB |
| forms | uscis-i-9.pdf<br><sub>g3-forms-inspect-uscis-i-9</sub> | PASS | 128 fields, 130 widgets, 174 ms | 2.6s, heap 28 MB |
| forms | uscis-i-485.pdf<br><sub>g3-forms-inspect-uscis-i-485</sub> | PASS | 730 fields, 730 widgets, 1860 ms | 2.3s, heap 26 MB |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | PASS |  | 1.7s, heap 40 MB |
| forms | irs-f1040.pdf<br><sub>g3-forms-fill-xfa-irs-f1040-flat</sub> | PASS |  | 1.1s, heap 44 MB |
