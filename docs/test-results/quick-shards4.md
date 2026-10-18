# Corpus scorecard: quick-shards4

Run: 2026-10-17 16:55 UTC, 2.1 min. Command: `npm run test:corpus -- --quick --shards 4 --name quick-shards4`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **81 PASS, 15 FAIL, 0 SKIP** of 96 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 3 | 0 | 0 | 15.7s |
| excel2pdf | 1 | 1 | 0 | 3.6s |
| ppt2pdf | 2 | 0 | 0 | 6.4s |
| merge | 4 | 1 | 0 | 18.2s |
| split | 3 | 0 | 0 | 7.7s |
| extract | 1 | 0 | 0 | 5.6s |
| remove | 1 | 0 | 0 | 1.3s |
| rotate | 1 | 0 | 0 | 1.3s |
| organize | 1 | 0 | 0 | 2.6s |
| compress | 4 | 0 | 0 | 128.1s |
| repair | 2 | 0 | 0 | 5.5s |
| watermark | 3 | 0 | 0 | 3.5s |
| pagenumbers | 1 | 2 | 0 | 5.0s |
| sign | 2 | 1 | 0 | 6.8s |
| crop | 3 | 0 | 0 | 5.0s |
| edit | 2 | 1 | 0 | 7.2s |
| protect | 2 | 0 | 0 | 2.9s |
| unlock | 3 | 0 | 0 | 7.7s |
| ocr | 1 | 0 | 0 | 19.9s |
| pdf2word | 2 | 0 | 0 | 8.2s |
| pdf2excel | 1 | 0 | 0 | 0.9s |
| pdf2ppt | 1 | 0 | 0 | 20.9s |
| pdf2md | 1 | 0 | 0 | 6.2s |
| img2pdf | 2 | 2 | 0 | 3.1s |
| pdf2img | 2 | 0 | 0 | 4.1s |
| redact | 1 | 1 | 0 | 34.6s |
| forms | 4 | 0 | 0 | 5.2s |
| compare | 1 | 1 | 0 | 5.7s |
| html2pdf | 1 | 0 | 0 | 2.5s |
| health | 1 | 0 | 0 | 24.4s |
| intake | 24 | 5 | 0 | 25.2s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | CONFIRMED | merge-owner-only: error: This PDF is password-protected - unlock it first.<br>intake-quirks/pdfjs-encrypted-attachment.pdf: offers a password prompt (no password field on the card)<br>intake-quirks/pdfjs-issue21579.pdf: offers a password prompt (no password field on the card)<br>(+7 more) |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | CONFIRMED | redact-rot90-cropbox: black box covers the word on screen (coverage 0.26, 0.13, 0.16, 0.14, 0.14, 0.13) |
| 3 | Redact search misses phrases split across text items | NOT TESTED | no corpus case |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | the large corpus scans are JPX and render blank (finding 20), so per-page render cost could not be measured |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | CONFIRMED | compress-lincoln-scan: shrinks a scanned/image-heavy file by 10%+ (saved 1%) |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT REPRODUCED | 17 linked check(s) passed, e.g. intake-forms/annotation-button-widget.pdf: accepted; intake-forms/irs-fw9.pdf: accepted |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | CONFIRMED | pagenumbers-rotation-quirk: number at bottom centre, upright (p2 at (0.04, 0.47) sideways)<br>pagenumbers-rot90-cropbox: number visible on every page (0 of 16 (pdf.js and MuPDF only see text inside the visible box))<br>sign-rot90-cropbox: signature where the user clicked (50%, 85%), upright (centre (0.09, 0.49))<br>(+1 more) |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT TESTED | no corpus case |
| 10 | OCR English only, assets from CDN (not offline) | CONFIRMED | ocr-fax-printed: no network fetches outside the page origin (https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js, https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js, https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz) |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | NOT TESTED | no corpus case |
| 12 | Merge/split drop outlines, AcroForm, links | CONFIRMED | merge-outlines: bookmarks kept (0 of 36 outline items) |
| 13 | Crop rejects rotated, ignores box origin | NOT REPRODUCED | 3 linked check(s) passed, e.g. crop-tracemonkey: crop lands inside the visible page; crop-rotation-quirk: crop lands inside the visible page |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | CONFIRMED | pdf2word-tracemonkey-2col: column lines stay in reading order (4 of 43 line joins kept) |
| 16 | PDF to Excel number parsing loses leading zeros / formats | CONFIRMED | pdf2excel-aws-invoice: leading-zero / long ids kept as text (lost 0000) |
| 17 | PDF to PPT slides are flat images, fixed slide size | CONFIRMED | pdf2ppt-tracemonkey: slides carry editable text (0 chars) |
| 18 | Office to PDF quick mode is screenshots (no text) | CONFIRMED | ppt2pdf-quick-poi-SampleShow.pptx: selectable text (coverage 0.00)<br>word2pdf-quick-poi-sample.docx: selectable text (coverage 0.00) |
| 19 | HiFi engine from unpinned CDN, font substitution | CONFIRMED | office-engine-load: no fetches outside the page origin (cdn.zetaoffice.net) |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | NOT REPRODUCED | 4 linked check(s) passed, e.g. forms-list-irs-fw9: field scan under 10 s; forms-list-xfa-issue14315: field scan under 10 s |
| 22 | Protect: comma in password splits MuPDF options | NOT REPRODUCED | 1 linked check(s) passed, e.g. protect-comma-password: comma password refused with a clear message |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | CONFIRMED | img2pdf-heic-libheif-example.heic: image decoded (Not a supported image file.)<br>img2pdf-heic-libheif-example.heic: image decoded: Not a supported image file.<br>img2pdf-photo-castle-3456x2628.jpg: fit page is a sane paper size (<= 17 in) (48.0 x 36.5 in)<br>(+3 more) |
| 24 | Sign is visual only, one placement | NOT TESTED | feature gap (no PAdES / multi-place API to call) |
| 25 | Redact rasterizes whole pages (size balloons) | CONFIRMED | redact-tracemonkey: size stays reasonable (<= 3x) (5.6x input)<br>redact-rot90-cropbox: size stays reasonable (<= 3x) (11.4x input) |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT TESTED | no corpus case |
| 27 | Compare by page index only; inserted page breaks the rest | CONFIRMED | compare-inserted-page: only the inserted page differs (changed pages 3,4,5,6) |
| 28 | HTML to PDF is a screenshot, head styles dropped | CONFIRMED | html2pdf-tracemonkey-text: head <style> applied (0 red pixels)<br>html2pdf-tracemonkey-text: selectable text (coverage 0.00) |
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
| 42 | Self-test uses only synthetic fixtures | CONFIRMED | health-selftest: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) |

