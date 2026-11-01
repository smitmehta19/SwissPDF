# Corpus scorecard: 2026-10-28-p2-ui-noparagraph-quick

Run: 2026-10-28 23:09 UTC, 2.5 min. Command: `npm run test:corpus -- --quick --light --shards 2 --name 2026-10-28-p2-ui-noparagraph-quick`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **33 PASS, 165 FAIL, 0 SKIP** of 198 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| word2pdf | 4 | 1 | 0 | 44.9s |
| excel2pdf | 1 | 1 | 0 | 2.0s |
| ppt2pdf | 1 | 1 | 0 | 1.6s |
| html2pdf | 1 | 2 | 0 | 2.2s |
| merge | 4 | 1 | 0 | 11.8s |
| split | 1 | 2 | 0 | 1.0s |
| extract | 0 | 1 | 0 | 0.1s |
| remove | 1 | 0 | 0 | 0.8s |
| rotate | 0 | 1 | 0 | 0.1s |
| organize | 1 | 0 | 0 | 1.4s |
| compress | 2 | 2 | 0 | 6.3s |
| repair | 0 | 3 | 0 | 0.2s |
| watermark | 2 | 1 | 0 | 1.3s |
| pagenumbers | 2 | 4 | 0 | 1.8s |
| sign | 3 | 1 | 0 | 2.1s |
| crop | 1 | 2 | 0 | 0.6s |
| edit | 2 | 1 | 0 | 1.5s |
| protect | 2 | 1 | 0 | 1.7s |
| unlock | 2 | 2 | 0 | 2.7s |
| ocr | 3 | 3 | 0 | 94.5s |
| pdf2word | 0 | 6 | 0 | 0.2s |
| pdf2excel | 0 | 2 | 0 | 0.1s |
| pdf2ppt | 0 | 2 | 0 | 0.1s |
| pdf2md | 0 | 2 | 0 | 0.1s |
| img2pdf | 0 | 4 | 0 | 0.1s |
| pdf2img | 0 | 2 | 0 | 0.1s |
| redact | 0 | 30 | 0 | 1.3s |
| forms | 0 | 6 | 0 | 0.3s |
| compare | 0 | 4 | 0 | 0.2s |
| health | 0 | 1 | 0 | 0.1s |
| automate | 0 | 5 | 0 | 0.3s |
| edittext | 0 | 6 | 0 | 2.6s |
| autorotate | 0 | 3 | 0 | 0.1s |
| nup | 0 | 3 | 0 | 0.1s |
| booklet | 0 | 1 | 0 | 0.0s |
| scale | 0 | 3 | 0 | 0.1s |
| singlepage | 0 | 1 | 0 | 0.0s |
| overlay | 0 | 1 | 0 | 0.0s |
| stamp | 0 | 2 | 0 | 0.1s |
| removeblank | 0 | 2 | 0 | 0.0s |
| linearize | 0 | 2 | 0 | 0.1s |
| adjustcolors | 0 | 1 | 0 | 0.0s |
| replacecolors | 0 | 1 | 0 | 0.0s |
| bookmarks | 0 | 1 | 0 | 0.0s |
| metadata | 0 | 1 | 0 | 0.0s |
| attachments | 0 | 1 | 0 | 0.0s |
| removeannots | 0 | 1 | 0 | 0.0s |
| removeimages | 0 | 1 | 0 | 0.0s |
| extractimages | 0 | 2 | 0 | 0.1s |
| flatten | 0 | 1 | 0 | 0.0s |
| unlockforms | 0 | 1 | 0 | 0.0s |
| sanitize | 0 | 1 | 0 | 0.0s |
| permissions | 0 | 1 | 0 | 0.0s |
| info | 0 | 1 | 0 | 0.0s |
| autorename | 0 | 1 | 0 | 0.0s |
| showjs | 0 | 1 | 0 | 0.0s |
| intake | 0 | 31 | 0 | 18.3s |

