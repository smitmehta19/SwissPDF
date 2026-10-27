# Corpus scorecard: u5a-final

Run: 2026-10-27 01:14 UTC, 4.7 min. Command: `npm run test:corpus -- --tool nup,booklet,scale,singlepage,overlay,stamp,removeblank,linearize,adjustcolors,replacecolors --name u5a-final`.
Env: Node v24.20.0, win32 10.0.26200, 20 CPUs, 32 GB RAM, Chromium (Playwright, headless).
Totals: **77 PASS, 0 FAIL, 0 SKIP** of 77 rows.

Layers: `ops` = app ops from `src/lib` run in the page on real files; `ui` = file sent through the real file input on `#/merge`, UI text recorded; `flow` = full UI flow with the real download. Every output is reopened in Node with pdf.js (legacy, with cmaps) and MuPDF. "warn:" in Detail = soft check failed (evidence for an audit finding, does not fail the row).

## Per-tool summary

| Tool | Pass | Fail | Skip | Time |
|---|---|---|---|---|
| nup | 11 | 0 | 0 | 18.8s |
| booklet | 8 | 0 | 0 | 14.0s |
| scale | 10 | 0 | 0 | 11.7s |
| singlepage | 7 | 0 | 0 | 16.5s |
| overlay | 5 | 0 | 0 | 6.2s |
| stamp | 9 | 0 | 0 | 6.8s |
| removeblank | 6 | 0 | 0 | 33.2s |
| linearize | 8 | 0 | 0 | 15.1s |
| adjustcolors | 5 | 0 | 0 | 34.0s |
| replacecolors | 8 | 0 | 0 | 11.5s |

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
| nup | pdfjs-tracemonkey.pdf<br><sub>u5a-nup4-tracemonkey</sub> | PASS | 14 pages on 4 sheets, 2x2, 1.0 MB | 3.7s, heap 14 MB |
| nup | aws-invoice.pdf<br><sub>u5a-nup2-aws-invoice</sub> | PASS | 1 pages on 1 sheets, 2x1, 0.1 MB | 0.3s, heap 16 MB |
| nup | arxiv-1706.03762-attention.pdf<br><sub>u5a-nup6-cols-rtl-attention</sub> | PASS | 15 pages on 3 sheets, 3x2, 1.8 MB | 3.7s, heap 40 MB |
| nup | rot90-cropbox-bert.pdf<br><sub>u5a-nup9-a4-rot90-cropbox</sub> | PASS | 16 pages on 2 sheets, 3x3, 0.7 MB | 0.7s, heap 35 MB |
| nup | c-rot270-cropbox.pdf<br><sub>u5a-nup4-rot270-cropbox</sub> | PASS | 2 pages on 1 sheets, 2x2, 0.2 MB | 0.2s, heap 33 MB |
| nup | origin-shift-aws-invoice.pdf<br><sub>u5a-nup2-origin-shift</sub> | PASS | 1 pages on 1 sheets, 2x1, 0.1 MB | 0.1s, heap 37 MB |
| nup | c-mixed.pdf<br><sub>u5a-nup3x2-custom-mixed</sub> | PASS | 5 pages on 1 sheets, 3x2, 0.5 MB | 0.3s, heap 38 MB |
| nup | arxiv-2307.09288-llama2.pdf<br><sub>u5a-nup16-llama2</sub> | PASS | 77 pages on 5 sheets, 4x4, 13.2 MB | 5.8s, heap 44 MB |
| nup | arxiv-1706.03762-attention.pdf<br><sub>u5a-nup2-raw-attention</sub> | PASS | 15 pages on 8 sheets, 2x1, 1.8 MB | 2.8s, heap 40 MB |
| nup | irs-fw9.pdf<br><sub>u5a-nup2-filled-fw9</sub> | PASS | 6 pages on 3 sheets, 2x1, 0.1 MB | 0.5s, heap 40 MB |
| nup | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5a-nup4-comments-tracemonkey</sub> | PASS | 14 pages on 4 sheets, 2x2, 1.0 MB | 0.7s, heap 37 MB |
| booklet | pdfjs-tracemonkey.pdf<br><sub>u5a-booklet-tracemonkey</sub> | PASS | 14 pages on 4 sheets, first sides -\|1 / 2\|- | 1.8s, heap 8 MB |
| booklet | aws-invoice.pdf<br><sub>u5a-booklet-aws-invoice</sub> | PASS | 1 pages on 1 sheets, first sides -\|1 / -\|- | 0.2s, heap 16 MB |
| booklet | arxiv-1706.03762-attention.pdf<br><sub>u5a-booklet-attention-spine-right-gutter</sub> | PASS | 15 pages on 4 sheets, first sides 1\|- / 15\|2 | 3.5s, heap 36 MB |
| booklet | c-mixed.pdf<br><sub>u5a-booklet-mixed-fronts</sub> | PASS | 5 pages on 2 sheets, first sides -\|1 / -\|3 | 0.3s, heap 35 MB |
| booklet | rot90-cropbox-bert.pdf<br><sub>u5a-booklet-long-edge-rot90-a4</sub> | PASS | 16 pages on 4 sheets, first sides 16\|1 / 2\|15 | 0.4s, heap 41 MB |
| booklet | arxiv-2307.09288-llama2.pdf<br><sub>u5a-booklet-llama2</sub> | PASS | 77 pages on 20 sheets, first sides -\|1 / 2\|- | 4.6s, heap 40 MB |
| booklet | arxiv-1706.03762-attention.pdf<br><sub>u5a-booklet-raw-attention</sub> | PASS | 15 pages on 4 sheets, first sides -\|1 / 2\|15 | 2.6s, heap 58 MB |
| booklet | irs-fw9.pdf<br><sub>u5a-booklet-filled-fw9</sub> | PASS | 6 pages on 2 sheets, first sides -\|1 / 2\|- | 0.5s, heap 59 MB |
| scale | pdfjs-tracemonkey.pdf<br><sub>u5a-scale-a4-fit-tracemonkey</sub> | PASS | 14 pages, first 595x842 pt | 4.1s, heap 8 MB |
| scale | aws-invoice.pdf<br><sub>u5a-scale-half-aws-invoice</sub> | PASS | 1 pages, first 306x396 pt | 0.2s, heap 15 MB |
| scale | arxiv-1706.03762-attention.pdf<br><sub>u5a-scale-a3-attention</sub> | PASS | 15 pages, first 842x1191 pt | 3.5s, heap 38 MB |
| scale | c-rot270-cropbox.pdf<br><sub>u5a-scale-letter-landscape-rot270</sub> | PASS | 2 pages, first 792x612 pt | 0.1s, heap 27 MB |
| scale | rot90-cropbox-bert.pdf<br><sub>u5a-scale-a4-rot90-cropbox</sub> | PASS | 16 pages, first 842x595 pt | 0.4s, heap 30 MB |
| scale | origin-shift-aws-invoice.pdf<br><sub>u5a-scale-a5-origin-shift</sub> | PASS | 1 pages, first 420x595 pt | 0.1s, heap 23 MB |
| scale | c-mixed.pdf<br><sub>u5a-scale-150pc-mixed</sub> | PASS | 5 pages, first 918x1188 pt | 0.2s, heap 24 MB |
| scale | arxiv-1706.03762-attention.pdf<br><sub>u5a-scale-half-raw-attention</sub> | PASS | 15 pages, first 306x396 pt | 2.0s, heap 28 MB |
| scale | irs-fw9.pdf<br><sub>u5a-scale-a4-filled-fw9</sub> | PASS | 6 pages, first 595x842 pt | 0.4s, heap 31 MB |
| scale | pdfjs-tracemonkey_with_annotations.pdf<br><sub>u5a-scale-a4-comments-tracemonkey</sub> | PASS | 14 pages, first 595x842 pt | 0.6s, heap 28 MB |
| singlepage | pdfjs-tracemonkey.pdf<br><sub>u5a-single-tracemonkey</sub> | PASS | 14 pages, 612 x 11088 pt | 1.7s, heap 8 MB |
| singlepage | aws-invoice.pdf<br><sub>u5a-single-aws-invoice</sub> | PASS | 1 pages, 612 x 792 pt | 0.2s, heap 16 MB |
| singlepage | arxiv-1706.03762-attention.pdf<br><sub>u5a-single-attention</sub> | PASS | 15 pages, 612 x 11880 pt | 3.8s, heap 31 MB |
| singlepage | c-mixed.pdf<br><sub>u5a-single-mixed</sub> | PASS | 5 pages, 792 x 2902 pt | 0.3s, heap 35 MB |
| singlepage | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-single-lincoln-scan-scaled</sub> | PASS | 36 pages, 330 x 14399 pt, scaled 79% | 0.5s, heap 41 MB |
| singlepage | arxiv-2307.09288-llama2.pdf<br><sub>u5a-single-llama2-scaled</sub> | PASS | 77 pages, 145 x 14399 pt, scaled 24% | 6.7s, heap 33 MB |
| singlepage | arxiv-1706.03762-attention.pdf<br><sub>u5a-single-raw-attention</sub> | PASS | 15 pages, 612 x 11880 pt | 3.3s, heap 45 MB |
| overlay | pdfjs-tracemonkey.pdf + aws-invoice.pdf<br><sub>u5a-overlay-interleaved-tracemonkey-aws</sub> | PASS | 14 pages, interleaved, foreground | 2.2s, heap 8 MB |
| overlay | c-rot270-cropbox.pdf + aws-invoice.pdf<br><sub>u5a-overlay-background-rot270</sub> | PASS | 2 pages, interleaved, background | 0.3s, heap 13 MB |
| overlay | arxiv-1706.03762-attention.pdf + aws-invoice.pdf<br><sub>u5a-overlay-sequential-attention-aws</sub> | PASS | 15 pages, sequential, foreground | 2.3s, heap 24 MB |
| overlay | rot90-cropbox-bert.pdf + origin-shift-aws-invoice.pdf<br><sub>u5a-overlay-repeat3-rot90-origin</sub> | PASS | 16 pages, repeat, foreground | 0.5s, heap 26 MB |
| overlay | pdfjs-tracemonkey.pdf + aws-invoice.pdf<br><sub>u5a-overlay-background-empty-page</sub> | PASS | 15 pages, interleaved, background | 0.9s, heap 23 MB |
| stamp | pdfjs-tracemonkey.pdf<br><sub>u5a-stamp-topright-tokens-tracemonkey</sub> | PASS |  | 2.1s, heap 8 MB |
| stamp | aws-invoice.pdf<br><sub>u5a-stamp-arabic-aws</sub> | PASS |  | 1.1s, heap 14 MB |
| stamp | arxiv-1706.03762-attention.pdf<br><sub>u5a-stamp-pages-2-3-attention</sub> | PASS |  | 2.2s, heap 21 MB |
| stamp | rot90-cropbox-bert.pdf<br><sub>u5a-stamp-bottomleft-rot90-cropbox</sub> | PASS |  | 0.3s, heap 29 MB |
| stamp | c-rot270-cropbox.pdf<br><sub>u5a-stamp-cjk-rot270</sub> | PASS |  | 0.3s, heap 28 MB |
| stamp | origin-shift-aws-invoice.pdf<br><sub>u5a-stamp-turned45-origin-shift</sub> | PASS |  | 0.1s, heap 31 MB |
| stamp | c-rot270-cropbox.pdf<br><sub>u5a-stamp-image-centre-rot270</sub> | PASS |  | 0.2s, heap 31 MB |
| stamp | c-mixed.pdf<br><sub>u5a-stamp-mixed-rotations</sub> | PASS |  | 0.2s, heap 34 MB |
| stamp | aws-invoice.pdf<br><sub>u5a-stamp-long-text-aws</sub> | PASS |  | 0.1s, heap 12 MB |
| removeblank | fax-jean-schmidt-doe.pdf<br><sub>u5a-blank-fax-inserted</sub> | PASS | found 1, 3 (inserted 1, 3) in 2.9 s | 4.4s, heap 10 MB |
| removeblank | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-blank-lincoln-real</sub> | PASS | found 4, 7, 8, 9, 12, 16, 20, 22, 25, 26, 27, 28, 29, 30, 31, 32 (inserted none) in 11.3 s | 11.6s, heap 11 MB |
| removeblank | c-mixed.pdf<br><sub>u5a-blank-mixed-inserted</sub> | PASS | found 3, 6 (inserted 3, 6) in 0.3 s | 0.7s, heap 10 MB |
| removeblank | pdfjs-tracemonkey.pdf<br><sub>u5a-blank-tracemonkey-none</sub> | PASS | found none (inserted none) in 0.4 s | 0.7s, heap 11 MB |
| removeblank | handwritten-field-trips-notebook-1950.pdf<br><sub>u5a-blank-notebook-handwriting-none</sub> | PASS | found none (inserted none) in 4.8 s | 5.2s, heap 13 MB |
| removeblank | fips-document-facsimile-transmission.pdf<br><sub>u5a-blank-fips-real</sub> | PASS | found 6, 71 (inserted none) in 8.8 s | 10.7s, heap 14 MB |
| linearize | pdfjs-tracemonkey.pdf<br><sub>u5a-lin-tracemonkey</sub> | PASS | 14 pages, 5 packed objects, 0.95 MB from 0.97 MB (0.98x), page 1 loads 177 -> 153 KB, 181 ms | 1.4s, heap 8 MB |
| linearize | aws-invoice.pdf<br><sub>u5a-lin-aws-invoice</sub> | PASS | 1 pages, 3 packed objects, 0.15 MB from 0.15 MB (1.00x), 36 ms | 0.5s, heap 13 MB |
| linearize | arxiv-1706.03762-attention.pdf<br><sub>u5a-lin-attention</sub> | PASS | 15 pages, 193 packed objects, 1.94 MB from 2.11 MB (0.92x), page 1 loads 340 -> 166 KB, 833 ms | 1.3s, heap 10 MB |
| linearize | rot90-cropbox-bert.pdf<br><sub>u5a-lin-rot90-cropbox</sub> | PASS | 16 pages, 178 packed objects, 0.69 MB from 0.63 MB (1.09x), 72 ms | 0.3s, heap 26 MB |
| linearize | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-lin-lincoln-relinearize</sub> | PASS | 36 pages, 6 packed objects, 0.52 MB from 0.52 MB (1.00x), 17 ms | 0.2s, heap 24 MB |
| linearize | arxiv-2307.09288-llama2.pdf<br><sub>u5a-lin-llama2</sub> | PASS | 77 pages, 653 packed objects, 12.88 MB from 13.03 MB (0.99x), page 1 loads 366 -> 232 KB, 1128 ms | 4.5s, heap 26 MB |
| linearize | us-budget-2024.pdf<br><sub>u5a-lin-us-budget-objstm</sub> | PASS | 184 pages, 25770 packed objects, 2.57 MB from 2.31 MB (1.11x), page 1 loads 313 -> 295 KB, 2920 ms | 4.4s, heap 38 MB |
| linearize | fdic-quarterly-banking-profile-2023q4.pdf<br><sub>u5a-lin-fdic-objstm</sub> | PASS | 44 pages, 20859 packed objects, 1.31 MB from 1.29 MB (1.02x), page 1 loads 250 -> 258 KB, 1927 ms | 2.5s, heap 46 MB |
| adjustcolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-adjust-contrast-fax</sub> | PASS | layers, change 21/24, worst MuPDF p2 mean 1.02 p99 2, 186 KB from 186 KB, 47 ms | 2.2s, heap 12 MB |
| adjustcolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-adjust-desat-lincoln</sub> | PASS | layers, change 17, worst MuPDF p1 mean 0.76 p99 2, 537 KB from 529 KB, 86 ms | 2.5s, heap 10 MB |
| adjustcolors | c-mixed.pdf<br><sub>u5a-adjust-bright-mixed</sub> | PASS | layers, change 36/37, worst MuPDF p1 mean 0.18 p99 1, 480 KB from 478 KB, 43 ms | 1.0s, heap 10 MB |
| adjustcolors | pdfjs-tracemonkey.pdf<br><sub>u5a-adjust-dark-tracemonkey</sub> | PASS | layers, change 72, worst pdf.js p1 mean 0.1 p99 1, 946 KB from 992 KB, 212 ms | 0.8s, heap 13 MB |
| adjustcolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-adjust-saturate-images-lincoln</sub> | PASS | images, change 16/20, worst MuPDF p2 mean 2.06 p99 8, 1949 KB from 529 KB, 25465 ms | 27.5s, heap 19 MB |
| replacecolors | fax-jean-schmidt-doe.pdf<br><sub>u5a-replace-invert-fax</sub> | PASS | layers, change 224/243, worst pdf.js p2 mean 0.52 p99 0, 186 KB from 186 KB, 26 ms | 1.5s, heap 8 MB |
| replacecolors | pdfjs-tracemonkey.pdf<br><sub>u5a-replace-invert-tracemonkey</sub> | PASS | layers, change 228, worst MuPDF p1 mean 0.37 p99 0, 946 KB from 992 KB, 220 ms | 0.8s, heap 11 MB |
| replacecolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-replace-yellow-on-black-lincoln</sub> | PASS | layers, change 96/83, worst pdf.js p3 mean 0.37 p99 2, 537 KB from 529 KB, 75 ms | 3.3s, heap 11 MB |
| replacecolors | c-mixed.pdf<br><sub>u5a-replace-white-on-black-mixed</sub> | PASS | layers, change 234/234/227, worst MuPDF p1 mean 0.29 p99 1, 480 KB from 478 KB, 32 ms | 1.0s, heap 10 MB |
| replacecolors | aws-invoice.pdf<br><sub>u5a-replace-custom-aws</sub> | PASS | layers, change 12, worst MuPDF p1 mean 0.4 p99 1, 148 KB from 151 KB, 11 ms | 0.3s, heap 10 MB |
| replacecolors | lincoln-ellsworth-letter-1861.pdf<br><sub>u5a-replace-grayscale-lincoln</sub> | PASS | layers, change 29/27, worst MuPDF p1 mean 0.02 p99 1, 533 KB from 529 KB, 64 ms | 3.6s, heap 13 MB |
| replacecolors | c-rot270-cropbox.pdf<br><sub>u5a-replace-green-on-black-rot270</sub> | PASS | layers, change 234, worst pdf.js p1 mean 0.03 p99 1, 206 KB from 205 KB, 12 ms | 0.6s, heap 10 MB |
| replacecolors | aws-invoice.pdf<br><sub>u5a-replace-invert-empty-page</sub> | PASS | layers, change 255/238, worst MuPDF p1 mean 0.37 p99 0, 148 KB from 147 KB, 6 ms | 0.5s, heap 10 MB |
