# Corpus scorecard: polishB3-rows

Run: 2026-10-27 20:41 UTC, 0.4 min. Command: `npm run test:corpus -- --light --shards 2 --case sanitize-loose|redact-numbered|redact-watermarked|u5b-sanitize|u5b-removeimages --name polishB3-rows`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **22 PASS, 0 FAIL, 0 SKIP** of 22 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| redact | 4 | 0 | 0 | 11.5s |
| sanitize | 12 | 0 | 0 | 8.1s |
| removeimages | 6 | 0 | 0 | 5.1s |

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
| redact | letter-to-benjamin-glover.pdf<br><sub>redact-numbered-scan-letter-to-benjamin-glover</sub> | PASS |  | 4.7s, heap 11 MB |
| redact | fax-jean-schmidt-doe.pdf<br><sub>redact-numbered-scan-fax-jean-schmidt-doe</sub> | PASS |  | 4.4s, heap 12 MB |
| redact | letter-to-benjamin-glover.pdf<br><sub>redact-watermarked-scan-letter-to-benjamin-glover</sub> | PASS |  | 1.2s, heap 11 MB |
| redact | letter-to-benjamin-glover.pdf<br><sub>redact-watermarked-96pt-scan-letter-to-benjamin-glover</sub> | PASS |  | 1.1s, heap 11 MB |
| sanitize | loose-attachment.pdf<br><sub>u5b-sanitize-loose-attachment</sub> | PASS | run to result 579 ms: Removed 1 attached file. | 1.2s, heap 9 MB |
| sanitize | loose-attachment-notype.pdf<br><sub>u5b-sanitize-loose-attachment-notype</sub> | PASS | run to result 5 ms: Removed 1 attached file, what earlier versions of the file left behind. | 0.1s, heap 9 MB |
| sanitize | loose-attachment-escaped.pdf<br><sub>u5b-sanitize-loose-attachment-escaped</sub> | PASS | run to result 551 ms: Removed 1 attached file, what earlier versions of the file left behind. | 1.3s, heap 9 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-facturx</sub> | PASS | run to result 25 ms: Removed 1 attached file. | 0.3s, heap 10 MB |
| sanitize | xfa-imm1344e-filled.pdf<br><sub>u5b-sanitize-xfa-imm1344e</sub> | PASS | run to result 114 ms: Removed 39 scripts, 355 XFA scripts, what earlier versions of the file left behind. | 0.7s, heap 11 MB |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | PASS | run to result 166 ms: Removed 3 scripts, 1 XFA form, what earlier versions of the file left behind. | 0.4s, heap 9 MB |
| sanitize | uscis-i-9.pdf<br><sub>u5b-sanitize-i9</sub> | PASS | run to result 446 ms: Removed 28 scripts, 32 triggers. | 0.9s, heap 10 MB |
| sanitize | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-sanitize-fileattachment</sub> | PASS | run to result 10 ms: Removed 1 attached file, what earlier versions of the file left behind. | 0.2s, heap 15 MB |
| sanitize | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-sanitize-all-tracemonkey</sub> | PASS | run to result 111 ms: Removed 1 info dictionary, 24 embedded fonts, what earlier versions of the file left behind. | 0.5s, heap 12 MB |
| sanitize | pdfjs-tracemonkey.pdf<br><sub>u5b-sanitize-tracemonkey</sub> | PASS | run to result 119 ms: Nothing found to remove. | 0.5s, heap 13 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-aws</sub> | PASS | run to result 10 ms: Nothing found to remove. | 0.1s, heap 12 MB |
| sanitize | arxiv-1706.03762-attention.pdf<br><sub>u5b-sanitize-attention</sub> | PASS | run to result 833 ms: Nothing found to remove. | 1.9s, heap 31 MB |
| removeimages | loose-image.pdf<br><sub>u5b-removeimages-loose-image</sub> | PASS | run to result 676 ms: 1 image left over from an earlier version of the file removed, 170 B saved. | 1.2s, heap 9 MB |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | PASS | run to result 573 ms: Images removed on 3 pages, 177.9 KB saved. | 1.6s, heap 9 MB |
| removeimages | aws-invoice.pdf<br><sub>u5b-removeimages-aws</sub> | PASS | run to result 16 ms: Images removed on 1 page, 66.6 KB saved. | 0.1s, heap 9 MB |
| removeimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-removeimages-attention</sub> | PASS | run to result 548 ms: Images removed on 2 pages, 604.8 KB saved. | 1.5s, heap 22 MB |
| removeimages | udhr-hebrew.pdf<br><sub>u5b-removeimages-inline-hebrew</sub> | PASS | run to result 18 ms: No images found, the file is unchanged. | 0.1s, heap 22 MB |
| removeimages | arxiv-2005.14165-gpt3.pdf<br><sub>u5b-removeimages-inline-gpt3</sub> | PASS | run to result 127 ms: Images removed on 26 pages, 5.97 MB saved. | 0.6s, heap 23 MB |
