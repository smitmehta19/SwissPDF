# Corpus scorecard: c-final

Run: 2026-10-17 16:54 UTC, 4.8 min. Command: `npm run test:corpus -- --layer ops --tool watermark,pagenumbers,sign,crop,edit,forms --name c-final`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **180 PASS, 6 FAIL, 0 SKIP** of 186 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| watermark | 58 | 0 | 0 | 68.3s |
| pagenumbers | 35 | 0 | 0 | 40.1s |
| sign | 15 | 0 | 0 | 16.0s |
| crop | 15 | 0 | 0 | 15.7s |
| edit | 29 | 0 | 0 | 29.9s |
| forms | 28 | 6 | 0 | 34.9s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | CONFIRMED | forms-list-uscis-i-485: error: This PDF is password-protected - unlock it first.<br>forms-flatten-i485: error: This PDF is password-protected - unlock it first. |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT TESTED | no corpus case |
| 3 | Redact search misses phrases split across text items | NOT TESTED | no corpus case |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no corpus case |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | NOT TESTED | no corpus case |
| 7 | pdf-lib intake rejects damaged files viewers open | CONFIRMED | forms-list-uk-IPPH353: error: Expected instance of PDFDict2, but got instance of undefined<br>forms-list-uk-AFPS-Form-17: error: Expected instance of PDFDict2, but got instance of undefined<br>forms-fill-flatten-ipph353: error: Expected instance of PDFDict2, but got instance of undefined |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT REPRODUCED | 153 linked check(s) passed, e.g. watermark-tracemonkey: mark inside the visible page; watermark-rotation-quirk: mark inside the visible page |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT REPRODUCED | 39 linked check(s) passed, e.g. watermark-cyrillic: non-Latin mark present; c-watermark-text-zh: text extracts back (pdf.js) |
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
| 24 | Sign is visual only, one placement | NOT TESTED | feature gap (no PAdES / multi-place API to call) |
| 25 | Redact rasterizes whole pages (size balloons) | NOT TESTED | no corpus case |
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

