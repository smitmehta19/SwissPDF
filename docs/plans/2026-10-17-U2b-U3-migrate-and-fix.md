# U2b + U3: migrate every tool to the shell and fix it on real files

Status: APPROVED (parity plan units U2b and U3 run together per tool group: each tool is touched once). Base: U2a shell (`docs/design/tool-contract.md`, `docs/design/DESIGN.md`).

Each dev: migrate the group's tools to `src/tools/v2/<tool>.jsx` on the tool contract (workspace files, progress + cancel, result screen + continue-with), iLovePDF option patterns and option sets (`docs/research/ilovepdf-rea.md` section 2, Stirling options in `stirling-pdf.md` section 1), and fix the group's U3 audit items in the group's lib files. Registry entries go in `src/tools/v2/group-<name>.js` (array export); the orchestrator wires all groups into `registry.js` at merge. Delete the migrated legacy tool files.

| Group | Tools | Owns lib | U3 items (audit # / corpus fails) |
|---|---|---|---|
| G1 Organize | split (ranges, fixed N, by size, by bookmarks; "N PDFs will be created"), extract, remove (Shift-click ranges), organize (into page editor), rotate (all/portrait/landscape) | `pageRanges.js`, `zip.js`, `deliver.js` (streaming zip via client-zip) | 29, 34 |
| G2 Optimize + Security | repair, ocr, protect, unlock, compare, health | `cryptoOps.js`, `ocrOps.js` (non-font parts), `compareOps.js`, `mupdfOps.js`, `selfTest.js` | 10, 11, 22 (permissions, strength checklist), 26, 27, 31; SASLprep unlock; compare inserted page + dense crash; faster owner-only unlock (encrypt=none); offline OCR (self-hosted tesseract core/worker/lang data, language picker, skip/force, deskew/auto-rotate, 300 dpi) |
| G3 Edit canvas | edit, sign, crop, redact, forms, page numbers | `redactOps.js`, `formOps.js`, `editOps.js`, `stampOps.js` (page numbers/sign parts) | 2, 3, 5, 21, 24, 25, 33; redact rot90/origin; XFA detect + strip; flatten IPPH353 / rich text i485; page-number template UI, skip first N, facing pages, Bates; sign multi-place/initials/date/script fonts; redact regex + patterns + true removal keeping vector text |
| G4 Convert | img2pdf, pdf2img, word/excel/ppt to pdf, pdf to word/excel/ppt, markdown, html to pdf | `imageOps.js`, new `mupdfRender.js` (JBIG2 fallback for pdf2img) | 23 (EXIF, HEIC, TIFF, fit at 150 dpi, margins 0/20/40, orientation); JBIG2 blank render; HiFi default for Office; UI only for office libs (U4 owns officeOps/pdfExtract/libreOffice/htmlOps) |

Done when: every tool in the shell, corpus runner green on all rows that were green after U1 plus the group's U3 rows, Health 44/44 dev + build, chain test passes through at least one tool of each group.
Review after merge: separate reviewer + design critique (U2 steps 10-13).
