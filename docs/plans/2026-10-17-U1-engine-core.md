# U1 Engine core: scope

Status: APPROVED, building 2026-10-17 (parallel git worktrees, devs do not commit; orchestrator merges). Parent: `2026-10-17-parity.md`.

## In
| Dev | Owns (files) | Work | Audit # |
|---|---|---|---|
| A intake | new `src/lib/intake.js`, `src/components/usePdfFiles.js`, `src/components/FileGroups.jsx` (password prompt only) | `normalizePdf(bytes, {password})` -> `{bytes, pageCount, notices}`: owner-only encrypted -> unlock silently via MuPDF; user password -> per-file inline prompt; pdf-lib parse fail -> MuPDF repair then continue with notice; real cause kept in a details line; page count via pdf.js/MuPDF not a full pdf-lib parse | 1, 7 |
| B pdf.js core | `src/lib/pdfText.js`, `vite.config.js` (asset copy), `public/pdfjs/` | `openDoc` passes cMapUrl, standardFontDataUrl, wasmUrl, iccUrl; one cached `PDFDocumentProxy` per file id (destroy on remove); `renderPages(doc, list)`; no per-page full-file copy; direct `getDocument` users (redactOps, pdfExtract) switched to the shared opener | 4, 5, 20, 41 |
| C geometry + fonts | new `src/lib/pageFrame.js`, new `src/lib/fonts.js`, `src/lib/stampOps.js`, `src/lib/editOps.js`, `src/lib/formOps.js` (font only), `src/lib/ocrOps.js` (font only), `src/components/PageCanvas.jsx`, `src/tools/CropTool.jsx` | `pageFrame(page)` = visible box (CropBox within MediaBox, origin, /Rotate) + mappers UI fraction <-> PDF user space; all placing tools use it; crop works on rotated + mixed sizes; `@pdf-lib/fontkit` + self-hosted Noto subsets per script, auto-picked from text | 8, 9, 13 |
| D structure | `src/lib/pdfOps.js`, new `src/lib/qpdfOps.js` | merge/split/extract/remove/reorder keep bookmarks, AcroForm fields (renamed on collision), named dests, page labels via qpdf-wasm (Apache-2) or MuPDF graft; `loadPdf` delegates to `intake.normalizePdf`; `assertValidOutput` light check (header, EOF, pdf.js page count) | 12, 30 |

Libraries (checked on npm 2026-10-17, all free): `@neslinesli93/qpdf-wasm` 0.3.0 ISC or `qpdf-wasm` 0.1.0 Apache-2, `@pdf-lib/fontkit` 1.1.1 MIT, Noto via `@fontsource/*` OFL (subset, self-host only needed scripts), `client-zip` 2.5.1 MIT. Note: qpdf `--pages` keeps AcroForm fields and page labels but takes outlines only from the primary file, so D rebuilds the merged outline tree itself.

Shared files touched by one owner only. Self-test (`selfTest.js`) updated by the orchestrator after merge.

## Out
- Moving pdf-lib/MuPDF to a worker, cancel, progress (U2 job runner).
- Tool-specific fixes (U3), conversions (U4), new tools (U5).

## Done when
- Corpus runner: every PDF in `test-corpus/` (except the user-password ones without a known password) is accepted at intake, either directly or after silent unlock/repair with a notice.
- Merge of `quirks` outline files keeps bookmarks; merge of two IRS forms keeps working fields.
- Watermark, page numbers, sign, edit, crop place correctly on derived rotated + CropBox-offset files (checked by text position in output).
- Watermark/page numbers/edit with CJK, Arabic, Devanagari text save without error and text extracts back.
- 585-page and 956-page files: thumbnails + split run without tab crash; heap reported in scorecard.
- Health check still green; reviewer agent pass.
