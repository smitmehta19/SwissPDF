# Corpus scorecard: xfa-redact-t1c

Run: 2026-10-28 22:13 UTC, 4.3 min. Command: `npm run test:corpus -- --light --shards 2 --tool edittext --name xfa-redact-t1c`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **82 PASS, 3 FAIL, 0 SKIP** of 85 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| edittext | 82 | 3 | 0 | 128.3s |

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

## Failures by tool

- **edittext** (3): `edittext-para-justified-arxiv-1810-04805-bert` justified: every word reads back whole (model, spaces kept): pre-train; warn: justified: new text in MuPDF text, in orde; `edittext-para-word-then-para-arxiv-1810-04805-bert` every word reads back whole, in order: We introduce a new language representation MODEL again calle; `edittext-para-line-then-para-pdfjs-tracemonkey` no stretched lines (word gaps within 2x the source median or its widest gap): widest 6.04 vs limit 5.54

## All rows

| Tool | File | Result | Detail | Time |
|---|---|---|---|---|
| edittext | aws-invoice.pdf<br><sub>edittext-invoice-aws-invoice</sub> | PASS | "estimated" p1 (HelveticaNeue-Roman); model 642ms; same 183+7ms orig; longer 227+4ms orig; missing 239+3ms Helvetica | 5.2s, heap 9 MB |
| edittext | flipkart-invoice.pdf<br><sub>edittext-invoice-flipkart-invoice</sub> | PASS | "manufacturer" p1 (Times-Italic); model 593ms; same 135+5ms orig; longer 97+3ms orig; missing 159+3ms Times-Italic | 4.6s, heap 9 MB |
| edittext | azure-interior.pdf<br><sub>edittext-invoice-azure-interior</sub> | PASS | "Beeswax" p1 (Lato-Regular); model 53ms; same 88+4ms orig; longer 88+4ms orig; missing 91+4ms Helvetica | 1.3s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-report-pdfjs-tracemonkey</sub> | PASS | "Andreas" p1 (NimbusRomNo9L-Regu); model 151ms; same 379+21ms orig; longer 463+22ms orig; missing 500+17ms Times-Roman | 2.8s, heap 10 MB |
| edittext | arxiv-1706.03762-attention.pdf<br><sub>edittext-report-arxiv-1706-03762-attenti</sub> | PASS | "Provided" p1 (NimbusRomNo9L-Regu); model 80ms; same 245+145ms orig; longer 303+133ms orig; missing 499+118ms Times-Roman | 3.3s, heap 10 MB |
| edittext | us-budget-2024.pdf<br><sub>edittext-report-us-budget-2024</sub> | PASS | "summary" p3 (NewCenturySchlbkLTStd-Ro); model 284ms; same 593+694ms orig; longer 618+661ms orig; missing 917+688ms Times-Roman | 7.8s, heap 10 MB |
| edittext | irs-fw9.pdf<br><sub>edittext-rotated-irs-fw9</sub> | PASS | "Before" p1 (HelveticaNeueLTStd-Bd); model 113ms; same 347+11ms orig; longer 402+16ms orig; missing 603+18ms Helvetica-Bold | 2.1s, heap 9 MB |
| edittext | rot90-cropbox-bert.pdf<br><sub>edittext-rotated-rot90-cropbox-bert</sub> | PASS | "Kristina" p1 (NimbusRomNo9L-Medi); model 90ms; same 185+19ms orig; longer 287+19ms orig; missing 293+19ms Times-Bold | 1.9s, heap 10 MB |
| edittext | c-rot270-cropbox.pdf<br><sub>edittext-rotated-c-rot270-cropbox</sub> | PASS | "Type" p1 (NimbusRomNo9L-Medi); model 64ms; same 237+4ms orig; longer 185+4ms orig; missing 255+10ms Times-Bold | 1.3s, heap 10 MB |
| edittext | udhr-arabic.pdf<br><sub>edittext-intl-udhr-arabic</sub> | PASS | "اعتُمد" p1 (SegoeUI); model 36ms; same 2159+9ms NotoSansArabic-Regular overflow; longer 84+9ms NotoSansArabic-Regular overflow; missing 84+9ms NotoSansArabic-Regular overflow; warn: same: edit under 1.5 s (2159 ms); longer: new text in MuPDF text with every mark (a combining mark is missing) | 2.7s, heap 9 MB |
| edittext | udhr-chinese-simplified.pdf<br><sub>edittext-intl-udhr-chinese-simplified</sub> | PASS | "一九" p1 (ArialUnicodeMS+1); model 48ms; same 72+6ms orig; longer 102+9ms orig; missing 154+12ms NotoSansSC-Regular | 2.0s, heap 9 MB |
| edittext | edittext-hindi.pdf<br><sub>edittext-intl-edittext-hindi</sub> | PASS | "सावर्भौम" p1 (NotoSansDevanagari-Regular-2000); model 5ms; same 55+1ms NotoSansDevanagari-Regular; longer 110+1ms NotoSansDevanagari-Regular; missing 92+2ms NotoSansDevanagari-Regular; warn: same: new text in pdf.js text ("सार्भौवम" not found); longer: new text in pdf.js text ("सार्भौवमसावर्भौ" not found); missing: new text in pdf.js text ("साऋर्भौम" not found) | 0.4s, heap 9 MB |
| edittext | fax-jean-schmidt-doe.pdf<br><sub>edittext-refuse-scanned-fax-jean-schmidt-doe</sub> | PASS | model 30ms, 46 runs, refused "scanned" in 18ms | 0.1s, heap 9 MB |
| edittext | pdfjs-vertical.pdf<br><sub>edittext-refuse-vertical-pdfjs-vertical</sub> | PASS | model 2ms, 8 runs, refused "vertical" in 1ms | 0.1s, heap 9 MB |
| edittext | udhr-hebrew.pdf<br><sub>edittext-refuse-no-unicode-udhr-hebrew</sub> | PASS | model 76ms, 1191 runs, refused "no-unicode" in 34ms | 0.3s, heap 9 MB |
| edittext | aws-invoice.pdf<br><sub>edittext-batch-aws-invoice</sub> | PASS | 3 edits in 216ms; original, fallback shift 11.98, original | 0.4s, heap 10 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-fit-pdfjs-tracemonkey</sub> | PASS | "Andreas" -> +abc at 0.7059 in 321ms | 1.0s, heap 9 MB |
| edittext | aws-invoice.pdf<br><sub>edittext-overflow-short-usage</sub> | PASS | "Usage" -> "UQage" in "† Usage and recurring charges for this s": overflow false, pushed 2.09, fallback, ms {"edit":239,"save":1,"total":240} | 0.5s, heap 9 MB |
| edittext | aws-invoice.pdf<br><sub>edittext-overflow-short-check</sub> | PASS | "Check" -> "Checkabc" in "*** Check the GST statement attached at ": overflow false, pushed 13.34, original, ms {"edit":182,"save":3,"total":185} | 0.4s, heap 10 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-overflow-widest-tracemonkey</sub> | PASS | "and" -> "andabcdefgh" in "and is used for the application logic of": overflow true, pushed 32.86, original, ms {"edit":324,"save":4,"total":328} | 0.9s, heap 9 MB |
| edittext | arxiv-1706.03762-attention.pdf<br><sub>edittext-overflow-widest-attention</sub> | PASS | "less" -> "lessabcdefgh" in "less time to train. Our model achieves 2": overflow true, pushed 37.17, original, ms {"edit":154,"save":8,"total":162} | 1.3s, heap 10 MB |
| edittext | edittext-actualtext.pdf<br><sub>edittext-actualtext-synthetic</sub> | PASS | "PATIENTNAME" p1: jane fallback 57+2ms; delete null 5+1ms | 0.2s, heap 9 MB |
| edittext | us-budget-2024.pdf<br><sub>edittext-actualtext-us-budget</sub> | PASS | "foreclosures" p11: at original 725+661ms | 4.0s, heap 9 MB |
| edittext | edittext-whitebox.pdf<br><sub>edittext-whitebox-no-push</sub> | PASS | "Visible" p1: grow original fit 0.8549 noPush covered 52+1ms | 0.1s, heap 9 MB |
| edittext | edittext-tight.pdf<br><sub>edittext-tight-075</sub> | PASS | "Kilo" p1: grow tight-lines 12+1ms | 0.1s, heap 9 MB |
| edittext | edittext-tight.pdf<br><sub>edittext-tight-090</sub> | PASS | "Kilo" p2: grow fallback 18+1ms | 0.2s, heap 9 MB |
| edittext | edittext-inline.pdf<br><sub>edittext-inline-synthetic</sub> | PASS | "image" p1: ed fallback 61+1ms | 0.1s, heap 9 MB |
| edittext | edittext-tam.pdf<br><sub>edittext-inline-tam-password</sub> | PASS | "Indiana" p1: ed original 130+12ms | 0.5s, heap 9 MB |
| edittext | pdfjs-TAMReview.pdf<br><sub>edittext-inline-tam</sub> | PASS | "Indiana" p1: ed original 91+8ms | 0.4s, heap 9 MB |
| edittext | flipkart-invoice.pdf<br><sub>edittext-collision-flipkart-billing</sub> | PASS | "near Fun republic mall and nehru" p1: ed fallback fit 0.8575 noPush collision 90+2ms | 0.2s, heap 9 MB |
| edittext | arxiv-1706.03762-attention.pdf<br><sub>edittext-collision-attention-email</sub> | PASS | "noam@google.com" p1: ed fallback fit 0.9421 noPush collision 241+112ms | 0.9s, heap 9 MB |
| edittext | flipkart-invoice.pdf<br><sub>edittext-whole-line-flipkart-soldby</sub> | PASS | "WS Retail Services Pvt. Ltd :" p1: ed original 76+2ms | 0.5s, heap 9 MB |
| edittext | us-budget-2024.pdf<br><sub>edittext-covered-faint-us-budget</sub> | PASS | "OFFICE" p1: ed fallback 1538+727ms | 3.3s, heap 9 MB |
| edittext | flipkart-invoice.pdf<br><sub>edittext-pull-left-flipkart</sub> | PASS | "Services" p1: ed original 77+2ms | 0.2s, heap 9 MB |
| edittext | arxiv-1706.03762-attention.pdf<br><sub>edittext-centred-attention-title</sub> | PASS | "Attention Is All You Need" p1: ed fallback noPush aligned 357+137ms | 1.7s, heap 9 MB |
| edittext | aws-invoice.pdf<br><sub>edittext-repeat-aws-invoice</sub> | PASS | 10 edits 151/142/452/168/168/192/219/182/223/213 ms, finalize 8 ms, 148716 B vs 148679 B | 2.9s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-shorter-pdfjs-tracemonkey</sub> | PASS | p1-g12 (justify, 14 lines): shorter 7L original 1050+21ms; warn: shorter: new text in MuPDF text, in order ("Dynamic languages such as JavaScript are more diff" not found); shorter: new text in pdf.js text, in order (not found) | 2.0s, heap 9 MB |
| edittext | arxiv-1706.03762-attention.pdf<br><sub>edittext-para-shorter-arxiv-1706-03762-attenti</sub> | PASS | p1-g15 (justify, 15 lines): shorter 8L original 755+126ms; warn: shorter: new text in MuPDF text, in order ("The dominant sequence transduction models are base" not found); shorter: new text in pdf.js text, in order (not found) | 1.5s, heap 9 MB |
| edittext | arxiv-1810.04805-bert.pdf<br><sub>edittext-para-shorter-arxiv-1810-04805-bert</sub> | PASS | p1-g5 (justify, 15 lines): shorter 9L original 403+11ms; warn: shorter: new text in MuPDF text, in order ("We introduce a new language representation model c" not found); shorter: new text in pdf.js text, in order (not found) | 0.9s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-longer-pdfjs-tracemonkey</sub> | PASS | p1-g18 (left, 7 lines): longer 8L original 378+12ms; warn: longer: new text in MuPDF text, in order ("Permission to make digital or hard copies of all o" not found); longer: new text in pdf.js text, in order (not found) | 0.8s, heap 9 MB |
| edittext | arxiv-1512.03385-resnet.pdf<br><sub>edittext-para-longer-arxiv-1512-03385-resnet</sub> | PASS | p1-g27 (justify, 10 lines): longer 12L original 472+20ms; warn: longer: new text in MuPDF text, in order ("The degradation (of training accuracy) indicates t" not found); longer: new text in pdf.js text, in order (not found) | 1.6s, heap 9 MB |
| edittext | aws-invoice.pdf<br><sub>edittext-para-longer-aws-invoice</sub> | PASS | p1-g3 (left, 3 lines): longer 6L original 214+3ms; warn: longer: new text in MuPDF text, in order ("Amazon Web Services, Inc. 410 Terry Ave North Seat" not found); longer: new text in pdf.js text, in order (not found) | 1.4s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-justified-pdfjs-tracemonkey</sub> | PASS | p1-g12 (justify, 14 lines): justified 14L original fit 0.97 561+17ms; warn: justified: new text in MuPDF text, in order ("Dynamic languages such as JavaScript are more diff" not found); justified: new text in pdf.js text, in order (not found) | 1.7s, heap 9 MB |
| edittext | arxiv-1810.04805-bert.pdf<br><sub>edittext-para-justified-arxiv-1810-04805-bert</sub> | FAIL | justified: every word reads back whole (model, spaces kept): pre-train; warn: justified: new text in MuPDF text, in order ("We introduce a new language representation model c" not found); justified: new text in pdf.js text, in order (not found) | 0.6s, heap 10 MB |
| edittext | arxiv-1512.03385-resnet.pdf<br><sub>edittext-para-justified-arxiv-1512-03385-resnet</sub> | PASS | p1-g4 (justify, 15 lines): justified 15L original fit 0.94 597+12ms; warn: justified: new text in MuPDF text, in order ("Deeper neural networks are more difficult to train" not found); justified: new text in pdf.js text, in order (not found) | 1.2s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-bold-pdfjs-tracemonkey</sub> | PASS | p1-g13 (justify, 2 lines): bold 2L original 656+20ms; warn: bold: new text in MuPDF text, in order ("Categories and Subject Descriptors D.3.4 [Programm" not found); bold: new text in pdf.js text, in order (not found) | 1.5s, heap 9 MB |
| edittext | irs-fw9.pdf<br><sub>edittext-para-bold-irs-fw9</sub> | PASS | p1-g8 (left, 2 lines): bold 2L original 468+27ms; warn: bold: new text in MuPDF text, in order ("1 Name of entity/individual. An entry is required." not found); bold: new text in pdf.js text, in order (not found) | 1.7s, heap 9 MB |
| edittext | arxiv-1706.03762-attention.pdf<br><sub>edittext-para-bold-arxiv-1706-03762-attenti</sub> | PASS | p1-g10 (left, 3 lines): bold 3L original 243+140ms | 1.4s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-noroom-pdfjs-tracemonkey</sub> | PASS | p1-g2 (centre, 3 lines): noroom refused no-room 168ms | 0.6s, heap 9 MB |
| edittext | arxiv-1810.04805-bert.pdf<br><sub>edittext-para-noroom-arxiv-1810-04805-bert</sub> | PASS | p1-g5 (justify, 15 lines): noroom refused no-room 202ms | 0.5s, heap 10 MB |
| edittext | arxiv-1512.03385-resnet.pdf<br><sub>edittext-para-noroom-arxiv-1512-03385-resnet</sub> | PASS | p1-g4 (justify, 15 lines): noroom refused no-room 228ms | 0.6s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-swap-pdfjs-tracemonkey</sub> | PASS | p1-g12 (justify, 14 lines): swap 14L original 684+26ms; warn: swap: new text in MuPDF text, in order ("Dynamic languages such as JavaScript are more diff" not found); swap: new text in pdf.js text, in order (not found) | 2.2s, heap 9 MB |
| edittext | arxiv-1706.03762-attention.pdf<br><sub>edittext-para-swap-arxiv-1706-03762-attenti</sub> | PASS | p1-g15 (justify, 15 lines): swap 15L original 262+76ms; warn: swap: new text in MuPDF text, in order ("The dominant sequence transduction models are base" not found); swap: new text in pdf.js text, in order (not found) | 1.3s, heap 10 MB |
| edittext | arxiv-1810.04805-bert.pdf<br><sub>edittext-para-swap-arxiv-1810-04805-bert</sub> | PASS | p1-g5 (justify, 15 lines): swap 15L original 329+11ms; warn: swap: new text in MuPDF text, in order ("We introduce a new language representation model c" not found); swap: new text in pdf.js text, in order (not found) | 7.6s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-authors-pdfjs-tracemonkey</sub> | PASS | p1-g2 (centre, 3 lines): authors 3L original 508+18ms | 1.7s, heap 9 MB |
| edittext | edittext-struct.pdf<br><sub>edittext-para-struct-synthetic</sub> | PASS | p1-g0 (left, 3 lines): replace 3L mixed 106+1ms; delete deleted 16+5ms | 0.2s, heap 9 MB |
| edittext | us-budget-2024.pdf<br><sub>edittext-para-struct-us-budget</sub> | PASS | p3-g4 (justify, 8 lines): replace 9L original 886+678ms; delete deleted 820+708ms; warn: replace: new text in MuPDF text, in order ("Appendix, Budget of the United States Government, " not found); replace: new text in pdf.js text, in order (not found) | 10.6s, heap 9 MB |
| edittext | edittext-decor-frame.pdf<br><sub>edittext-para-decor-frame</sub> | PASS | p1-g0 (left, 3 lines): grow refused no-room 88ms | 0.2s, heap 9 MB |
| edittext | edittext-decor-grid.pdf<br><sub>edittext-para-decor-grid</sub> | PASS | p1-g0 (left, 3 lines): grow refused no-room 76ms | 0.4s, heap 9 MB |
| edittext | edittext-decor-underline.pdf<br><sub>edittext-para-decor-underline</sub> | PASS | p1-g0 (left, 3 lines): shorter 3L original 90+1ms | 0.2s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-word-then-para-pdfjs-tracemonkey</sub> | PASS | "statically" -> "STATICALLY", then p1-g12 14L original 1773ms | 2.9s, heap 10 MB |
| edittext | arxiv-1810.04805-bert.pdf<br><sub>edittext-para-word-then-para-arxiv-1810-04805-bert</sub> | FAIL | every word reads back whole, in order: We introduce a new language representation MODEL again calle | 1.5s, heap 10 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-twice-pdfjs-tracemonkey</sub> | PASS | 8L 963ms, 8L 1059ms; final 8 lines | 3.3s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-order-title-pdfjs-tracemonkey</sub> | PASS |  | 0.8s, heap 10 MB |
| edittext | arxiv-1706.03762-attention.pdf<br><sub>edittext-para-order-attention-intro</sub> | PASS | p2-g1 (justify, 5 lines): intro 5L original 436+136ms; warn: intro: new text in MuPDF text, in order ("Recurrent neural networks, long short-term memory " not found); intro: new text in pdf.js text, in order (not found) | 4.6s, heap 9 MB |
| edittext | irs-fw9.pdf<br><sub>edittext-order-w9-company</sub> | PASS | order appended | 0.6s, heap 10 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-abstract-twice-pdfjs-tracemonkey</sub> | PASS | para 14L win [13,13] 549ms; para 11L win [10,13] 706ms | 2.3s, heap 9 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-line-then-para-pdfjs-tracemonkey</sub> | FAIL | no stretched lines (word gaps within 2x the source median or its widest gap): widest 6.04 vs limit 5.54 | 5.0s, heap 10 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-right-col-delete-pdfjs-tracemonkey</sub> | PASS | p1-g20 (justify, 12 lines): del 10L original 1039+19ms; warn: del: new text in MuPDF text, in order ("Compilers for statically typed languages rely on t" not found); del: new text in pdf.js text, in order (not found) | 1.6s, heap 9 MB |
| edittext | coolblue.pdf<br><sub>edittext-para-coolblue-address</sub> | PASS | word L win null 43ms; para 4L win [1,2] 205ms | 0.6s, heap 9 MB |
| edittext | edittext-decor-underline.pdf<br><sub>edittext-decor-underline-word</sub> | PASS |  | 0.1s, heap 10 MB |
| edittext | edittext-decor-underline.pdf<br><sub>edittext-para-decor-underline-append</sub> | PASS | p1-g0 (left, 3 lines): append 4L original 121+2ms; warn: append: new text in MuPDF text, in order ("The quick brown fox jumps over the lazy dog and ke" not found); append: new text in pdf.js text, in order (not found) | 0.2s, heap 10 MB |
| edittext | edittext-decor-underline.pdf<br><sub>edittext-para-decor-underline-change</sub> | PASS | p1-g0 (left, 3 lines): change refused decorated 46ms | 0.1s, heap 9 MB |
| edittext | irs-fw9.pdf<br><sub>edittext-xfa-fw9-partnership</sub> | PASS |  | 0.6s, heap 10 MB |
| edittext | edittext-struct2.pdf<br><sub>edittext-para-struct-keep-others</sub> | PASS | p1-g0 (left, 3 lines): delete deleted 12+2ms | 0.3s, heap 10 MB |
| edittext | pdfjs-tracemonkey.pdf<br><sub>edittext-para-delete-pdfjs-tracemonkey</sub> | PASS | p1-g2 (centre, 3 lines): delete deleted 596+20ms | 1.2s, heap 10 MB |
| edittext | aws-invoice.pdf<br><sub>edittext-para-delete-aws-invoice</sub> | PASS | p1-g0 (left, 4 lines): delete deleted 148+4ms | 0.4s, heap 9 MB |
| edittext | arxiv-1810.04805-bert.pdf<br><sub>edittext-para-delete-arxiv-1810-04805-bert</sub> | PASS | p1-g5 (justify, 15 lines): delete deleted 840+20ms | 1.4s, heap 10 MB |
| edittext | pdfjs-ArabicCIDTrueType.pdf<br><sub>edittext-para-rtl-longer-arabic-cid</sub> | PASS | p1-g3 (right, 1 lines): rtl 2L mixed 67+2ms; warn: rtl: new text in pdf.js text, in order (not found) | 0.4s, heap 9 MB |
| edittext | udhr-arabic.pdf<br><sub>edittext-para-rtl-shorter-udhr-arabic</sub> | PASS | p1-g15 (right, 1 lines): rtl 1L original 63+6ms; warn: rtl: new text in pdf.js text, in order (not found) | 0.3s, heap 9 MB |
| edittext | udhr-arabic.pdf<br><sub>edittext-para-rtl-noroom-udhr-arabic</sub> | PASS | p1-g15 (right, 1 lines): rtl refused no-room 67ms | 0.6s, heap 9 MB |
| edittext | pdfjs-ArabicCIDTrueType.pdf<br><sub>edittext-para-rtl-bold-arabic-cid</sub> | PASS | p1-g3 (right, 1 lines): bold 2L mixed 66+1ms; warn: bold: new text in pdf.js text, in order (not found); bold: re-read as an editable paragraph (not found) | 0.1s, heap 9 MB |
| edittext | udhr-arabic.pdf<br><sub>edittext-rtl-push-udhr-arabic</sub> | PASS | "لمّا": push pushed -9.4 111ms; pull pushed 4.15 118ms | 0.5s, heap 9 MB |
| edittext | edittext-form-inline.pdf<br><sub>edittext-p2-form-inline</sub> | PASS |  | 0.1s, heap 9 MB |
| edittext | edittext-signed.pdf<br><sub>edittext-signed-aws-invoice</sub> | PASS | "estimated" edited in 188ms, signature removed | 0.4s, heap 9 MB |
