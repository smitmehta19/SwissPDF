# Corpus scorecard: G1-tools

Run: 2026-10-17 20:08 UTC, 1 min. Command: `npm run test:corpus -- --tool split,extract,remove,organize,rotate,merge --shards 4 --name G1-tools`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **27 PASS, 0 FAIL, 0 SKIP** of 27 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| merge | 9 | 0 | 0 | 27.0s |
| split | 8 | 0 | 0 | 58.7s |
| extract | 3 | 0 | 0 | 4.2s |
| remove | 2 | 0 | 0 | 5.0s |
| rotate | 3 | 0 | 0 | 3.5s |
| organize | 2 | 0 | 0 | 2.4s |


## Delta vs U2a

Baseline: 91 PASS, 5 FAIL, 0 SKIP of 96. This run: 27 PASS, 0 FAIL, 0 SKIP of 27.
Same rows: 12. FAIL->PASS: 0. PASS->FAIL: 0. Still failing: 0. New rows: 15 (15 pass, 0 fail). Rows gone: 84.

### PASS->FAIL (regressions): 0

None.

### FAIL->PASS: 0


### Still failing, by owning unit: 0

Unit from the audit finding of the first failing check, else from the tool. New = row not in the baseline.


## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT REPRODUCED | 1 linked check(s) passed, e.g. merge-owner-only: passed |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT TESTED | no corpus case |
| 3 | Redact search misses phrases split across text items | NOT TESTED | no corpus case |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | NOT TESTED | no corpus case |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT REPRODUCED | 1 linked check(s) passed, e.g. merge-damaged-xref: passed |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT TESTED | no corpus case |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT TESTED | no corpus case |
| 10 | OCR English only, assets from CDN (not offline) | NOT TESTED | no corpus case |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | NOT TESTED | no corpus case |
| 12 | Merge/split drop outlines, AcroForm, links | NOT REPRODUCED | 6 linked check(s) passed, e.g. merge-outlines: bookmarks kept; merge-forms: form fields kept |
| 13 | Crop rejects rotated, ignores box origin | NOT TESTED | no corpus case |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | NOT TESTED | no corpus case |
| 16 | PDF to Excel number parsing loses leading zeros / formats | NOT TESTED | no corpus case |
| 17 | PDF to PPT slides are flat images, fixed slide size | NOT TESTED | no corpus case |
| 18 | Office to PDF quick mode is screenshots (no text) | NOT TESTED | no corpus case |
| 19 | HiFi engine from unpinned CDN, font substitution | NOT TESTED | CDN pinning is a config review item; font fidelity not scored |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | NOT TESTED | no corpus case |
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

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf + arxiv-1512.03385-resnet.pdf<br><sub>merge-reports</sub> | PASS | 42 pages, 2.2 MB | 3.8s, heap 14 MB |
| merge | pdfjs-rotation.pdf + pdfjs-hello_world_rotated.pdf + rot90-cropbox-bert.pdf<br><sub>merge-rotated</sub> | PASS | 23 pages, 648 KB | 2.8s, heap 7 MB |
| merge | pdfjs-nested_outline.pdf + us-budget-2024.pdf<br><sub>merge-outlines</sub> | PASS | 193 pages, 1.9 MB | 3.0s, heap 37 MB |
| merge | irs-fw9.pdf + irs-f1040sa.pdf<br><sub>merge-forms</sub> | PASS | 7 pages, 89 KB | 3.5s, heap 14 MB |
| merge | 911-commission-report.pdf + us-economic-report-president-2024.pdf<br><sub>merge-large</sub> | PASS | 1072 pages, 7.0 MB | 7.0s, heap 61 MB |
| merge | owner-only-tracemonkey.pdf + pdfjs-TAMReview.pdf<br><sub>merge-owner-only</sub> | PASS | 37 pages, 1.5 MB | 1.3s, heap 22 MB |
| merge | pdfjs-xref_command_missing.pdf + pdfjs-tracemonkey.pdf<br><sub>merge-damaged-xref</sub> | PASS | 15 pages, 940 KB | 0.6s, heap 16 MB |
| merge | pdf20-simple.pdf + pdf20-offset-start.pdf + pdf20-incremental-save.pdf<br><sub>merge-pdf20</sub> | PASS | 3 pages, 5 KB | 0.2s, heap 28 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | PASS | 14 pages -> 7 + 7 | 1.4s, heap 7 MB |
| split | us-budget-2024.pdf<br><sub>split-budget-bookmarks</sub> | PASS | 184 pages -> 92 + 92 | 6.6s, heap 48 MB |
| split | 911-commission-report.pdf<br><sub>split-911-large</sub> | PASS | 585 pages -> 292 + 293 | 6.1s, heap 21 MB |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 0.7s, heap 40 MB |
| split | irs-f1040.pdf<br><sub>split-form-f1040</sub> | PASS | 2 pages -> 1 + 1 | 0.5s, heap 18 MB |
| split | crooked-paths-1648-104MB.pdf<br><sub>split-crooked-104MB</sub> | PASS | 255 pages -> 127 + 128 | 25.5s, heap 15 MB |
| split | explorations-bible-lands-956pp-62MB.pdf<br><sub>split-bible-956p-62MB</sub> | PASS | 956 pages -> 478 + 478 | 14.2s, heap 20 MB |
| extract | us-budget-2024.pdf<br><sub>extract-budget-1-3-5</sub> | PASS | 3 pages out | 3.4s, heap 17 MB |
| extract | pdfjs-rotation.pdf<br><sub>extract-rotation-2</sub> | PASS | 1 pages out | 0.1s, heap 28 MB |
| extract | darwin-origin-of-species-ia.pdf<br><sub>extract-darwin-scan</sub> | PASS | 3 pages out | 0.7s, heap 28 MB |
| remove | pdfjs-tracemonkey.pdf<br><sub>remove-tracemonkey-p1</sub> | PASS | 13 pages out | 2.0s, heap 7 MB |
| remove | 911-commission-report.pdf<br><sub>remove-911-first10</sub> | PASS | 575 pages out | 3.0s, heap 14 MB |
| rotate | pdfjs-rotation.pdf<br><sub>rotate-rotation-quirk</sub> | PASS | 2 pages out | 1.3s, heap 7 MB |
| rotate | rot90-cropbox-bert.pdf<br><sub>rotate-rot90-cropbox</sub> | PASS | 16 pages out | 2.1s, heap 7 MB |
| rotate | pdfjs-hello_world_rotated.pdf<br><sub>rotate-hello-rotated</sub> | PASS | 5 pages out | 0.1s, heap 8 MB |
| organize | pdfjs-tracemonkey.pdf<br><sub>organize-reverse-tracemonkey</sub> | PASS | 14 pages out | 1.2s, heap 7 MB |
| organize | irs-fw4.pdf<br><sub>organize-reverse-fw4</sub> | PASS | 5 pages out | 1.2s, heap 7 MB |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf<br><sub>flow-merge</sub> | PASS | ready 2.3s, click to download 1.3s: merged.pdf: 30 pages, 1.55 MB | 4.8s, heap 12 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | PASS | ready 1.7s, click to download 1.7s: 2 PDFs, 14 pages in total | 3.5s, heap 11 MB |
