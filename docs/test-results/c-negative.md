# Corpus scorecard: c-negative

Run: 2026-10-17 16:36 UTC, 0.4 min. Command: `npm run test:corpus -- --layer ops --case ^c-(watermark|pagenumbers|sign|edit)-(c-rot180-origin|c-mixed|rot90-cropbox)(-45|-bottom-center|-p1|-p3)?$ --name c-negative`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **1 PASS, 12 FAIL, 0 SKIP** of 13 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| watermark | 0 | 3 | 0 | 4.3s |
| pagenumbers | 0 | 3 | 0 | 3.5s |
| sign | 0 | 3 | 0 | 3.6s |
| edit | 1 | 3 | 0 | 4.5s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT TESTED | no corpus case |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT TESTED | no corpus case |
| 3 | Redact search misses phrases split across text items | NOT TESTED | no corpus case |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no corpus case |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | NOT TESTED | no corpus case |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT TESTED | no corpus case |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | CONFIRMED | c-watermark-rot90-cropbox-45: centred on the visible page at 45 deg as seen (p1 centre (0.63, 0.55) -45 deg; p2 centre (0.63, 0.55) -45 deg; p3 centre (0.63, 0.55) -45 deg)<br>c-watermark-c-rot180-origin-45: centred on the visible page at 45 deg as seen (p1 centre (0.72, 0.30) -135 deg; p2 centre (0.72, 0.30) -135 deg)<br>c-watermark-c-mixed-45: centred on the visible page at 45 deg as seen (p1 ce |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT TESTED | no corpus case |
| 10 | OCR English only, assets from CDN (not offline) | NOT TESTED | no corpus case |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | NOT TESTED | no corpus case |
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

- **watermark** (3): `c-watermark-rot90-cropbox-45` centred on the visible page at 45 deg as seen: p1 centre (0.63, 0.55) -45 deg; p2 centre (0.63, 0.55) -45 deg; p3 centre; `c-watermark-c-rot180-origin-45` centred on the visible page at 45 deg as seen: p1 centre (0.72, 0.30) -135 deg; p2 centre (0.72, 0.30) -135 deg; `c-watermark-c-mixed-45` mark on every page: 4 of 5
- **pagenumbers** (3): `c-pagenumbers-rot90-cropbox-bottom-center` number visible on every page: 0 of 16; `c-pagenumbers-c-rot180-origin-bottom-center` number visible on every page: 0 of 2; `c-pagenumbers-c-mixed-bottom-center` number visible on every page: 4 of 5
- **sign** (3): `c-sign-rot90-cropbox` signature at (50%, 85%) of page 1, upright: centre (0.09, 0.49); `c-sign-c-rot180-origin` signature at (50%, 85%) of page 1, upright: centre (0.78, -0.26); `c-sign-c-mixed` signature at (50%, 85%) of page 3, upright: centre (-0.03, 1.04)
- **edit** (3): `c-edit-rot90-cropbox-p1` text exactly where placed, upright: origin (717.9, 10.0) -90 deg; `c-edit-c-rot180-origin-p1` text added; `c-edit-c-mixed-p3` text exactly where placed, upright: origin (588.0, 340.0) -90 deg

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| watermark | rot90-cropbox-bert.pdf<br><sub>c-watermark-rot90-cropbox-45</sub> | FAIL | centred on the visible page at 45 deg as seen: p1 centre (0.63, 0.55) -45 deg; p2 centre (0.63, 0.55) -45 deg; p3 centre (0.63, 0.55) -45 deg | 2.2s, heap 6 MB |
| watermark | c-rot180-origin.pdf<br><sub>c-watermark-c-rot180-origin-45</sub> | FAIL | centred on the visible page at 45 deg as seen: p1 centre (0.72, 0.30) -135 deg; p2 centre (0.72, 0.30) -135 deg | 1.0s, heap 9 MB |
| watermark | c-mixed.pdf<br><sub>c-watermark-c-mixed-45</sub> | FAIL | mark on every page: 4 of 5 | 1.0s, heap 10 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>c-pagenumbers-rot90-cropbox-bottom-center</sub> | FAIL | number visible on every page: 0 of 16 | 1.4s, heap 6 MB |
| pagenumbers | c-rot180-origin.pdf<br><sub>c-pagenumbers-c-rot180-origin-bottom-center</sub> | FAIL | number visible on every page: 0 of 2 | 1.0s, heap 8 MB |
| pagenumbers | c-mixed.pdf<br><sub>c-pagenumbers-c-mixed-bottom-center</sub> | FAIL | number visible on every page: 4 of 5 | 1.0s, heap 10 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>c-sign-rot90-cropbox</sub> | FAIL | signature at (50%, 85%) of page 1, upright: centre (0.09, 0.49) | 1.5s, heap 6 MB |
| sign | c-rot180-origin.pdf<br><sub>c-sign-c-rot180-origin</sub> | FAIL | signature at (50%, 85%) of page 1, upright: centre (0.78, -0.26) | 1.0s, heap 8 MB |
| sign | c-mixed.pdf<br><sub>c-sign-c-mixed</sub> | FAIL | signature at (50%, 85%) of page 3, upright: centre (-0.03, 1.04) | 1.0s, heap 9 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>c-edit-rot90-cropbox-p1</sub> | FAIL | text exactly where placed, upright: origin (717.9, 10.0) -90 deg | 1.4s, heap 6 MB |
| edit | c-rot180-origin.pdf<br><sub>c-edit-c-rot180-origin-p1</sub> | FAIL | text added | 1.0s, heap 8 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p1</sub> | PASS |  | 1.0s, heap 10 MB |
| edit | c-mixed.pdf<br><sub>c-edit-c-mixed-p3</sub> | FAIL | text exactly where placed, upright: origin (588.0, 340.0) -90 deg | 1.0s, heap 9 MB |
