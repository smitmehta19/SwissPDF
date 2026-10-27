# Corpus scorecard: review-automate-2

Run: 2026-10-27 09:03 UTC, 3.9 min. Command: `npm run test:corpus -- --tool automate --name review-automate-2`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **21 PASS, 0 FAIL, 0 SKIP** of 21 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| automate | 21 | 0 | 0 | 202.3s |

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
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-share-pdfjs-tracemonkey</sub> | PASS | run 3966 ms; Sanitize nochange, Flatten nochange, Remove annotations nochange, Metadata 2584ms, Compress 540ms | 28.4s, heap 12 MB |
| automate | aws-invoice.pdf<br><sub>s3-share-aws-invoice</sub> | PASS | run 53 ms; Sanitize nochange, Flatten nochange, Remove annotations nochange, Metadata 17ms, Compress nochange | 0.2s, heap 12 MB |
| automate | irs-fw9.pdf<br><sub>s3-share-irs-fw9</sub> | PASS | run 699 ms; Sanitize 110ms, Flatten 307ms, Remove annotations nochange, Metadata 132ms, Compress nochange | 0.9s, heap 13 MB |
| automate | pdfjs-tracemonkey_with_annotations.pdf<br><sub>s3-share-pdfjs-tracemonkey-with-a</sub> | PASS | run 879 ms; Sanitize nochange, Flatten nochange, Remove annotations 64ms, Metadata 182ms, Compress 515ms | 1.5s, heap 14 MB |
| automate | arxiv-1706.03762-attention.pdf<br><sub>s3-share-arxiv-1706-03762-attenti</sub> | PASS | run 4338 ms; Sanitize nochange, Flatten nochange, Remove annotations nochange, Metadata 1617ms, Compress nochange | 6.0s, heap 24 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-mail-pdfjs-tracemonkey</sub> | PASS | run 1784 ms; Compress 525ms, Protect 1258ms | 2.2s, heap 24 MB |
| automate | aws-invoice.pdf<br><sub>s3-mail-aws-invoice</sub> | PASS | run 1109 ms; Compress 15ms, Protect 1094ms | 1.3s, heap 11 MB |
| automate | irs-fw9.pdf<br><sub>s3-mail-irs-fw9</sub> | PASS | run 1208 ms; Compress nochange, Protect 1074ms | 1.4s, heap 14 MB |
| automate | fax-jean-schmidt-doe.pdf<br><sub>s3-scan-fax-jean-schmidt-doe</sub> | PASS | run 5078 ms; Auto rotate nochange, OCR skipped, Compress 18ms | 5.3s, heap 15 MB |
| automate | sub-ndl-konoye-p1.pdf<br><sub>s3-scan-sub-ndl-konoye-p1</sub> | PASS | run 17913 ms; Auto rotate nochange, OCR 14045ms, Compress 11ms | 18.1s, heap 12 MB |
| automate | lincoln-ellsworth-letter-1861.pdf<br><sub>s3-scan-lincoln-ellsworth-letter</sub> | PASS | run 81977 ms; Auto rotate nochange, OCR 49347ms, Compress nochange | 82.3s, heap 13 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-draft-pdfjs-tracemonkey</sub> | PASS | run 568 ms; Page numbers 266ms, Watermark 293ms | 1.1s, heap 13 MB |
| automate | aws-invoice.pdf<br><sub>s3-draft-aws-invoice</sub> | PASS | run 43 ms; Page numbers 22ms, Watermark 18ms | 0.2s, heap 14 MB |
| automate | irs-fw9.pdf<br><sub>s3-draft-irs-fw9</sub> | PASS | run 210 ms; Page numbers 96ms, Watermark 109ms | 0.5s, heap 15 MB |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-archive-pdfjs-tracemonkey</sub> | PASS | run 463 ms; Repair 60ms, Fast web view 397ms | 1.0s, heap 14 MB |
| automate | aws-invoice.pdf<br><sub>s3-archive-aws-invoice</sub> | PASS | run 33 ms; Repair 7ms, Fast web view 22ms | 0.3s, heap 16 MB |
| automate | irs-fw9.pdf<br><sub>s3-archive-irs-fw9</sub> | PASS | run 164 ms; Repair 59ms, Fast web view 100ms | 0.3s, heap 16 MB |
| automate | pdfjs-tracemonkey.pdf + aws-invoice.pdf + irs-fw9.pdf<br><sub>s3-batch-draft-3</sub> | PASS | batch run 683 ms for 3 files | 2.9s, heap 19 MB |
| automate | pdfjs-tracemonkey.pdf + xfa-imm1344e-filled.pdf + aws-invoice.pdf<br><sub>s3-batch-share-one-fails</sub> | PASS | batch run 1330 ms; failed: This is a dynamic XFA form: the form exists only as XFA, and this change would l | 5.4s, heap 19 MB |
| automate | lincoln-ellsworth-letter-1861.pdf<br><sub>s3-cancel-scan</sub> | PASS |  | 4.1s, heap 17 MB |
| automate | lincoln-ellsworth-letter-1861.pdf<br><sub>s3-cancel-in-ocr</sub> | PASS | stopped 0 ms after Cancel inside OCR | 38.8s, heap 13 MB |
