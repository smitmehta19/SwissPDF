# U4 Conversion fidelity: scope

Status: APPROVED (part of the approved parity plan). Runs in parallel with U2a: lib files only, no tool UI files (U2 owns those). Parent: `2026-10-17-parity.md`.

## In
| Dev | Owns | Work | Audit # |
|---|---|---|---|
| H PDF to Office | `src/lib/pdfExtract.js`, `src/lib/officeOps.js` (pdfTo* functions), `src/lib/markdownOps.js` | Column segmentation (XY-cut) before line building; borderless (stream) table detection; font family/colour/alignment carried; repeating header/footer detection; bidi line order for RTL; exact mode groups lines into paragraph frames; PDF to Excel keeps leading zeros/long IDs as text, parses currency/parentheses negatives/percent/locale decimals/dates, option to join pages; PDF to PPT editable text boxes + images, raster only for vector art, per-page aspect; speed: FDIC 44-page report under 60 s (baseline 5.7 min) | 15, 16, 17 |
| I Office/HTML to PDF | `src/lib/libreOffice.js`, `public/vendor/`, `src/lib/htmlOps.js` (officeOps.js belongs to H only; H also fixes the Excel quick-mode TypeError + pagination) | HiFi engine: pin the ZetaOffice version URL; ship Carlito/Caladea/Noto into the engine FS; download progress %; HTML to PDF keeps head styles and slices on block boundaries or uses Writer HTML import for real text | 18, 19, 28 |

## Out
- New convert formats (U5). UI changes (U2b).

## Done when (corpus)
- PDF to Word on two-column arXiv papers: no interleaved columns (word-order check vs pdf.js reading order per column); invoices: tables become Word tables; Arabic/Hebrew lines in logical order.
- PDF to Excel on invoices + FDIC: leading zeros kept, numbers typed, dates typed.
- PDF to PPT: slide text extractable from the pptx.
- Office to PDF: all 12 office files convert in HiFi with selectable text; quick mode no TypeError.
- Times recorded; no regressions vs U1 scorecard.