## Failures by tool

- **excel2pdf** (1): `excel2pdf-quick-poi-SampleSS.xlsx` error: TypeError: Cannot read properties of undefined (reading 'indexOf')
- **merge** (1): `merge-owner-only` error: This PDF is password-protected - unlock it first.
- **pagenumbers** (2): `pagenumbers-rotation-quirk` number at bottom centre, upright: p2 at (0.04, 0.47) sideways; `pagenumbers-rot90-cropbox` number visible on every page: 0 of 16 (pdf.js and MuPDF only see text inside the visible box)
- **sign** (1): `sign-rot90-cropbox` signature where the user clicked (50%, 85%), upright: centre (0.09, 0.49)
- **edit** (1): `edit-rot90-cropbox` text near top-left where placed, upright: at (0.95, 0.02) sideways
- **img2pdf** (2): `img2pdf-heic-libheif-example.heic` image decoded: Not a supported image file.; `img2pdf-tiff-multipage.tiff` image decoded: Not a supported image file.
- **redact** (1): `redact-rot90-cropbox` black box covers the word on screen: coverage 0.26, 0.13, 0.16, 0.14, 0.14, 0.13; warn: size stays reasonable (<= 3x) (1
- **compare** (1): `compare-inserted-page` only the inserted page differs: changed pages 3,4,5,6
- **intake** (5): `intake-derived/a-owner-only-attention.pdf` accepted: UI says "Password-protected - unlock it first"; `intake-derived/a-owner-only-us-budget.pdf` accepted: UI says "Password-protected - unlock it first"; `intake-derived/owner-only-aws-invoice.pdf` accepted: UI says "Password-protected - unlock it first"; `intake-derived/owner-only-irs-fw9.pdf` accepted: UI says "Password-protected - unlock it first"; `intake-derived/owner-only-tracemonkey.pdf` accepted: UI says "Password-protected - unlock it first"

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 11.9s, heap 23 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 1.8s, heap 23 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 2.8s, heap 24 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 1.1s, heap 23 MB |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf + arxiv-1512.03385-resnet.pdf<br><sub>merge-reports</sub> | PASS | 42 pages, 2.2 MB | 4.3s, heap 6 MB |
| merge | pdfjs-rotation.pdf + pdfjs-hello_world_rotated.pdf + rot90-cropbox-bert.pdf<br><sub>merge-rotated</sub> | PASS | 23 pages, 643 KB | 3.5s, heap 6 MB |
| merge | pdfjs-nested_outline.pdf + us-budget-2024.pdf<br><sub>merge-outlines</sub> | PASS | 193 pages, 2.4 MB; warn: bookmarks kept (0 of 36 outline items) | 6.6s, heap 44 MB |
| merge | owner-only-tracemonkey.pdf + pdfjs-TAMReview.pdf<br><sub>merge-owner-only</sub> | FAIL | error: This PDF is password-protected - unlock it first. | 0.4s |
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | PASS | 14 pages -> 7 + 7 | 1.7s, heap 6 MB |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 1.9s, heap 6 MB |
| extract | us-budget-2024.pdf<br><sub>extract-budget-1-3-5</sub> | PASS | 3 pages out | 5.6s, heap 11 MB |
| remove | pdfjs-tracemonkey.pdf<br><sub>remove-tracemonkey-p1</sub> | PASS | 13 pages out | 1.3s, heap 6 MB |
| rotate | pdfjs-rotation.pdf<br><sub>rotate-rotation-quirk</sub> | PASS | 2 pages out | 1.3s, heap 6 MB |
| organize | pdfjs-tracemonkey.pdf<br><sub>organize-reverse-tracemonkey</sub> | PASS | 14 pages out | 2.6s, heap 6 MB |
| compress | lincoln-ellsworth-letter-1861.pdf<br><sub>compress-lincoln-scan</sub> | PASS | 529 KB -> 526 KB (99%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 1%) | 5.8s, heap 7 MB |
| compress | arxiv-2307.09288-llama2.pdf<br><sub>compress-llama2</sub> | PASS | 13.0 MB -> 12.6 MB (97%) | 5.5s, heap 7 MB |
| compress | pdfjs-tracemonkey.pdf<br><sub>compress-raster-tracemonkey</sub> | PASS | 992 KB -> 992 KB (100%), kept original | 23.4s, heap 8 MB |
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | PASS | recovered 1, rasterized 0, lost 0 | 2.1s, heap 7 MB |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | PASS |  | 3.4s |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-tracemonkey</sub> | PASS | 14 marks | 1.2s, heap 6 MB |
| watermark | pdfjs-rotation.pdf<br><sub>watermark-rotation-quirk</sub> | PASS | 2 marks | 0.7s, heap 6 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>watermark-rot90-cropbox</sub> | PASS | 16 marks | 1.6s, heap 6 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>pagenumbers-tracemonkey</sub> | PASS |  | 2.6s, heap 6 MB |
| pagenumbers | pdfjs-rotation.pdf<br><sub>pagenumbers-rotation-quirk</sub> | FAIL | number at bottom centre, upright: p2 at (0.04, 0.47) sideways | 0.9s, heap 6 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>pagenumbers-rot90-cropbox</sub> | FAIL | number visible on every page: 0 of 16 (pdf.js and MuPDF only see text inside the visible box) | 1.6s, heap 6 MB |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 2.8s, heap 6 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 2.8s, heap 6 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | FAIL | signature where the user clicked (50%, 85%), upright: centre (0.09, 0.49) | 1.2s, heap 6 MB |
| crop | pdfjs-tracemonkey.pdf<br><sub>crop-tracemonkey</sub> | PASS | CropBox 61,317,367,713 | 3.7s, heap 6 MB |
| crop | pdfjs-rotation.pdf<br><sub>crop-rotation-quirk</sub> | PASS | CropBox 61,317,367,713 | 0.2s, heap 9 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>crop-rot90-cropbox</sub> | PASS | CropBox 60,337,357,758 | 1.1s, heap 6 MB |
| edit | pdfjs-tracemonkey.pdf<br><sub>edit-tracemonkey</sub> | PASS |  | 1.1s, heap 6 MB |
| edit | pdfjs-rotation.pdf<br><sub>edit-rotation-quirk</sub> | PASS |  | 1.7s, heap 6 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>edit-rot90-cropbox</sub> | FAIL | text near top-left where placed, upright: at (0.95, 0.02) sideways | 4.4s, heap 6 MB |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | PASS | Standard V5 R6 256-bit AES | 2.1s, heap 6 MB |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 0.8s |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | PASS | removed: none listed, had user password | 4.0s, heap 6 MB |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | PASS | removed: none listed, had user password | 0.5s, heap 7 MB |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 3.2s, heap 6 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 394 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc"; warn: no network fetches outside the page origin (https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js, https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js, https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz) | 19.9s, heap 9 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>pdf2word-tracemonkey-2col</sub> | PASS | coverage 1.00, 6 tables, 88 images; warn: column lines stay in reading order (4 of 43 line joins kept) | 5.7s, heap 10 MB |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice</sub> | PASS | coverage 1.00, 2 tables, 0 images | 2.4s, heap 6 MB |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | PASS | 1 sheets, 62 cells, coverage 1.00; warn: leading-zero / long ids kept as text (lost 0000) | 0.9s, heap 6 MB |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>pdf2ppt-tracemonkey</sub> | PASS | 14 slides, 15 images, 10.7 MB; warn: slides carry editable text (0 chars) | 20.9s, heap 40 MB |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | PASS | 84797 chars, 18 headings, 6 tables | 6.2s, heap 10 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | FAIL | error: TypeError: Cannot read properties of undefined (reading 'indexOf') | 1.8s |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | PASS | 2 pages, 8 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 3.6s, heap 10 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | PASS | 1 pages, 251 KB, text coverage 0.00; warn: selectable text (coverage 0.00) | 2.6s, heap 8 MB |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | FAIL | image decoded: Not a supported image file. | 0.5s |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | PASS | 1 page(s), 48.0x36.5 in, 5.4 MB, EXIF 1; warn: fit page is a sane paper size (<= 17 in) (48.0 x 36.5 in) | 1.3s, heap 6 MB |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | FAIL | image decoded: Not a supported image file. | 1.1s |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | PASS | 1 page(s), 1.8x1.8 in, 32 KB; warn: output not bloated (<= 3x input) (10.0x input) | 0.1s, heap 7 MB |
| pdf2img | pdfjs-tracemonkey.pdf<br><sub>pdf2img-tracemonkey</sub> | PASS | ink 10.8%, 13.3% | 1.6s, heap 6 MB |
| pdf2img | rot90-cropbox-bert.pdf<br><sub>pdf2img-rot90-cropbox</sub> | PASS | ink 16.3% | 2.5s, heap 6 MB |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | PASS | 33 boxes on 9 page(s), 5.6x size; warn: size stays reasonable (<= 3x) (5.6x input) | 17.0s, heap 11 MB |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | FAIL | black box covers the word on screen: coverage 0.26, 0.13, 0.16, 0.14, 0.14, 0.13; warn: size stays reasonable (<= 3x) (11.4x input) | 17.6s, heap 13 MB |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | PASS | 23 fields (23 widgets) in 73 ms, pdf.js 23, has XFA | 0.8s, heap 6 MB |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | PASS | 0 fields (0 widgets) in 18 ms, pdf.js 0, has XFA | 1.1s, heap 6 MB |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | PASS | 3 filled | 1.7s, heap 12 MB |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | PASS | 3 filled, flattened | 1.6s, heap 6 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | PASS | +0 -0, changed pages none | 2.9s, heap 8 MB |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | FAIL | only the inserted page differs: changed pages 3,4,5,6 | 2.7s, heap 7 MB |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | PASS | 1 pages, 230 KB; warn: head <style> applied (0 red pixels); selectable text (coverage 0.00) | 2.5s, heap 9 MB |
| health | -<br><sub>health-selftest</sub> | PASS | 44 checks, 0 failed; warn: self-test covers real-world fixtures (synthetic pdf-lib fixtures only) | 24.4s, heap 17 MB |
| intake | annotation-button-widget.pdf<br><sub>intake-forms/annotation-button-widget.pdf</sub> | PASS | expect accept (1 p): "1 page · 23.2 KB" | 0.4s |
| intake | irs-fw9.pdf<br><sub>intake-forms/irs-fw9.pdf</sub> | PASS | expect accept (6 p): "6 pages · 137.5 KB" | 0.4s |
| intake | xfa-issue14315.pdf<br><sub>intake-forms/xfa-issue14315.pdf</sub> | PASS | expect accept (1 p): "1 page · 11.3 KB" | 0.4s |
| intake | lincoln-ellsworth-letter-1861.pdf<br><sub>intake-scanned/lincoln-ellsworth-letter-1861.pdf</sub> | PASS | expect accept (36 p): "36 pages · 528.6 KB" | 0.4s |
| intake | arxiv-2005.14165-gpt3.pdf<br><sub>intake-reports/arxiv-2005.14165-gpt3.pdf</sub> | PASS | expect accept (75 p): "75 pages · 6.45 MB" | 0.4s |
| intake | us-budget-2024.pdf<br><sub>intake-reports/us-budget-2024.pdf</sub> | PASS | expect accept (184 p): "184 pages · 2.31 MB" | 2.4s |
| intake | pdfjs-ArabicCIDTrueType.pdf<br><sub>intake-intl/pdfjs-ArabicCIDTrueType.pdf</sub> | PASS | expect accept (1 p): "1 page · 38.4 KB" | 2.4s |
| intake | udhr-arabic.pdf<br><sub>intake-intl/udhr-arabic.pdf</sub> | PASS | expect accept (5 p): "5 pages · 184.8 KB" | 2.4s |
| intake | pdf20-image-bpc.pdf<br><sub>intake-quirks/pdf20-image-bpc.pdf</sub> | PASS | expect accept (1 p): "1 page · 8.8 KB" | 0.1s |
| intake | pdf20-utf8-test.pdf<br><sub>intake-quirks/pdf20-utf8-test.pdf</sub> | PASS | expect accept (1 p): "1 page · 13.6 KB" | 0.4s |
| intake | pdfjs-annotation-highlight-without-appearance.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight-without-appearance.pdf</sub> | PASS | expect accept (1 p): "1 page · 15.9 KB" | 0.4s |
| intake | pdfjs-bug1020226.pdf<br><sub>intake-quirks/pdfjs-bug1020226.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 0.4s |
| intake | pdfjs-encrypted-attachment.pdf<br><sub>intake-quirks/pdfjs-encrypted-attachment.pdf</sub> | PASS | expect password: "Password-protected - unlock it first"; warn: offers a password prompt (no password field on the card) | 0.4s |
| intake | pdfjs-issue21579.pdf<br><sub>intake-quirks/pdfjs-issue21579.pdf</sub> | PASS | expect password: "Password-protected - unlock it first"; warn: offers a password prompt (no password field on the card) | 0.4s |
| intake | pdfjs-issue3371.pdf<br><sub>intake-quirks/pdfjs-issue3371.pdf</sub> | PASS | expect password: "Password-protected - unlock it first"; warn: offers a password prompt (no password field on the card) | 0.4s |
| intake | pdfjs-jpx_smaskindata.pdf<br><sub>intake-quirks/pdfjs-jpx_smaskindata.pdf</sub> | PASS | expect accept (1 p): "1 page · 2.5 KB" | 0.4s |
| intake | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-395-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 0.4s |
| intake | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-742-0-fuzzed.pdf</sub> | PASS | expect reject: "Not a valid PDF" | 0.4s |
| intake | pdfjs-tracemonkey_with_annotations.pdf<br><sub>intake-quirks/pdfjs-tracemonkey_with_annotations.pdf</sub> | PASS | expect accept (14 p): "14 pages · 997.8 KB" | 0.4s |
| intake | pdfjs-xref_command_missing.pdf<br><sub>intake-quirks/pdfjs-xref_command_missing.pdf</sub> | PASS | expect accept (1 p): "1 page · 631 B" | 0.4s |
| intake | flipkart-invoice.pdf<br><sub>intake-invoices/flipkart-invoice.pdf</sub> | PASS | expect accept (1 p): "1 page · 43.7 KB" | 0.4s |
| intake | a-owner-only-attention.pdf<br><sub>intake-derived/a-owner-only-attention.pdf</sub> | FAIL | accepted: UI says "Password-protected - unlock it first" | 1.1s |
| intake | a-owner-only-us-budget.pdf<br><sub>intake-derived/a-owner-only-us-budget.pdf</sub> | FAIL | accepted: UI says "Password-protected - unlock it first" | 4.0s |
| intake | compare-tracemonkey-base.pdf<br><sub>intake-derived/compare-tracemonkey-base.pdf</sub> | PASS | expect accept (5 p): "5 pages · 456.2 KB" | 4.0s |
| intake | owner-only-aws-invoice.pdf<br><sub>intake-derived/owner-only-aws-invoice.pdf</sub> | FAIL | accepted: UI says "Password-protected - unlock it first" | 0.1s |
| intake | owner-only-irs-fw9.pdf<br><sub>intake-derived/owner-only-irs-fw9.pdf</sub> | FAIL | accepted: UI says "Password-protected - unlock it first" | 0.4s |
| intake | owner-only-tracemonkey.pdf<br><sub>intake-derived/owner-only-tracemonkey.pdf</sub> | FAIL | accepted: UI says "Password-protected - unlock it first" | 0.4s |
| intake | rot90-cropbox-bert.pdf<br><sub>intake-derived/rot90-cropbox-bert.pdf</sub> | PASS | expect accept (16 p): "16 pages · 647.9 KB" | 0.4s |
| intake | user-pw-TAMReview.pdf<br><sub>intake-derived/user-pw-TAMReview.pdf</sub> | PASS | expect password: "Password-protected - unlock it first"; warn: offers a password prompt (no password field on the card) | 0.4s |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf<br><sub>flow-merge</sub> | PASS | ready 0.9s, click to download 1.2s: Merged 2 files (30 pages, 1.54 MB) - download started. | 3.4s, heap 14 MB |
| compress | us-budget-2024.pdf<br><sub>flow-compress</sub> | PASS | ready 4.0s, click to download 88.2s: Created us-budget-2024-compressed.pdf (184 pages, 2.31 MB) - download started. | 93.4s, heap 30 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | PASS | ready 2.2s, click to download 0.9s: Created 2 PDFs (14 pages total) in swisspdf-split.zip (1013.9 KB) - download started. | 4.1s, heap 16 MB |
