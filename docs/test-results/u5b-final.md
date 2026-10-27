# Corpus scorecard: u5b-final

Run: 2026-10-27 01:15 UTC, 3.1 min. Command: `npm run test:corpus -- --tool bookmarks,metadata,attachments,removeannots,removeimages,extractimages,flatten,unlockforms,sanitize,permissions,info,autorename,showjs --name u5b-final`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **72 PASS, 0 FAIL, 0 SKIP** of 72 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| bookmarks | 6 | 0 | 0 | 11.7s |
| metadata | 7 | 0 | 0 | 11.9s |
| attachments | 8 | 0 | 0 | 16.1s |
| sanitize | 9 | 0 | 0 | 8.4s |
| removeannots | 4 | 0 | 0 | 3.1s |
| removeimages | 5 | 0 | 0 | 5.2s |
| extractimages | 5 | 0 | 0 | 4.3s |
| flatten | 7 | 0 | 0 | 6.5s |
| unlockforms | 5 | 0 | 0 | 4.3s |
| permissions | 4 | 0 | 0 | 5.0s |
| info | 4 | 0 | 0 | 4.3s |
| autorename | 3 | 0 | 0 | 4.0s |
| showjs | 5 | 0 | 0 | 2.7s |

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
| bookmarks | pdfjs-outlines_se.pdf<br><sub>u5b-bookmarks-outlines-se</sub> | PASS | run to result 2467 ms: 6 bookmarks. | 6.3s, heap 10 MB |
| bookmarks | pdfjs-nested_outline.pdf<br><sub>u5b-bookmarks-nested</sub> | PASS | run to result 14 ms: 12 bookmarks. | 0.1s, heap 10 MB |
| bookmarks | pdfjs-outline_goto_action.pdf<br><sub>u5b-bookmarks-goto-action</sub> | PASS | run to result 7 ms: 5 bookmarks. | 0.1s, heap 11 MB |
| bookmarks | pdfjs-tracemonkey.pdf<br><sub>u5b-bookmarks-tracemonkey</sub> | PASS | run to result 260 ms: 3 bookmarks. | 0.7s, heap 11 MB |
| bookmarks | arxiv-1706.03762-attention.pdf<br><sub>u5b-bookmarks-headings-attention</sub> | PASS | run to result 1564 ms: 13 bookmarks. | 3.3s, heap 24 MB |
| bookmarks | xfa-imm1344e-filled.pdf<br><sub>u5b-bookmarks-xfa-imm1344e</sub> | PASS | run to result 143 ms: 21 bookmarks. | 1.2s, heap 26 MB |
| metadata | pdfjs-tracemonkey.pdf<br><sub>u5b-metadata-tracemonkey</sub> | PASS | run to result 1516 ms: Info and XMP updated. | 3.3s, heap 12 MB |
| metadata | pdfjs-tracemonkey.pdf<br><sub>u5b-metadata-tracemonkey-delete-all</sub> | PASS | run to result 238 ms: Document info and XMP removed. | 0.7s, heap 12 MB |
| metadata | aws-invoice.pdf<br><sub>u5b-metadata-aws</sub> | PASS | run to result 21 ms: Info and XMP updated. | 0.2s, heap 13 MB |
| metadata | aws-invoice.pdf<br><sub>u5b-metadata-aws-delete-all</sub> | PASS | run to result 23 ms: Document info and XMP removed. | 0.2s, heap 14 MB |
| metadata | arxiv-1706.03762-attention.pdf<br><sub>u5b-metadata-attention</sub> | PASS | run to result 1512 ms: Info and XMP updated. | 3.2s, heap 29 MB |
| metadata | arxiv-1706.03762-attention.pdf<br><sub>u5b-metadata-attention-delete-all</sub> | PASS | run to result 1923 ms: Document info and XMP removed. | 3.8s, heap 35 MB |
| metadata | xfa-imm1344e-filled.pdf<br><sub>u5b-metadata-xfa-imm1344e</sub> | PASS | run to result 172 ms: Info and XMP updated. | 0.4s, heap 35 MB |
| attachments | pdfjs-tracemonkey.pdf<br><sub>u5b-attachments-tracemonkey</sub> | PASS | run to result 939 ms: 2 files attached. | 3.9s, heap 10 MB |
| attachments | aws-invoice.pdf<br><sub>u5b-attachments-aws</sub> | PASS | run to result 14 ms: 2 files attached. | 0.5s, heap 10 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-fileattachment</sub> | PASS | run to result 33 ms: 2 files attached. | 0.5s, heap 11 MB |
| attachments | aws-invoice.pdf<br><sub>u5b-attachments-big-aws</sub> | PASS | run to result 1420 ms: 4 files attached. | 10.7s, heap 11 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-remove-annotation</sub> | PASS | run to result 12 ms, 1 attachment(s) | 0.1s, heap 10 MB |
| attachments | aws-invoice.pdf<br><sub>u5b-attachments-facturx</sub> | PASS | run to result 9 ms, 2 attachment(s) | 0.3s, heap 10 MB |
| attachments | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-attachments-tagged-annotation</sub> | PASS | run to result 9 ms, 1 attachment(s) | 0.1s, heap 10 MB |
| attachments | pdfjs-encrypted-attachment.pdf<br><sub>u5b-attachments-encrypted</sub> | PASS |  | 0.1s |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-facturx</sub> | PASS | run to result 976 ms: Removed 1 attached file. | 2.8s, heap 10 MB |
| sanitize | xfa-imm1344e-filled.pdf<br><sub>u5b-sanitize-xfa-imm1344e</sub> | PASS | run to result 155 ms: Removed 42 scripts, 355 XFA scripts. | 0.3s, heap 10 MB |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | PASS | run to result 215 ms: Removed 6 scripts, 1 XFA form. | 0.5s, heap 12 MB |
| sanitize | uscis-i-9.pdf<br><sub>u5b-sanitize-i9</sub> | PASS | run to result 351 ms: Removed 28 scripts, 32 triggers. | 1.3s, heap 16 MB |
| sanitize | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-sanitize-fileattachment</sub> | PASS | run to result 16 ms: Removed 1 attached file. | 0.1s, heap 17 MB |
| sanitize | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-sanitize-all-tracemonkey</sub> | PASS | run to result 100 ms: Removed 1 info dictionary, 24 embedded fonts. | 0.6s, heap 17 MB |
| sanitize | pdfjs-tracemonkey.pdf<br><sub>u5b-sanitize-tracemonkey</sub> | PASS | run to result 119 ms: Nothing found to remove. | 0.7s, heap 16 MB |
| sanitize | aws-invoice.pdf<br><sub>u5b-sanitize-aws</sub> | PASS | run to result 8 ms: Nothing found to remove. | 0.1s, heap 16 MB |
| sanitize | arxiv-1706.03762-attention.pdf<br><sub>u5b-sanitize-attention</sub> | PASS | run to result 677 ms: Nothing found to remove. | 2.0s, heap 24 MB |
| removeannots | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-removeannots-tracemonkey</sub> | PASS | run to result 781 ms: 4 annotations removed. | 2.5s, heap 10 MB |
| removeannots | pdfjs-annotation-fileattachment.pdf<br><sub>u5b-removeannots-fileattachment</sub> | PASS | run to result 15 ms: 1 annotation removed. | 0.1s, heap 10 MB |
| removeannots | irs-fw9.pdf<br><sub>u5b-removeannots-fw9-fields</sub> | PASS | run to result 108 ms: 23 annotations removed. | 0.3s, heap 11 MB |
| removeannots | xfa-imm1344e-filled.pdf<br><sub>u5b-removeannots-fields-xfa-imm1344e</sub> | PASS |  | 0.1s |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | PASS | run to result 860 ms: Images removed on 3 pages, 177.9 KB saved. | 2.4s, heap 10 MB |
| removeimages | aws-invoice.pdf<br><sub>u5b-removeimages-aws</sub> | PASS | run to result 10 ms: Images removed on 1 page, 66.6 KB saved. | 0.1s, heap 10 MB |
| removeimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-removeimages-attention</sub> | PASS | run to result 423 ms: Images removed on 2 pages, 604.8 KB saved. | 1.6s, heap 22 MB |
| removeimages | udhr-hebrew.pdf<br><sub>u5b-removeimages-inline-hebrew</sub> | PASS | run to result 20 ms: No images found, the file is unchanged. | 0.1s, heap 22 MB |
| removeimages | arxiv-2005.14165-gpt3.pdf<br><sub>u5b-removeimages-inline-gpt3</sub> | PASS | run to result 172 ms: Images removed on 26 pages, 5.97 MB saved. | 1.1s, heap 9 MB |
| extractimages | pdfjs-tracemonkey.pdf<br><sub>u5b-extractimages-tracemonkey</sub> | PASS | run to result 601 ms: 90 images. | 2.2s, heap 8 MB |
| extractimages | aws-invoice.pdf<br><sub>u5b-extractimages-aws</sub> | PASS | run to result 6 ms: 1 image, 1 kept as JPEG. | 0.1s, heap 10 MB |
| extractimages | arxiv-1706.03762-attention.pdf<br><sub>u5b-extractimages-attention</sub> | PASS | run to result 712 ms: 3 images. | 1.5s, heap 11 MB |
| extractimages | pdfjs-cmykjpeg.pdf<br><sub>u5b-extractimages-cmyk-png</sub> | PASS | run to result 164 ms: 1 image. | 0.3s, heap 9 MB |
| extractimages | pdfjs-cmykjpeg.pdf<br><sub>u5b-extractimages-cmyk-jpg</sub> | PASS | run to result 32 ms: 1 image. | 0.1s, heap 10 MB |
| flatten | xfa-issue14315.pdf<br><sub>u5b-flatten-xfa-dynamic</sub> | PASS |  | 1.6s |
| flatten | xfa-imm1344e-filled.pdf<br><sub>u5b-flatten-xfa-imm1344e</sub> | PASS |  | 0.1s |
| flatten | xfa-imm1344e-filled.pdf<br><sub>u5b-flatten-full-xfa-imm1344e</sub> | PASS |  | 0.1s |
| flatten | irs-fw9.pdf<br><sub>u5b-flatten-fw9</sub> | PASS | run to result 651 ms: 23 fields flattened. | 1.2s, heap 14 MB |
| flatten | uscis-i-9.pdf<br><sub>u5b-flatten-i9</sub> | PASS | run to result 679 ms: 128 fields flattened. | 1.6s, heap 20 MB |
| flatten | irs-fw4.pdf<br><sub>u5b-flatten-fw4</sub> | PASS | run to result 418 ms: 48 fields flattened. | 1.3s, heap 24 MB |
| flatten | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-flatten-full-tracemonkey</sub> | PASS | run to result 125 ms: 4 annotations flattened. | 0.6s, heap 25 MB |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-fw9</sub> | PASS | run to result 718 ms: Unlocked 23 fields, 23 XFA locks. | 2.4s, heap 11 MB |
| unlockforms | uscis-i-9.pdf<br><sub>u5b-unlockforms-i9</sub> | PASS | run to result 182 ms: Unlocked 128 fields. | 0.7s, heap 11 MB |
| unlockforms | xfa-imm1344e-filled.pdf<br><sub>u5b-unlockforms-xfa</sub> | PASS | run to result 172 ms: Unlocked 1 field, 299 XFA locks. | 0.7s, heap 10 MB |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-xfa-single-stream</sub> | PASS | run to result 73 ms: Unlocked 23 fields, 23 XFA locks. | 0.4s, heap 15 MB |
| unlockforms | xfa-issue14315.pdf<br><sub>u5b-unlockforms-xfa-nothing-locked</sub> | PASS | run to result 6 ms: No read-only fields, the file is unchanged. | 0.1s, heap 20 MB |
| permissions | owner-only-aws-invoice.pdf<br><sub>u5b-permissions-owner-only-aws</sub> | PASS | run to result 1254 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 3.1s, heap 10 MB |
| permissions | pdfjs-tracemonkey.pdf<br><sub>u5b-permissions-tracemonkey</sub> | PASS | run to result 375 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 0.9s, heap 10 MB |
| permissions | irs-fw9.pdf<br><sub>u5b-permissions-fw9</sub> | PASS | run to result 367 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 0.6s, heap 13 MB |
| permissions | aws-invoice.pdf<br><sub>u5b-permissions-orphan-aws</sub> | PASS | run to result 263 ms: Blocked: copy text and images, change the document, add comments, fill in forms, insert, rotate and delete pages. | 0.4s, heap 13 MB |
| info | pdfjs-tracemonkey.pdf<br><sub>u5b-info-tracemonkey</sub> | PASS | run to result 681 ms: 14 pages, 24 fonts, 90 images. | 2.1s, heap 7 MB |
| info | aws-invoice.pdf<br><sub>u5b-info-aws</sub> | PASS | run to result 35 ms: 1 page, 3 fonts, 1 image. | 0.2s, heap 10 MB |
| info | irs-fw9.pdf<br><sub>u5b-info-fw9</sub> | PASS | run to result 170 ms: 6 pages, 6 fonts, 0 images. | 0.4s, heap 10 MB |
| info | arxiv-1706.03762-attention.pdf<br><sub>u5b-info-attention</sub> | PASS | run to result 873 ms: 15 pages, 34 fonts, 3 images. | 1.7s, heap 16 MB |
| autorename | pdfjs-tracemonkey.pdf<br><sub>u5b-autorename-tracemonkey</sub> | PASS | run to result 464 ms: Named after its heading. Was pdfjs-tracemonkey.pdf. | 1.9s, heap 7 MB |
| autorename | arxiv-1706.03762-attention.pdf<br><sub>u5b-autorename-attention</sub> | PASS | run to result 768 ms: Named after its heading. Was arxiv-1706.03762-attention.pdf. | 1.9s, heap 21 MB |
| autorename | aws-invoice.pdf<br><sub>u5b-autorename-aws</sub> | PASS | run to result 71 ms: Named after its heading. Was aws-invoice.pdf. | 0.2s, heap 23 MB |
| showjs | pdfjs-outlines_se.pdf<br><sub>u5b-showjs-none-outlines</sub> | PASS |  | 1.7s |
| showjs | irs-fw9.pdf<br><sub>u5b-showjs-fw9</sub> | PASS | run to result 28 ms: 3 XFA <script> tags, 0 self-closing, 0 empty | 0.2s, heap 10 MB |
| showjs | uscis-i-9.pdf<br><sub>u5b-showjs-i9</sub> | PASS | run to result 52 ms: 0 XFA <script> tags, 0 self-closing, 0 empty | 0.3s, heap 12 MB |
| showjs | xfa-issue14315.pdf<br><sub>u5b-showjs-xfa</sub> | PASS | run to result 2 ms: 0 XFA <script> tags, 0 self-closing, 0 empty | 0.2s, heap 16 MB |
| showjs | xfa-imm1344e-filled.pdf<br><sub>u5b-showjs-xfa-imm1344e</sub> | PASS | run to result 56 ms: 1437 XFA <script> tags, 1082 self-closing, 0 empty | 0.2s, heap 17 MB |