- **forms** (6): `forms-list-uscis-i-485` error: This PDF is password-protected - unlock it first.; `forms-list-uk-IPPH353` error: Expected instance of PDFDict2, but got instance of undefined; `forms-list-uk-AFPS-Form-17` error: Expected instance of PDFDict2, but got instance of undefined; `forms-fill-xfa-imm1344e` found text fields to fill: 0; `forms-fill-flatten-ipph353` error: Expected instance of PDFDict2, but got instance of undefined; `forms-flatten-i485` error: This PDF is password-protected - unlock it first.

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-tracemonkey</sub> | PASS | 14 marks | 2.8s, heap 6 MB |
| watermark | pdfjs-rotation.pdf<br><sub>watermark-rotation-quirk</sub> | PASS | 2 marks | 1.0s, heap 8 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>watermark-rot90-cropbox</sub> | PASS | 16 marks | 1.0s, heap 9 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>watermark-origin-shift</sub> | PASS | 1 marks | 2.3s, heap 10 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>watermark-issue1155r-origin</sub> | PASS | 1 marks | 1.0s, heap 10 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-cyrillic</sub> | PASS |  | 1.0s, heap 10 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-0</sub> | PASS | 16 marks | 1.0s, heap 16 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-45</sub> | PASS | 16 marks | 1.0s, heap 11 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-90</sub> | PASS | 16 marks | 1.0s, heap 17 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox--30</sub> | PASS | 16 marks | 1.0s, heap 11 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-0</sub> | PASS | 5 marks | 1.0s, heap 17 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-45</sub> | PASS | 5 marks | 1.0s, heap 17 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90-90</sub> | PASS | 5 marks | 1.0s, heap 17 MB |
| watermark | pdfjs-hello_world_rotated.pdf<br><sub>c-watermark-hello-rot90--30</sub> | PASS | 5 marks | 1.0s, heap 10 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-0</sub> | PASS | 2 marks | 1.2s, heap 10 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-45</sub> | PASS | 2 marks | 1.0s, heap 11 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk-90</sub> | PASS | 2 marks | 1.0s, heap 11 MB |
| watermark | pdfjs-rotation.pdf<br><sub>c-watermark-rotation-quirk--30</sub> | PASS | 2 marks | 1.0s, heap 11 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-0</sub> | PASS | 1 marks | 1.0s, heap 11 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-45</sub> | PASS | 1 marks | 1.0s, heap 12 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop-90</sub> | PASS | 1 marks | 1.0s, heap 10 MB |
| watermark | pdfjs-issue1155r.pdf<br><sub>c-watermark-issue1155r-crop--30</sub> | PASS | 1 marks | 1.0s, heap 10 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-0</sub> | PASS | 1 marks | 1.0s, heap 10 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-45</sub> | PASS | 1 marks | 1.0s, heap 11 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift-90</sub> | PASS | 1 marks | 1.0s, heap 10 MB |
| watermark | origin-shift-aws-invoice.pdf<br><sub>c-watermark-origin-shift--30</sub> | PASS | 1 marks | 1.0s, heap 11 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-0</sub> | PASS | 1 marks | 1.0s, heap 8 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-45</sub> | PASS | 1 marks | 1.0s, heap 9 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin-90</sub> | PASS | 1 marks | 1.0s, heap 9 MB |
| watermark | xfa-imm1344e-filled.pdf<br><sub>c-watermark-xfa-origin--30</sub> | PASS | 1 marks | 1.0s, heap 9 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-0</sub> | PASS | 2 marks | 1.0s, heap 9 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-45</sub> | PASS | 2 marks | 1.0s, heap 10 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-90</sub> | PASS | 2 marks | 1.0s, heap 10 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin--30</sub> | PASS | 2 marks | 1.0s, heap 10 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-0</sub> | PASS | 2 marks | 1.0s, heap 10 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-45</sub> | PASS | 2 marks | 1.0s, heap 11 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox-90</sub> | PASS | 2 marks | 1.0s, heap 9 MB |
| watermark | c-rot270-cropbox.pdf<br><sub>c-watermark-c-rot270-cropbox--30</sub> | PASS | 2 marks | 1.0s, heap 10 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-0</sub> | PASS | 5 marks | 1.0s, heap 11 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-45</sub> | PASS | 5 marks | 1.0s, heap 9 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-90</sub> | PASS | 5 marks | 1.0s, heap 10 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed--30</sub> | PASS | 5 marks | 1.0s, heap 12 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-0</sub> | PASS | 2 marks | 1.0s, heap 9 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-45</sub> | PASS | 2 marks | 1.0s, heap 9 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed-90</sub> | PASS | 2 marks | 1.0s, heap 9 MB |
| watermark | fax-jean-schmidt-doe.pdf<br><sub>c-watermark-fax-mixed--30</sub> | PASS | 2 marks | 1.0s, heap 10 MB |
| watermark | us-budget-2024.pdf<br><sub>c-watermark-budget-mixed-rot-45</sub> | PASS | 40 marks | 4.2s, heap 32 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-tile-c-mixed</sub> | PASS |  | 1.0s, heap 47 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-tile-rot90-cropbox</sub> | PASS |  | 1.0s, heap 50 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-zh</sub> | PASS |  | 1.0s, heap 20 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ja</sub> | PASS |  | 2.2s, heap 28 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ko</sub> | PASS |  | 1.0s, heap 14 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar</sub> | PASS |  | 1.0s, heap 22 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ar-mixed</sub> | PASS |  | 1.0s, heap 33 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-he</sub> | PASS |  | 1.0s, heap 18 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-hi</sub> | PASS |  | 1.1s, heap 14 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-ru</sub> | PASS |  | 1.0s, heap 15 MB |
| watermark | pdfjs-tracemonkey.pdf<br><sub>c-watermark-text-mixed</sub> | PASS |  | 2.1s, heap 32 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>pagenumbers-tracemonkey</sub> | PASS |  | 1.6s, heap 6 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>pagenumbers-rotation-quirk</sub> | PASS |  | 1.0s, heap 8 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>pagenumbers-rot90-cropbox</sub> | PASS |  | 1.0s, heap 9 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>pagenumbers-origin-shift</sub> | PASS |  | 1.0s, heap 10 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>pagenumbers-issue1155r-origin</sub> | PASS |  | 1.0s, heap 10 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>c-pagenumbers-rot90-cropbox-bottom-center</sub> | PASS |  | 1.0s, heap 10 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>c-pagenumbers-rot90-cropbox-top-right</sub> | PASS |  | 1.0s, heap 12 MB |
| pagenumbers | pdfjs-hello_world_rotated.pdf<br><sub>c-pagenumbers-hello-rot90-bottom-center</sub> | PASS |  | 1.0s, heap 12 MB |
| pagenumbers | pdfjs-hello_world_rotated.pdf<br><sub>c-pagenumbers-hello-rot90-top-right</sub> | PASS |  | 1.0s, heap 12 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>c-pagenumbers-rotation-quirk-bottom-center</sub> | PASS |  | 1.0s, heap 12 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>c-pagenumbers-rotation-quirk-top-right</sub> | PASS |  | 1.1s, heap 13 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>c-pagenumbers-issue1155r-crop-bottom-center</sub> | PASS |  | 1.0s, heap 13 MB |
| pagenumbers | pdfjs-issue1155r.pdf<br><sub>c-pagenumbers-issue1155r-crop-top-right</sub> | PASS |  | 1.0s, heap 13 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>c-pagenumbers-origin-shift-bottom-center</sub> | PASS |  | 1.0s, heap 13 MB |
| pagenumbers | origin-shift-aws-invoice.pdf<br><sub>c-pagenumbers-origin-shift-top-right</sub> | PASS |  | 1.1s, heap 13 MB |
| pagenumbers | xfa-imm1344e-filled.pdf<br><sub>c-pagenumbers-xfa-origin-bottom-center</sub> | PASS |  | 1.1s, heap 12 MB |
| pagenumbers | xfa-imm1344e-filled.pdf<br><sub>c-pagenumbers-xfa-origin-top-right</sub> | PASS |  | 1.1s, heap 13 MB |
| pagenumbers | c-rot180-origin.pdf<br><sub>c-pagenumbers-c-rot180-origin-bottom-center</sub> | PASS |  | 1.1s, heap 6 MB |
| pagenumbers | c-rot180-origin.pdf<br><sub>c-pagenumbers-c-rot180-origin-top-right</sub> | PASS |  | 1.0s, heap 7 MB |
| pagenumbers | c-rot270-cropbox.pdf<br><sub>c-pagenumbers-c-rot270-cropbox-bottom-center</sub> | PASS |  | 1.1s, heap 7 MB |
| pagenumbers | c-rot270-cropbox.pdf<br><sub>c-pagenumbers-c-rot270-cropbox-top-right</sub> | PASS |  | 1.1s, heap 8 MB |
| pagenumbers | c-mixed.pdf<br><sub>c-pagenumbers-c-mixed-bottom-center</sub> | PASS |  | 1.0s, heap 7 MB |
| pagenumbers | c-mixed.pdf<br><sub>c-pagenumbers-c-mixed-top-right</sub> | PASS |  | 1.0s, heap 7 MB |
| pagenumbers | fax-jean-schmidt-doe.pdf<br><sub>c-pagenumbers-fax-mixed-bottom-center</sub> | PASS |  | 1.0s, heap 7 MB |
| pagenumbers | fax-jean-schmidt-doe.pdf<br><sub>c-pagenumbers-fax-mixed-top-right</sub> | PASS |  | 1.0s, heap 7 MB |
| pagenumbers | us-budget-2024.pdf<br><sub>c-pagenumbers-budget-mixed-rot-bottom-center</sub> | PASS |  | 4.3s, heap 33 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-zh</sub> | PASS |  | 1.0s, heap 45 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ja</sub> | PASS |  | 1.0s, heap 36 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ko</sub> | PASS |  | 1.0s, heap 45 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar</sub> | PASS |  | 1.0s, heap 13 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ar-mixed</sub> | PASS |  | 1.0s, heap 14 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-he</sub> | PASS |  | 1.0s, heap 18 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-hi</sub> | PASS |  | 1.0s, heap 17 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-ru</sub> | PASS |  | 1.0s, heap 24 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>c-pagenumbers-text-mixed</sub> | PASS |  | 1.0s, heap 26 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 1.6s, heap 6 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 1.0s, heap 9 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | PASS | centre (0.50, 0.85) | 1.0s, heap 10 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>sign-origin-shift</sub> | PASS | centre (0.50, 0.85) | 1.0s, heap 9 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>sign-issue1155r-origin</sub> | PASS | centre (0.50, 0.85) | 1.0s, heap 10 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>c-sign-rot90-cropbox</sub> | PASS |  | 1.0s, heap 10 MB |
| sign | pdfjs-hello_world_rotated.pdf<br><sub>c-sign-hello-rot90</sub> | PASS |  | 1.0s, heap 13 MB |
| sign | pdfjs-rotation.pdf<br><sub>c-sign-rotation-quirk</sub> | PASS |  | 1.0s, heap 13 MB |
| sign | pdfjs-issue1155r.pdf<br><sub>c-sign-issue1155r-crop</sub> | PASS |  | 1.0s, heap 11 MB |
| sign | origin-shift-aws-invoice.pdf<br><sub>c-sign-origin-shift</sub> | PASS |  | 1.0s, heap 11 MB |
| sign | xfa-imm1344e-filled.pdf<br><sub>c-sign-xfa-origin</sub> | PASS |  | 1.0s, heap 11 MB |
| sign | c-rot180-origin.pdf<br><sub>c-sign-c-rot180-origin</sub> | PASS |  | 1.0s, heap 13 MB |
| sign | c-rot270-cropbox.pdf<br><sub>c-sign-c-rot270-cropbox</sub> | PASS |  | 1.0s, heap 7 MB |
| sign | c-mixed.pdf<br><sub>c-sign-c-mixed</sub> | PASS |  | 1.0s, heap 8 MB |
| sign | fax-jean-schmidt-doe.pdf<br><sub>c-sign-fax-mixed</sub> | PASS |  | 1.0s, heap 9 MB |
| crop | pdfjs-tracemonkey.pdf<br><sub>crop-tracemonkey</sub> | PASS | CropBox 61,317,367,713 | 1.3s, heap 6 MB |
| crop | pdfjs-rotation.pdf<br><sub>crop-rotation-quirk</sub> | PASS | CropBox 61,317,367,713 | 1.0s, heap 9 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>crop-rot90-cropbox</sub> | PASS | CropBox 93,135,358,511 | 1.0s, heap 10 MB |
| crop | origin-shift-aws-invoice.pdf<br><sub>crop-origin-shift</sub> | PASS | CropBox 261,617,567,1013 | 1.0s, heap 9 MB |
| crop | pdfjs-issue1155r.pdf<br><sub>crop-issue1155r-origin</sub> | PASS | CropBox 60,337,357,758 | 1.0s, heap 10 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>c-crop-rot90-cropbox</sub> | PASS | 46 words checked; warn: content inside the box stays where it was seen (5 of 46 words off p3 "models" want (0.516, 0.210) got (0.516, 0.154); p3 "pre-trained" want (0.516, 0.357) got (0.516, 0.301); p3 "with" want (0.516, 0.565) got (0.516, 0.509)) | 1.0s, heap 10 MB |
| crop | pdfjs-hello_world_rotated.pdf<br><sub>c-crop-hello-rot90</sub> | PASS | 0 words checked | 1.0s, heap 12 MB |
| crop | pdfjs-rotation.pdf<br><sub>c-crop-rotation-quirk</sub> | PASS | 2 words checked | 1.0s, heap 10 MB |
| crop | pdfjs-issue1155r.pdf<br><sub>c-crop-issue1155r-crop</sub> | PASS | 0 words checked | 1.0s, heap 10 MB |
| crop | origin-shift-aws-invoice.pdf<br><sub>c-crop-origin-shift</sub> | PASS | 3 words checked | 1.0s, heap 10 MB |
| crop | xfa-imm1344e-filled.pdf<br><sub>c-crop-xfa-origin</sub> | PASS | 0 words checked | 1.0s, heap 11 MB |
| crop | c-rot180-origin.pdf<br><sub>c-crop-c-rot180-origin</sub> | PASS | 6 words checked | 1.0s, heap 13 MB |
| crop | c-rot270-cropbox.pdf<br><sub>c-crop-c-rot270-cropbox</sub> | PASS | 6 words checked | 1.0s, heap 11 MB |
| crop | c-mixed.pdf<br><sub>c-crop-c-mixed</sub> | PASS | 15 words checked | 1.0s, heap 12 MB |
| crop | fax-jean-schmidt-doe.pdf<br><sub>c-crop-fax-mixed</sub> | PASS | 6 words checked | 1.0s, heap 13 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>edit-tracemonkey</sub> | PASS |  | 1.4s, heap 6 MB |
| edit | pdfjs-rotation.pdf<br><sub>edit-rotation-quirk</sub> | PASS |  | 1.0s, heap 8 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>edit-rot90-cropbox</sub> | PASS |  | 1.0s, heap 9 MB |
| edit | origin-shift-aws-invoice.pdf<br><sub>edit-origin-shift</sub> | PASS |  | 1.0s, heap 10 MB |
| edit | pdfjs-issue1155r.pdf<br><sub>edit-issue1155r-origin</sub> | PASS |  | 1.0s, heap 10 MB |
| edit | udhr-chinese-simplified.pdf<br><sub>edit-cjk-text</sub> | PASS |  | 1.0s, heap 10 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>c-edit-rot90-cropbox-p1</sub> | PASS |  | 1.0s, heap 17 MB |
| edit | pdfjs-hello_world_rotated.pdf<br><sub>c-edit-hello-rot90-p1</sub> | PASS |  | 1.0s, heap 17 MB |
| edit | pdfjs-rotation.pdf<br><sub>c-edit-rotation-quirk-p1</sub> | PASS |  | 1.0s, heap 18 MB |
| edit | pdfjs-issue1155r.pdf<br><sub>c-edit-issue1155r-crop-p1</sub> | PASS |  | 1.0s, heap 9 MB |
| edit | origin-shift-aws-invoice.pdf<br><sub>c-edit-origin-shift-p1</sub> | PASS |  | 1.0s, heap 9 MB |
| edit | xfa-imm1344e-filled.pdf<br><sub>c-edit-xfa-origin-p1</sub> | PASS |  | 1.0s, heap 10 MB |
| edit | c-rot180-origin.pdf<br><sub>c-edit-c-rot180-origin-p1</sub> | PASS |  | 1.0s, heap 12 MB |
| edit | c-rot270-cropbox.pdf<br><sub>c-edit-c-rot270-cropbox-p1</sub> | PASS |  | 1.0s, heap 13 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p1</sub> | PASS |  | 1.0s, heap 15 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p2</sub> | PASS |  | 1.0s, heap 9 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p3</sub> | PASS |  | 1.0s, heap 11 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p4</sub> | PASS |  | 1.0s, heap 12 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p5</sub> | PASS |  | 1.0s, heap 14 MB |
| edit | fax-jean-schmidt-doe.pdf<br><sub>c-edit-fax-mixed-p1</sub> | PASS |  | 1.0s, heap 15 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-zh</sub> | PASS |  | 1.0s, heap 9 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ja</sub> | PASS |  | 1.0s, heap 10 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ko</sub> | PASS |  | 1.0s, heap 10 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar</sub> | PASS |  | 1.0s, heap 10 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ar-mixed</sub> | PASS |  | 1.0s, heap 10 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-he</sub> | PASS |  | 1.0s, heap 18 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-hi</sub> | PASS |  | 1.0s, heap 11 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-ru</sub> | PASS |  | 1.0s, heap 11 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>c-edit-text-mixed</sub> | PASS |  | 1.0s, heap 22 MB |
| forms | irs-f1040.pdf<br><sub>forms-list-irs-f1040</sub> | PASS | 199 fields (199 widgets) in 143 ms, pdf.js 199, has XFA | 1.3s, heap 6 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 45 ms, pdf.js 23, has XFA | 1.0s, heap 10 MB |
| forms | irs-fw4.pdf<br><sub>forms-list-irs-fw4</sub> | PASS | 48 fields (48 widgets) in 200 ms, pdf.js 48, has XFA | 1.0s, heap 10 MB |
| forms | irs-f1040sa.pdf<br><sub>forms-list-irs-f1040sa</sub> | PASS | 33 fields (33 widgets) in 15 ms, pdf.js 33, has XFA | 1.0s, heap 15 MB |
| forms | uscis-i-9.pdf<br><sub>forms-list-uscis-i-9</sub> | PASS | 128 fields (130 widgets) in 96 ms, pdf.js 128 | 1.0s, heap 12 MB |
| forms | uscis-i-485.pdf<br><sub>forms-list-uscis-i-485</sub> | FAIL | error: This PDF is password-protected - unlock it first. | 1.0s |
| forms | uk-IPPH353.pdf<br><sub>forms-list-uk-IPPH353</sub> | FAIL | error: Expected instance of PDFDict2, but got instance of undefined | 1.0s |
| forms | uk-AFPS-Form-17.pdf<br><sub>forms-list-uk-AFPS-Form-17</sub> | FAIL | error: Expected instance of PDFDict2, but got instance of undefined | 1.0s |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-list-xfa-imm1344e-filled</sub> | PASS | 1 fields (1 widgets) in 5 ms, pdf.js 1, has XFA | 1.0s, heap 24 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 1 ms, pdf.js 0, has XFA | 1.0s, heap 25 MB |
| forms | annotation-button-widget.pdf<br><sub>forms-list-annotation-button-widget</sub> | PASS | 6 fields (9 widgets) in 4 ms, pdf.js 6, has XFA | 1.0s, heap 25 MB |
| forms | annotation-choice-widget.pdf<br><sub>forms-list-annotation-choice-widget</sub> | PASS | 5 fields (5 widgets) in 2 ms, pdf.js 5, has XFA | 1.0s, heap 26 MB |
| forms | annotation-text-widget.pdf<br><sub>forms-list-annotation-text-widget</sub> | PASS | 7 fields (7 widgets) in 5 ms, pdf.js 7, has XFA | 1.0s, heap 27 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 1.0s, heap 7 MB |
| forms | irs-fw9.pdf<br><sub>forms-fill-fw9</sub> | PASS | 3 filled | 1.0s, heap 17 MB |
| forms | uscis-i-9.pdf<br><sub>forms-fill-i9</sub> | PASS | 3 filled | 1.0s, heap 20 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>forms-fill-xfa-imm1344e</sub> | FAIL | found text fields to fill: 0 | 1.0s, heap 30 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 1.0s, heap 8 MB |
| forms | uk-IPPH353.pdf<br><sub>forms-fill-flatten-ipph353</sub> | FAIL | error: Expected instance of PDFDict2, but got instance of undefined | 1.0s |
| forms | annotation-text-widget.pdf<br><sub>forms-fill-flatten-text-widget</sub> | PASS | 3 filled, flattened | 1.0s, heap 13 MB |
| forms | uscis-i-485.pdf<br><sub>forms-flatten-i485</sub> | FAIL | error: This PDF is password-protected - unlock it first. | 1.0s |
| forms | c-fw9-rot90.pdf<br><sub>c-forms-add-fw9-rot90</sub> | PASS |  | 1.0s, heap 26 MB |
| forms | xfa-imm1344e-filled.pdf<br><sub>c-forms-add-xfa-origin</sub> | PASS |  | 1.0s, heap 38 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-add-fw9</sub> | PASS |  | 1.0s, heap 10 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh</sub> | PASS |  | 1.0s, heap 18 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-zh-flat</sub> | PASS |  | 1.0s, heap 33 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar</sub> | PASS |  | 1.0s, heap 13 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ar-flat</sub> | PASS |  | 1.0s, heap 29 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi</sub> | PASS |  | 1.0s, heap 22 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-hi-flat</sub> | PASS |  | 1.0s, heap 12 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja</sub> | PASS |  | 1.0s, heap 15 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ja-flat</sub> | PASS |  | 1.0s, heap 12 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru</sub> | PASS |  | 1.0s, heap 27 MB |
| forms | irs-fw9.pdf<br><sub>c-forms-fill-ru-flat</sub> | PASS |  | 1.0s, heap 19 MB |