## Audit findings (docs/research/swisspdf-audit.md)

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Intake rejects owner-only (restriction) encrypted files | NOT REPRODUCED | 1 linked check(s) passed, e.g. merge-owner-only: passed |
| 2 | Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages | NOT TESTED | no corpus case |
| 3 | Redact search misses phrases split across text items | NOT TESTED | no corpus case |
| 4 | Every render reopens + copies the whole file (large-file cost) | NOT TESTED | no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large |
| 5 | Redact re-parses the source per untouched page | NOT TESTED | internal cost; covered indirectly by redact timing |
| 6 | Compress: lossless only / Maximum rasterizes text | SOFT WARN | soft only, 1 linked check(s) passed; warn: compress-lincoln-scan: shrinks a scanned/image-heavy file by 10%+ (saved 1%) |
| 7 | pdf-lib intake rejects damaged files viewers open | NOT TESTED | no corpus case |
| 8 | Stamps/edits ignore rotation, CropBox and MediaBox origin | NOT REPRODUCED | 10 linked check(s) passed, e.g. watermark-tracemonkey: mark inside the visible page; watermark-rotation-quirk: mark inside the visible page |
| 9 | Only WinAnsi fonts: non-Latin text throws | NOT TESTED | no corpus case |
| 10 | OCR English only, assets from CDN (not offline) | NOT REPRODUCED | 2 linked check(s) passed, e.g. ocr-fax-printed: no network fetches outside the page origin; g2-ocr-geometry: no network fetches outside the page origin |
| 11 | OCR re-OCRs born-digital pages, no deskew, fixed DPI | NOT REPRODUCED | 4 linked check(s) passed, e.g. g2-ocr-geometry: upright: words placed on the scan; g2-ocr-geometry: turned: words placed on the scan |
| 12 | Merge/split drop outlines, AcroForm, links | NOT REPRODUCED | 1 linked check(s) passed, e.g. merge-outlines: bookmarks kept |
| 13 | Crop rejects rotated, ignores box origin | NOT REPRODUCED | 1 linked check(s) passed, e.g. crop-rotation-quirk: crop lands inside the visible page |
| 14 | Edit is overlay-only | NOT TESTED | feature gap (no text editing API to call) |
| 15 | PDF to Word interleaves columns, no borderless tables, RTL | NOT TESTED | no corpus case |
| 16 | PDF to Excel number parsing loses leading zeros / formats | NOT TESTED | no corpus case |
| 17 | PDF to PPT slides are flat images, fixed slide size | NOT TESTED | no corpus case |
| 18 | Office to PDF quick mode is screenshots (no text) | NOT TESTED | no corpus case |
| 19 | HiFi engine from unpinned CDN, font substitution | SOFT WARN | soft only, 1 linked check(s) passed; warn: office-engine-load: no fetches outside the page origin (cdn.zetaoffice.net) |
| 20 | pdf.js without cMapUrl / standard fonts / wasm | NOT TESTED | no corpus case |
| 21 | Forms: XFA not handled, slow widget map | NOT TESTED | no corpus case |
| 22 | Protect: comma in password splits MuPDF options | NOT REPRODUCED | 3 linked check(s) passed, e.g. protect-comma-password: comma password refused with a clear message; g2-protect-permissions-only: printing and copying blocked |
| 23 | Image to PDF: EXIF, HEIC, pixel-as-point page size | CONFIRMED | img2pdf-heic-libheif-example.heic: image decoded (browserContext.newPage: Target crashed )<br>img2pdf-heic-libheif-example.heic: image decoded: browserContext.newPage: Target crashed <br>img2pdf-photo-castle-3456x2628.jpg: image decoded (browserContext.newPage: Target crashed )<br>(+3 more) |
| 24 | Sign is visual only, one placement | NOT REPRODUCED | 3 linked check(s) passed, e.g. g3-sign-multi-rot90: signature and initials on page 1; g3-sign-multi-rot90: initials on every page, where placed |
| 25 | Redact rasterizes whole pages (size balloons) | NOT TESTED | no corpus case |
| 26 | Repair rebuild drops outlines/AcroForm/metadata | NOT TESTED | no corpus case |
| 27 | Compare by page index only; inserted page breaks the rest | CONFIRMED | compare-inserted-page: compare runs (browserContext.newPage: Target crashed )<br>compare-inserted-page: compare runs: browserContext.newPage: Target crashed  |
| 28 | HTML to PDF is a screenshot, head styles dropped | NOT REPRODUCED | 4 linked check(s) passed, e.g. i-html2pdf-hifi-styled-report: no remote fetches (stylesheet, @import, images); i-html2pdf-hifi-styled-report: selectable text (90%+ of the source words) |
| 29 | Split/batch outputs and ZIP all in memory | NOT TESTED | memory profile of very large splits not measured in U0 |
| 30 | assertValidOutput re-parses outputs with pdf-lib | NOT TESTED | internal double parse; see timings |
| 31 | Unlock: one password per batch, MuPDF docs not destroyed | NOT TESTED | per-file password is UI only; destroy() leak not measured |
| 32 | Watermark centring is a 45 degree approximation | NOT TESTED | centring at non-45 angles not measured |
| 33 | Page numbers: no skip/template/Bates | NOT REPRODUCED | 3 linked check(s) passed, e.g. g3-pagenumbers-template-skip: skipped pages carry no number; g3-pagenumbers-template-skip: page 3 reads "Seite 1 von 12" |
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

