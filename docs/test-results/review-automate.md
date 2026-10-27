# Corpus scorecard: review-automate

Run: 2026-10-27 03:20 UTC, 1.7 min. Command: `npm run test:corpus -- --tool automate --name review-automate`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **19 PASS, 0 FAIL, 0 SKIP** of 19 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| automate | 19 | 0 | 0 | 92.9s |

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

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-share-pdfjs-tracemonkey</sub> | PASS | run 3395 ms; Sanitize 2641ms, Flatten 26ms, Remove annotations 16ms, Metadata 226ms, Compress 480ms | 18.1s, heap 12 MB |
| automate | aws-invoice.pdf<br><sub>s3-share-aws-invoice</sub> | PASS | run 59 ms; Sanitize 7ms, Flatten 3ms, Remove annotations 4ms, Metadata 12ms, Compress 31ms | 0.2s, heap 12 MB |
| automate | irs-fw9.pdf<br><sub>s3-share-irs-fw9</sub> | PASS | run 536 ms; Sanitize 74ms, Flatten 246ms, Remove annotations 11ms, Metadata 98ms, Compress 102ms | 0.8s, heap 11 MB |
| automate | pdfjs-tracemonkey_with_annotations.pdf<br><sub>s3-share-pdfjs-tracemonkey-with-a</sub> | PASS | run 683 ms; Sanitize 65ms, Flatten 9ms, Remove annotations 60ms, Metadata 140ms, Compress 406ms | 1.1s, heap 12 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-mail-pdfjs-tracemonkey</sub> | PASS | run 508 ms; Compress 383ms, Protect 124ms | 0.9s, heap 15 MB |
| automate | aws-invoice.pdf<br><sub>s3-mail-aws-invoice</sub> | PASS | run 99 ms; Compress 12ms, Protect 86ms | 0.2s, heap 16 MB |
| automate | irs-fw9.pdf<br><sub>s3-mail-irs-fw9</sub> | PASS | run 220 ms; Compress 109ms, Protect 111ms | 0.3s, heap 17 MB |
| automate | fax-jean-schmidt-doe.pdf<br><sub>s3-scan-fax-jean-schmidt-doe</sub> | PASS | run 4092 ms; Auto rotate 4043ms, OCR skipped, Compress 13ms | 4.2s, heap 15 MB |
| automate | sub-ndl-konoye-p1.pdf<br><sub>s3-scan-sub-ndl-konoye-p1</sub> | PASS | run 9621 ms; Auto rotate 2660ms, OCR 6955ms, Compress 4ms | 9.8s, heap 11 MB |
| automate | lincoln-ellsworth-letter-1861.pdf<br><sub>s3-scan-lincoln-ellsworth-letter</sub> | PASS | run 48669 ms; Auto rotate 17649ms, OCR 31002ms, Compress 16ms | 48.8s, heap 12 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-draft-pdfjs-tracemonkey</sub> | PASS | run 302 ms; Page numbers 140ms, Watermark 159ms | 0.5s, heap 12 MB |
| automate | aws-invoice.pdf<br><sub>s3-draft-aws-invoice</sub> | PASS | run 28 ms; Page numbers 13ms, Watermark 13ms | 0.1s, heap 13 MB |
| automate | irs-fw9.pdf<br><sub>s3-draft-irs-fw9</sub> | PASS | run 146 ms; Page numbers 71ms, Watermark 72ms | 0.3s, heap 14 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-archive-pdfjs-tracemonkey</sub> | PASS | run 166 ms; Repair 34ms, Fast web view 129ms | 0.6s, heap 12 MB |
| automate | aws-invoice.pdf<br><sub>s3-archive-aws-invoice</sub> | PASS | run 14 ms; Repair 5ms, Fast web view 7ms | 0.1s, heap 14 MB |
| automate | irs-fw9.pdf<br><sub>s3-archive-irs-fw9</sub> | PASS | run 124 ms; Repair 45ms, Fast web view 77ms | 0.2s, heap 14 MB |
| automate | pdfjs-tracemonkey.pdf + aws-invoice.pdf + irs-fw9.pdf<br><sub>s3-batch-draft-3</sub> | PASS | batch run 428 ms for 3 files | 0.8s, heap 14 MB |
| automate | pdfjs-tracemonkey.pdf + xfa-imm1344e-filled.pdf + aws-invoice.pdf<br><sub>s3-batch-share-one-fails</sub> | PASS | batch run 749 ms; failed: This is a dynamic XFA form: the form exists only as XFA, and this change would l | 1.7s, heap 18 MB |
| automate | lincoln-ellsworth-letter-1861.pdf<br><sub>s3-cancel-scan</sub> | PASS |  | 4.0s, heap 18 MB |