- **word2pdf** (1): `word2pdf-quick-poi-sample.docx` error: browserContext.newPage: Target crashed 
- **excel2pdf** (1): `excel2pdf-quick-poi-SampleSS.xlsx` error: browserContext.newPage: Target crashed 
- **ppt2pdf** (1): `ppt2pdf-quick-poi-SampleShow.pptx` error: browserContext.newPage: Target crashed 
- **html2pdf** (2): `html2pdf-tracemonkey-text` error: browserContext.newPage: Target crashed ; `i-html2pdf-quick-styled-report` error: browserContext.newPage: Target crashed 
- **merge** (1): `flow-merge` error: browserContext.newPage: Target crashed 
- **split** (2): `split-tracemonkey` error: browserContext.newPage: Target crashed ; `flow-split` error: browserContext.newPage: Target crashed 
- **extract** (1): `extract-budget-1-3-5` error: browserContext.newPage: Target crashed 
- **rotate** (1): `rotate-rotation-quirk` error: browserContext.newPage: Target crashed 
- **compress** (2): `compress-llama2` error: browserContext.newPage: Target crashed ; `flow-compress` error: browserContext.newPage: Target crashed 
- **repair** (3): `repair-xref-missing` fails gracefully: browserContext.newPage: Target crashed  (but pdf.js/MuPDF open the input); `repair-fuzzed-742` fails gracefully: browserContext.newPage: Target crashed ; `g2-repair-keeps-fields` error: browserContext.newPage: Target crashed 
- **watermark** (1): `watermark-rot90-cropbox` error: browserContext.newPage: Target crashed 
- **pagenumbers** (4): `pagenumbers-tracemonkey` error: browserContext.newPage: Target crashed ; `pagenumbers-rot90-cropbox` error: browserContext.newPage: Target crashed ; `g3-pagenumbers-facing` error: browserContext.newPage: Target crashed ; `g3-pagenumbers-bates-rot90` error: browserContext.newPage: Target crashed 
- **sign** (1): `sign-rot90-cropbox` error: browserContext.newPage: Target crashed 
- **crop** (2): `crop-tracemonkey` error: browserContext.newPage: Target crashed ; `crop-rot90-cropbox` error: browserContext.newPage: Target crashed 
- **edit** (1): `edit-rot90-cropbox` error: browserContext.newPage: Target crashed 
- **protect** (1): `protect-tracemonkey` error: browserContext.newPage: Target crashed 
- **unlock** (2): `unlock-issue3371` error: browserContext.newPage: Target crashed ; `unlock-user-pw-TAMReview` error: browserContext.newPage: Target crashed 
- **ocr** (3): `g2-ocr-scan-chinese` error: browserContext.newPage: Target crashed ; `g2-ocr-fax-force` error: browserContext.newPage: Target crashed ; `g2-ocr-skip-text-pages` error: browserContext.newPage: Target crashed 
- **pdf2word** (6): `pdf2word-tracemonkey-2col` error: browserContext.newPage: Target crashed ; `pdf2word-aws-invoice` error: browserContext.newPage: Target crashed ; `h-word-tracemonkey-columns` error: browserContext.newPage: Target crashed ; `h-word-aws-tables` error: browserContext.newPage: Target crashed ; `h-word-arabic-cid-logical` error: browserContext.newPage: Target crashed ; `h-word-jpeg-scan-ndl` error: browserContext.newPage: Target crashed 
- **pdf2excel** (2): `pdf2excel-aws-invoice` error: browserContext.newPage: Target crashed ; `h-excel-aws-typed` error: browserContext.newPage: Target crashed 
- **pdf2ppt** (2): `pdf2ppt-tracemonkey` error: browserContext.newPage: Target crashed ; `h-ppt-tracemonkey-editable` error: browserContext.newPage: Target crashed 
- **pdf2md** (2): `pdf2md-tracemonkey` error: browserContext.newPage: Target crashed ; `h-md-tracemonkey-columns` error: browserContext.newPage: Target crashed 
- **img2pdf** (4): `img2pdf-heic-libheif-example.heic` image decoded: browserContext.newPage: Target crashed ; `img2pdf-photo-castle-3456x2628.jpg` image decoded: browserContext.newPage: Target crashed ; `img2pdf-tiff-multipage.tiff` image decoded: browserContext.newPage: Target crashed ; `img2pdf-webp-hopper.webp` image decoded: browserContext.newPage: Target crashed 
- **pdf2img** (2): `pdf2img-tracemonkey` error: browserContext.newPage: Target crashed ; `pdf2img-rot90-cropbox` error: browserContext.newPage: Target crashed 
- **redact** (30): `redact-tracemonkey` error: browserContext.newPage: Target crashed ; `redact-rot90-cropbox` error: browserContext.newPage: Target crashed ; `g3-redact-remove-tracemonkey` error: browserContext.newPage: Target crashed ; `g3-redact-remove-rot90-cropbox` error: browserContext.newPage: Target crashed ; `g3-redact-remove-origin-shift` error: browserContext.newPage: Target crashed ; `g3-redact-hidden-secretname-remove` error: browserContext.newPage: Target crashed ; +24 more
- **forms** (6): `forms-list-irs-fw9` error: browserContext.newPage: Target crashed ; `forms-list-xfa-issue14315` error: browserContext.newPage: Target crashed ; `forms-fill-f1040` error: browserContext.newPage: Target crashed ; `forms-fill-flatten-fw4` error: browserContext.newPage: Target crashed ; `g3-forms-inspect-xfa-issue14315` error: browserContext.newPage: Target crashed ; `g3-forms-fill-xfa-irs-fw9` error: browserContext.newPage: Target crashed 
- **compare** (4): `compare-same-file` compare runs: browserContext.newPage: Target crashed ; `compare-inserted-page` compare runs: browserContext.newPage: Target crashed ; `g2-compare-inserted-overlay` error: browserContext.newPage: Target crashed ; `g2-compare-removed-page` error: browserContext.newPage: Target crashed 
- **health** (1): `health-selftest` error: browserContext.newPage: Target crashed 
- **automate** (5): `s3-share-pdfjs-tracemonkey` error: browserContext.newPage: Target crashed ; `s3-mail-pdfjs-tracemonkey` error: browserContext.newPage: Target crashed ; `s3-draft-pdfjs-tracemonkey` error: browserContext.newPage: Target crashed ; `s3-batch-draft-3` error: browserContext.newPage: Target crashed ; `s3-batch-share-one-fails` error: browserContext.newPage: Target crashed 
- **edittext** (6): `edittext-invoice-aws-invoice` error: browserContext.newPage: Target crashed ; `edittext-report-pdfjs-tracemonkey` error: browserContext.newPage: Target crashed ; `edittext-rotated-irs-fw9` error: browserContext.newPage: Target crashed ; `edittext-intl-udhr-arabic` error: browserContext.newPage: Target crashed ; `edittext-intl-udhr-chinese-simplified` error: browserContext.newPage: Target crashed ; `edittext-intl-edittext-hindi` error: browserContext.newPage: Target crashed 
- **autorotate** (3): `g2-autorotate-fax-90` error: browserContext.newPage: Target crashed ; `g2-autorotate-lincoln-90` error: browserContext.newPage: Target crashed ; `g2-autorotate-konoye-90` error: browserContext.newPage: Target crashed 
- **nup** (3): `u5a-nup4-tracemonkey` error: browserContext.newPage: Target crashed ; `u5a-nup9-a4-rot90-cropbox` error: browserContext.newPage: Target crashed ; `u5a-nup2-raw-attention` error: browserContext.newPage: Target crashed 
- **booklet** (1): `u5a-booklet-tracemonkey` error: browserContext.newPage: Target crashed 
- **scale** (3): `u5a-scale-a4-fit-tracemonkey` error: browserContext.newPage: Target crashed ; `u5a-scale-letter-landscape-rot270` error: browserContext.newPage: Target crashed ; `u5a-scale-half-raw-attention` error: browserContext.newPage: Target crashed 
- **singlepage** (1): `u5a-single-tracemonkey` error: browserContext.newPage: Target crashed 
- **overlay** (1): `u5a-overlay-interleaved-tracemonkey-aws` error: browserContext.newPage: Target crashed 
- **stamp** (2): `u5a-stamp-topright-tokens-tracemonkey` error: browserContext.newPage: Target crashed ; `u5a-stamp-bottomleft-rot90-cropbox` error: browserContext.newPage: Target crashed 
- **removeblank** (2): `u5a-blank-fax-inserted` error: browserContext.newPage: Target crashed ; `u5a-blank-lincoln-real` error: browserContext.newPage: Target crashed 
- **linearize** (2): `u5a-lin-tracemonkey` error: browserContext.newPage: Target crashed ; `u5a-lin-us-budget-objstm` error: browserContext.newPage: Target crashed 
- **adjustcolors** (1): `u5a-adjust-contrast-fax` error: browserContext.newPage: Target crashed 
- **replacecolors** (1): `u5a-replace-invert-fax` error: browserContext.newPage: Target crashed 
- **bookmarks** (1): `u5b-bookmarks-outlines-se` error: browserContext.newPage: Target crashed 
- **metadata** (1): `u5b-metadata-tracemonkey` error: browserContext.newPage: Target crashed 
- **attachments** (1): `u5b-attachments-tracemonkey` error: browserContext.newPage: Target crashed 
- **removeannots** (1): `u5b-removeannots-tracemonkey` error: browserContext.newPage: Target crashed 
- **removeimages** (1): `u5b-removeimages-tracemonkey` error: browserContext.newPage: Target crashed 
- **extractimages** (2): `u5b-extractimages-aws` error: browserContext.newPage: Target crashed ; `u5b-extractimages-cmyk-png` error: browserContext.newPage: Target crashed 
- **flatten** (1): `u5b-flatten-fw9` error: browserContext.newPage: Target crashed 
- **unlockforms** (1): `u5b-unlockforms-fw9` error: browserContext.newPage: Target crashed 
- **sanitize** (1): `u5b-sanitize-fw9` error: browserContext.newPage: Target crashed 
- **permissions** (1): `u5b-permissions-owner-only-aws` error: browserContext.newPage: Target crashed 
- **info** (1): `u5b-info-tracemonkey` error: browserContext.newPage: Target crashed 
- **autorename** (1): `u5b-autorename-tracemonkey` error: browserContext.newPage: Target crashed 
- **showjs** (1): `u5b-showjs-fw9` error: browserContext.newPage: Target crashed 
- **intake** (31): `intake-forms/annotation-button-widget.pdf` UI shows a result: browserContext.newPage: Target crashed ; `intake-forms/irs-fw9.pdf` UI shows a result: browserContext.newPage: Target crashed ; `intake-forms/xfa-issue14315.pdf` UI shows a result: browserContext.newPage: Target crashed ; `intake-scanned/lincoln-ellsworth-letter-1861.pdf` UI shows a result: browserContext.newPage: Target crashed ; `intake-reports/arxiv-2005.14165-gpt3.pdf` UI shows a result: browserContext.newPage: Target crashed ; `intake-reports/us-budget-2024.pdf` UI shows a result: browserContext.newPage: Target crashed ; +25 more

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| word2pdf | -<br><sub>office-engine-load</sub> | PASS | engine loaded; warn: no fetches outside the page origin (cdn.zetaoffice.net) | 17.8s, heap 29 MB |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-hifi-poi-SampleSS.xlsx</sub> | PASS | 2 pages, 17 KB, text coverage 1.00 | 2.0s, heap 27 MB |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-hifi-poi-SampleShow.pptx</sub> | PASS | 2 pages, 30 KB, text coverage 1.00 | 1.6s, heap 28 MB |
| word2pdf | poi-sample.docx<br><sub>word2pdf-hifi-poi-sample.docx</sub> | PASS | 1 pages, 12 KB, text coverage 1.00 | 1.1s, heap 30 MB |
| word2pdf | -<br><sub>i-engine-pinned-warm-boot</sub> | PASS | cold boot 16218 ms (download 4544 ms, cache false), warm boot 8952 ms | 25.2s, heap 42 MB |
| word2pdf | poi-sample.docx<br><sub>i-hifi-convert-no-network</sub> | PASS |  | 0.8s, heap 42 MB |
| html2pdf | -<br><sub>i-html2pdf-hifi-styled-report</sub> | PASS | 1 page(s), 43 KB, 763 ms, coverage 0.98 | 2.0s, heap 42 MB |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf + arxiv-1512.03385-resnet.pdf<br><sub>merge-reports</sub> | PASS | 42 pages, 2.2 MB | 5.7s, heap 20 MB |
| merge | pdfjs-rotation.pdf + pdfjs-hello_world_rotated.pdf + rot90-cropbox-bert.pdf<br><sub>merge-rotated</sub> | PASS | 23 pages, 648 KB | 0.5s, heap 20 MB |
| merge | pdfjs-nested_outline.pdf + us-budget-2024.pdf<br><sub>merge-outlines</sub> | PASS | 193 pages, 1.9 MB | 3.0s, heap 45 MB |
| merge | owner-only-tracemonkey.pdf + pdfjs-TAMReview.pdf<br><sub>merge-owner-only</sub> | PASS | 37 pages, 1.5 MB | 2.5s, heap 16 MB |
| split | pdfjs-tracemonkey.pdf<br><sub>split-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| split | rot90-cropbox-bert.pdf<br><sub>split-rot90-cropbox</sub> | PASS | 16 pages -> 8 + 8 | 0.9s, heap 9 MB |
| extract | us-budget-2024.pdf<br><sub>extract-budget-1-3-5</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| remove | pdfjs-tracemonkey.pdf<br><sub>remove-tracemonkey-p1</sub> | PASS | 13 pages out | 0.8s, heap 9 MB |
| rotate | pdfjs-rotation.pdf<br><sub>rotate-rotation-quirk</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| organize | pdfjs-tracemonkey.pdf<br><sub>organize-reverse-tracemonkey</sub> | PASS | 14 pages out | 1.4s, heap 9 MB |
| compress | lincoln-ellsworth-letter-1861.pdf<br><sub>compress-lincoln-scan</sub> | PASS | 529 KB -> 526 KB (99%); warn: shrinks a scanned/image-heavy file by 10%+ (saved 1%) | 1.3s, heap 9 MB |
| compress | arxiv-2307.09288-llama2.pdf<br><sub>compress-llama2</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| compress | pdfjs-tracemonkey.pdf<br><sub>compress-raster-tracemonkey</sub> | PASS | 992 KB -> 992 KB (100%), kept original | 4.9s, heap 13 MB |
| repair | pdfjs-xref_command_missing.pdf<br><sub>repair-xref-missing</sub> | FAIL | fails gracefully: browserContext.newPage: Target crashed  (but pdf.js/MuPDF open the input) | 0.1s |
| repair | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>repair-fuzzed-742</sub> | FAIL | fails gracefully: browserContext.newPage: Target crashed  | 0.1s |
| repair | irs-fw9.pdf<br><sub>g2-repair-keeps-fields</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| watermark | pdfjs-tracemonkey.pdf<br><sub>watermark-tracemonkey</sub> | PASS | 14 marks | 1.2s, heap 9 MB |
| watermark | pdfjs-rotation.pdf<br><sub>watermark-rotation-quirk</sub> | PASS | 2 marks | 0.1s, heap 14 MB |
| watermark | rot90-cropbox-bert.pdf<br><sub>watermark-rot90-cropbox</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>pagenumbers-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| pagenumbers | pdfjs-rotation.pdf<br><sub>pagenumbers-rotation-quirk</sub> | PASS |  | 0.8s, heap 9 MB |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>pagenumbers-rot90-cropbox</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-template-skip</sub> | PASS |  | 0.7s, heap 12 MB |
| pagenumbers | pdfjs-tracemonkey.pdf<br><sub>g3-pagenumbers-facing</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| pagenumbers | rot90-cropbox-bert.pdf<br><sub>g3-pagenumbers-bates-rot90</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| sign | pdfjs-tracemonkey.pdf<br><sub>sign-tracemonkey</sub> | PASS | centre (0.50, 0.85) | 1.6s, heap 9 MB |
| sign | pdfjs-rotation.pdf<br><sub>sign-rotation-quirk</sub> | PASS | centre (0.50, 0.85) | 0.1s, heap 12 MB |
| sign | rot90-cropbox-bert.pdf<br><sub>sign-rot90-cropbox</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| sign | rot90-cropbox-bert.pdf<br><sub>g3-sign-multi-rot90</sub> | PASS |  | 0.3s, heap 12 MB |
| crop | pdfjs-tracemonkey.pdf<br><sub>crop-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| crop | pdfjs-rotation.pdf<br><sub>crop-rotation-quirk</sub> | PASS | CropBox 61,317,367,713 | 0.4s, heap 9 MB |
| crop | rot90-cropbox-bert.pdf<br><sub>crop-rot90-cropbox</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| edit | pdfjs-tracemonkey.pdf<br><sub>edit-tracemonkey</sub> | PASS |  | 1.4s, heap 9 MB |
| edit | pdfjs-rotation.pdf<br><sub>edit-rotation-quirk</sub> | PASS |  | 0.1s, heap 13 MB |
| edit | rot90-cropbox-bert.pdf<br><sub>edit-rot90-cropbox</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| protect | pdfjs-tracemonkey.pdf<br><sub>protect-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| protect | pdfjs-TAMReview.pdf<br><sub>protect-comma-password</sub> | PASS | refused: Passwords cannot contain a comma. | 0.8s |
| protect | pdfjs-tracemonkey.pdf<br><sub>g2-protect-permissions-only</sub> | PASS | Standard V5 R6 256-bit AES, {"print":false,"copy":false,"edit":true,"annotate":true,"form":true,"assemble":true,"print-hq":false} | 0.9s, heap 10 MB |
| unlock | pdfjs-issue3371.pdf<br><sub>unlock-issue3371</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| unlock | user-pw-TAMReview.pdf<br><sub>unlock-user-pw-TAMReview</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| unlock | owner-only-tracemonkey.pdf<br><sub>unlock-owner-only-tracemonkey</sub> | PASS | removed: printing, high-quality printing, copying text | 1.5s, heap 9 MB |
| unlock | a-owner-only-us-budget.pdf<br><sub>g2-unlock-owner-only-fast</sub> | PASS | 321 ms, removed: printing, copying text, editing | 1.1s, heap 11 MB |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>ocr-fax-printed</sub> | PASS | 414 words, sample "10/25/2008 15:38 FAX 202 225 1992 Congresswoman Sc" | 18.8s, heap 10 MB |
| ocr | pdfjs-tracemonkey.pdf<br><sub>g2-ocr-geometry</sub> | PASS | upright 46/47 median 1.7pt; turned 45/46 median 1.6pt; rot90crop 46/47 median 1.5pt; skew 41/43 median 1.8pt | 64.2s, heap 13 MB |
| ocr | udhr-chinese-simplified.pdf<br><sub>g2-ocr-scan-chinese</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-fax-force</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| ocr | sub-darwin-p10-11.pdf<br><sub>g2-ocr-skip-text-pages</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| ocr | fax-jean-schmidt-doe.pdf<br><sub>g2-ocr-cancel</sub> | PASS | stopped at 3009 ms during "Page 1 of 2, recognizing", next run 348 words | 11.4s, heap 13 MB |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>pdf2word-tracemonkey-2col</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2word | aws-invoice.pdf<br><sub>pdf2word-aws-invoice</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2word | pdfjs-tracemonkey.pdf<br><sub>h-word-tracemonkey-columns</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2word | aws-invoice.pdf<br><sub>h-word-aws-tables</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2word | pdfjs-ArabicCIDTrueType.pdf<br><sub>h-word-arabic-cid-logical</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2word | sub-ndl-konoye-p1.pdf<br><sub>h-word-jpeg-scan-ndl</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2excel | aws-invoice.pdf<br><sub>pdf2excel-aws-invoice</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2excel | aws-invoice.pdf<br><sub>h-excel-aws-typed</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>pdf2ppt-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2ppt | pdfjs-tracemonkey.pdf<br><sub>h-ppt-tracemonkey-editable</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>pdf2md-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2md | pdfjs-tracemonkey.pdf<br><sub>h-md-tracemonkey-columns</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| excel2pdf | poi-SampleSS.xlsx<br><sub>excel2pdf-quick-poi-SampleSS.xlsx</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| ppt2pdf | poi-SampleShow.pptx<br><sub>ppt2pdf-quick-poi-SampleShow.pptx</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| word2pdf | poi-sample.docx<br><sub>word2pdf-quick-poi-sample.docx</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| img2pdf | heic-libheif-example.heic<br><sub>img2pdf-heic-libheif-example.heic</sub> | FAIL | image decoded: browserContext.newPage: Target crashed  | 0.0s |
| img2pdf | photo-castle-3456x2628.jpg<br><sub>img2pdf-photo-castle-3456x2628.jpg</sub> | FAIL | image decoded: browserContext.newPage: Target crashed  | 0.0s |
| img2pdf | tiff-multipage.tiff<br><sub>img2pdf-tiff-multipage.tiff</sub> | FAIL | image decoded: browserContext.newPage: Target crashed  | 0.0s |
| img2pdf | webp-hopper.webp<br><sub>img2pdf-webp-hopper.webp</sub> | FAIL | image decoded: browserContext.newPage: Target crashed  | 0.0s |
| pdf2img | pdfjs-tracemonkey.pdf<br><sub>pdf2img-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| pdf2img | rot90-cropbox-bert.pdf<br><sub>pdf2img-rot90-cropbox</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | pdfjs-tracemonkey.pdf<br><sub>redact-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | rot90-cropbox-bert.pdf<br><sub>redact-rot90-cropbox</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-remove-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | rot90-cropbox-bert.pdf<br><sub>g3-redact-remove-rot90-cropbox</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | origin-shift-aws-invoice.pdf<br><sub>g3-redact-remove-origin-shift</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-secretname.pdf<br><sub>g3-redact-hidden-secretname-image</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | xfa-imm1344e-filled.pdf<br><sub>g3-redact-xfa-imm1344e</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | irs-fw9.pdf<br><sub>g3-redact-xfa-template-irs-fw9-search-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-secretname.pdf<br><sub>g3-redact-box-word-keeps-outside-secretname</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-revision.pdf<br><sub>g3-redact-earlier-version-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-leak-objr.pdf<br><sub>g3-redact-leak-objr-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-leak-replies.pdf<br><sub>g3-redact-leak-replies-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-leak-inherited.pdf<br><sub>g3-redact-leak-inherited-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-leak-sharedPhoto.pdf<br><sub>g3-redact-leak-sharedPhoto-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-leak-bdc.pdf<br><sub>g3-redact-leak-bdc-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| redact | redact-leak-lineArt.pdf<br><sub>g3-redact-leak-lineArt-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| redact | redact-leak-pattern.pdf<br><sub>g3-redact-leak-pattern-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| redact | redact-leak-hiddenLayer.pdf<br><sub>g3-redact-leak-hiddenLayer-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| redact | redact-leak-carriers.pdf<br><sub>g3-redact-leak-carriers-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-leak-ocmd.pdf<br><sub>g3-redact-leak-ocmd-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-leak-shading.pdf<br><sub>g3-redact-leak-shading-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-leak-mesh.pdf<br><sub>g3-redact-leak-mesh-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| redact | redact-leak-type3Shared.pdf<br><sub>g3-redact-leak-type3Shared-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | redact-leak-nameDests.pdf<br><sub>g3-redact-leak-nameDests-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | free-fiber.pdf<br><sub>g3-redact-shared-resources-free-fiber-remove</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | uk-IPPH353.pdf<br><sub>g3-redact-phrase-split-ipph353</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| redact | quality-hosting.pdf<br><sub>g3-redact-patterns-quality-hosting</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| redact | pdfjs-tracemonkey.pdf<br><sub>g3-redact-whole-page-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| redact | irs-fw9.pdf<br><sub>g3-redact-form-value-fw9</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| forms | irs-fw9.pdf<br><sub>forms-list-irs-fw9</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| forms | xfa-issue14315.pdf<br><sub>forms-list-xfa-issue14315</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| forms | irs-f1040.pdf<br><sub>forms-fill-f1040</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| forms | irs-fw4.pdf<br><sub>forms-fill-flatten-fw4</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| forms | xfa-issue14315.pdf<br><sub>g3-forms-inspect-xfa-issue14315</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| forms | irs-fw9.pdf<br><sub>g3-forms-fill-xfa-irs-fw9</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-base.pdf<br><sub>compare-same-file</sub> | FAIL | compare runs: browserContext.newPage: Target crashed  | 0.0s |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>compare-inserted-page</sub> | FAIL | compare runs: browserContext.newPage: Target crashed  | 0.1s |
| compare | compare-tracemonkey-base.pdf + compare-tracemonkey-inserted.pdf<br><sub>g2-compare-inserted-overlay</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| compare | pdfjs-tracemonkey.pdf<br><sub>g2-compare-removed-page</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| html2pdf | pdfjs-tracemonkey.pdf<br><sub>html2pdf-tracemonkey-text</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| html2pdf | -<br><sub>i-html2pdf-quick-styled-report</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| health | -<br><sub>health-selftest</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-share-pdfjs-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-mail-pdfjs-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| automate | pdfjs-tracemonkey.pdf<br><sub>s3-draft-pdfjs-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| automate | pdfjs-tracemonkey.pdf + aws-invoice.pdf + irs-fw9.pdf<br><sub>s3-batch-draft-3</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| automate | pdfjs-tracemonkey.pdf + xfa-imm1344e-filled.pdf + aws-invoice.pdf<br><sub>s3-batch-share-one-fails</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| edittext | aws-invoice.pdf<br><sub>edittext-invoice-aws-invoice</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.3s |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-report-pdfjs-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.9s |
| edittext | irs-fw9.pdf<br><sub>edittext-rotated-irs-fw9</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.6s |
| edittext | udhr-arabic.pdf<br><sub>edittext-intl-udhr-arabic</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.4s |
| edittext | udhr-chinese-simplified.pdf<br><sub>edittext-intl-udhr-chinese-simplified</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.3s |
| edittext | edittext-hindi.pdf<br><sub>edittext-intl-edittext-hindi</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| autorotate | fax-jean-schmidt-doe.pdf<br><sub>g2-autorotate-fax-90</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| autorotate | lincoln-ellsworth-letter-1861.pdf<br><sub>g2-autorotate-lincoln-90</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| autorotate | sub-ndl-konoye-p1.pdf<br><sub>g2-autorotate-konoye-90</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| nup | pdfjs-tracemonkey.pdf<br><sub>u5a-nup4-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| nup | rot90-cropbox-bert.pdf<br><sub>u5a-nup9-a4-rot90-cropbox</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| nup | arxiv-1706.03762-attention.pdf<br><sub>u5a-nup2-raw-attention</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| booklet | pdfjs-tracemonkey.pdf<br><sub>u5a-booklet-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| scale | pdfjs-tracemonkey.pdf<br><sub>u5a-scale-a4-fit-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| scale | c-rot270-cropbox.pdf<br><sub>u5a-scale-letter-landscape-rot270</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| scale | arxiv-1706.03762-attention.pdf<br><sub>u5a-scale-half-raw-attention</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| singlepage | pdfjs-tracemonkey.pdf<br><sub>u5a-single-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| overlay | pdfjs-tracemonkey.pdf + aws-invoice.pdf<br><sub>u5a-overlay-interleaved-tracemonkey-aws</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| stamp | pdfjs-tracemonkey.pdf<br><sub>u5a-stamp-topright-tokens-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| stamp | rot90-cropbox-bert.pdf<br><sub>u5a-stamp-bottomleft-rot90-cropbox</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| removeblank | fax-jean-schmidt-doe.pdf<br><sub>u5a-blank-fax-inserted</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| removeblank | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-blank-lincoln-real</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| linearize | pdfjs-tracemonkey.pdf<br><sub>u5a-lin-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| linearize | us-budget-2024.pdf<br><sub>u5a-lin-us-budget-objstm</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
| adjustcolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-adjust-contrast-fax</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| replacecolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-replace-invert-fax</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| bookmarks | pdfjs-outlines_se.pdf<br><sub>u5b-bookmarks-outlines-se</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| metadata | pdfjs-tracemonkey.pdf<br><sub>u5b-metadata-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| attachments | pdfjs-tracemonkey.pdf<br><sub>u5b-attachments-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| removeannots | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5b-removeannots-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| removeimages | pdfjs-tracemonkey.pdf<br><sub>u5b-removeimages-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| extractimages | aws-invoice.pdf<br><sub>u5b-extractimages-aws</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| extractimages | pdfjs-cmykjpeg.pdf<br><sub>u5b-extractimages-cmyk-png</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| flatten | irs-fw9.pdf<br><sub>u5b-flatten-fw9</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| unlockforms | irs-fw9.pdf<br><sub>u5b-unlockforms-fw9</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| sanitize | irs-fw9.pdf<br><sub>u5b-sanitize-fw9</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| permissions | owner-only-aws-invoice.pdf<br><sub>u5b-permissions-owner-only-aws</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| info | pdfjs-tracemonkey.pdf<br><sub>u5b-info-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| autorename | pdfjs-tracemonkey.pdf<br><sub>u5b-autorename-tracemonkey</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| showjs | irs-fw9.pdf<br><sub>u5b-showjs-fw9</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| intake | annotation-button-widget.pdf<br><sub>intake-forms/annotation-button-widget.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.0s |
| intake | irs-fw9.pdf<br><sub>intake-forms/irs-fw9.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.2s |
| intake | xfa-issue14315.pdf<br><sub>intake-forms/xfa-issue14315.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.2s |
| intake | lincoln-ellsworth-letter-1861.pdf<br><sub>intake-scanned/lincoln-ellsworth-letter-1861.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.2s |
| intake | arxiv-2005.14165-gpt3.pdf<br><sub>intake-reports/arxiv-2005.14165-gpt3.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 1.7s |
| intake | us-budget-2024.pdf<br><sub>intake-reports/us-budget-2024.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 1.7s |
| intake | pdfjs-ArabicCIDTrueType.pdf<br><sub>intake-intl/pdfjs-ArabicCIDTrueType.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 1.8s |
| intake | udhr-arabic.pdf<br><sub>intake-intl/udhr-arabic.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 2.1s |
| intake | pdf20-image-bpc.pdf<br><sub>intake-quirks/pdf20-image-bpc.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.1s |
| intake | pdf20-utf8-test.pdf<br><sub>intake-quirks/pdf20-utf8-test.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.1s |
| intake | pdfjs-annotation-highlight-without-appearance.pdf<br><sub>intake-quirks/pdfjs-annotation-highlight-without-appearance.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.1s |
| intake | pdfjs-bug1020226.pdf<br><sub>intake-quirks/pdfjs-bug1020226.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.1s |
| intake | pdfjs-encrypted-attachment.pdf<br><sub>intake-quirks/pdfjs-encrypted-attachment.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.3s |
| intake | pdfjs-issue21579.pdf<br><sub>intake-quirks/pdfjs-issue21579.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.3s |
| intake | pdfjs-issue3371.pdf<br><sub>intake-quirks/pdfjs-issue3371.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.3s |
| intake | pdfjs-jpx_smaskindata.pdf<br><sub>intake-quirks/pdfjs-jpx_smaskindata.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.3s |
| intake | pdfjs-poppler-395-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-395-0-fuzzed.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.0s |
| intake | pdfjs-poppler-742-0-fuzzed.pdf<br><sub>intake-quirks/pdfjs-poppler-742-0-fuzzed.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.0s |
| intake | pdfjs-tracemonkey_with_annotations.pdf<br><sub>intake-quirks/pdfjs-tracemonkey_with_annotations.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.3s |
| intake | pdfjs-xref_command_missing.pdf<br><sub>intake-quirks/pdfjs-xref_command_missing.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.3s |
| intake | flipkart-invoice.pdf<br><sub>intake-invoices/flipkart-invoice.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.4s |
| intake | a-owner-only-attention.pdf<br><sub>intake-derived/a-owner-only-attention.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.8s |
| intake | a-owner-only-us-budget.pdf<br><sub>intake-derived/a-owner-only-us-budget.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 1.7s |
| intake | compare-tracemonkey-base.pdf<br><sub>intake-derived/compare-tracemonkey-base.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 2.2s |
| intake | edittext-form-inline.pdf<br><sub>intake-derived/edittext-form-inline.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.0s |
| intake | edittext-struct.pdf<br><sub>intake-derived/edittext-struct.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.0s |
| intake | owner-only-aws-invoice.pdf<br><sub>intake-derived/owner-only-aws-invoice.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.2s |
| intake | owner-only-irs-fw9.pdf<br><sub>intake-derived/owner-only-irs-fw9.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.5s |
| intake | owner-only-tracemonkey.pdf<br><sub>intake-derived/owner-only-tracemonkey.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.5s |
| intake | sub-lincoln-p3-4.pdf<br><sub>intake-derived/sub-lincoln-p3-4.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 0.5s |
| intake | user-pw-TAMReview.pdf<br><sub>intake-derived/user-pw-TAMReview.pdf</sub> | FAIL | UI shows a result: browserContext.newPage: Target crashed  | 1.0s |
| merge | pdfjs-tracemonkey.pdf + arxiv-1810.04805-bert.pdf<br><sub>flow-merge</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| compress | pdfjs-tracemonkey.pdf<br><sub>flow-compress</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.0s |
| split | pdfjs-tracemonkey.pdf<br><sub>flow-split</sub> | FAIL | error: browserContext.newPage: Target crashed  | 0.1s |
