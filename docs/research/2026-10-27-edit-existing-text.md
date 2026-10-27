# Edit existing text in place (research + prototype)

Date: 2026-10-27. Status: research done, prototype measured on real files, nothing in `src/` changed.
Prototype: `scratch-edittext/` (`editword.mjs` = the op, `run.mjs` = corpus runner and checks, `one.mjs` = single edit, `out/` = PDFs, full-page PNGs, line crops, `results.json`, `results.md`, `run.log`).

## TL;DR

- **Recommended:** approach (a)+, "remove and redraw". MuPDF finds the word or line (structured text: font, size, colour, baseline, quads). MuPDF removes only those glyphs with text-only redaction over a thin band around the baseline. The new text is redrawn with the **same PDF font object** when its ToUnicode or simple encoding maps every new character back to a code that exists in the subset. Otherwise it falls back to a base-14 font matched by name (weight and style) for Latin, or Noto through `fonts.js` `layoutText` (shaping, bidi) for other scripts. When the new word is longer, the rest of the line moves right: the moved runs are redrawn in their own fonts, with their original kerning kept through TJ offsets.
- **Measured** on 10 real files (plus 1 synthetic Hindi file, 3 refusals), 44 edits:
  - 44/44: zero pixels changed outside the edited box.
  - 44/44: old word gone from the MuPDF text layer.
  - 44/44: no other glyph on the page moved, except the runs we moved on purpose. Those landed exactly on the shift.
  - 27/44 used the original embedded font. The other 17 used a fallback font: 9 because a new character is not drawn with that font anywhere in the file (all the missing-glyph edits plus one Chinese), 8 because the script is complex (Arabic, Devanagari).
  - A character counts as present in a subset font only if the file already draws it with that font. ToUnicode and /Widths alone are not proof.
  - New text extractable in 38/44. The 6 failures are all Arabic or Devanagari drawn by pdf-lib, which writes visual-order ToUnicode. The fix is an ActualText span.
- **Refusals:**
  - Proven by the prototype: scanned fax and udhr-hindi (image-only pages, or OCR text under the scan) are detected as "run OCR first".
  - **Not exercised:** text with no Unicode mapping (udhr-hebrew) and Type3 fonts (pdfjs Type3 samples). The test picker skipped them because they have no letter words. `editWord` itself has no gate yet: it falls back by font name. The gate is E2 work.
  - Vertical text is **not** handled: in the prototype it removed the wrong glyph, so v1 must refuse wmode 1.
- **Effort:** word and line editing with line reflow is about 12-14 dev-days. Paragraph re-wrap is about +4.

## 1. How iLovePDF and Stirling do it

| | iLovePDF Edit PDF | Stirling "PDF Text Editor" |
|---|---|---|
| Where it runs | Server. Files are uploaded and "automatically deleted after 2 hours" (their blog). The editor UI is in the browser. | Now **client-side**, on PDFium WASM (`@embedpdf/pdfium`), in `frontend/src/editor/core/tools/pdfTextEditor/` (core = MIT, not the proprietary folder). An older version converted the PDF to JSON on the server. |
| Behaviour | Click existing text and edit it directly. Change font, size, colour, alignment, formatting, links. Toolbar: edit existing text, add text, images, shapes, draw, comments, highlights, z-order. | Text runs are grouped into lines and paragraphs (`LineGrouper`, `ParagraphGrouper`). Commands: edit, move, merge runs, `ReflowWrapCommand`, font family and size, colour, outline, tables, images, alt text and tags (`PdfiumTagMarks`). |
| Write-back | Not documented, but the result keeps the original look on simple files. | Edits PDFium text objects in place. `FPDFText_SetCharcodes` writes codes into the **existing subset font**, then PDFium regenerates the page content. |
| Font for new characters | Not documented. | A charcode strategy picks the codes: `content-stream` (default: reads the codes the page already uses), `cmap` (embedded font cmap), `helvetica` (legacy fallback). "Font borrowing": a missing glyph is taken from another font on the page, same family first, never changing weight (`FontBorrowing.test.ts`). Type3 fonts are reused only when the advance can be measured. Last resort is base-14 or a fallback font family matched by weight and style. Emoji are dropped and a "save risk" modal gates the save. |
| Overflow | Not documented. Marketing says "no layout distortion". | Option to export each edited box as one text element, and to auto-scale text horizontally to fit its original box. A fixed regression: a long string in a single-line run used to run off the page. |
| Known issues (from their regression suite) | n/a | Non-Latin typing re-emitted the whole paragraph and lost source fonts. Non-Latin text showed as "ÿ" tofu with the base-14 fallback. Lone surrogates from emoji. A stray U+00FF after deleting a leading word. A spurious space after deleting inside a Type3 word. Multiple spaces collapsed. The feature is labelled experimental. |

Takeaways for us:
- Both keep the original font whenever the subset has the glyphs, and both substitute otherwise. Stirling borrows from same-family fonts on the page before falling back.
- Neither promises paragraph reflow on arbitrary PDFs. Stirling has a wrap command but treats it as risky.
- Our approach reaches the same "same font when possible" result with MuPDF, which we already ship. Stirling needs a whole PDFium engine for it.

## 2. Candidate approaches

| | How | Pros | Cons | Verdict |
|---|---|---|---|---|
| (a) Remove and redraw (prototyped) | stext finds the run. MuPDF text-only redaction over a baseline band removes the glyphs. Redraw with the same font dict (reverse ToUnicode) or a fallback. | One code path for every font type and every content layout (TJ splits, per-char Td, Form XObjects, tagged content). Redaction already keeps the following glyphs in place. Reuses redact know-how. | Each edit appends a small content stream. Fallback font is visibly different for non-Times/Helvetica families. | **Recommend** |
| (b) Rewrite Tj/TJ bytes in place | Tokenise the content stream, track font and text state, find the codes for the word, swap them. | Smallest diff. Following text in the same TJ reflows naturally. | mupdf.js has no content tokenizer, so we would have to write one: graphics and text state, inline images, nested XObjects. Words are often split across TJ elements or drawn per character (pdf.js turns these into "C O R P U S"). Form XObjects shared between pages would change every page. Same-length results look the same as (a). Only works when all glyphs are in the subset. | Skip |
| (c) Hybrid (b) then (a) | (b) when the word is one contiguous string in a simple font, else (a). | Pretty diff when (b) applies. | Two code paths and two test matrices for no visible gain. | Skip |
| (d) Adopt PDFium WASM (Stirling's route) | Text-object API: SetCharcodes, then GenerateContent. | Mature text-object model, used by Chrome. | A third PDF engine next to pdf.js and MuPDF: bundle size (several MB, not measured), plus memory and worker plumbing. GenerateContent rewrites the whole page stream anyway. | Not now: revisit only if (a) hits a wall |

Word, line or paragraph:
- **Word or line edit with line reflow** covers invoices, forms, reports and typos. It is what we measured.
- **Paragraph edit** (a multi-line re-wrap inside the stext block width) is phase 2. It reuses the same op, run once per line:
  - remove all lines of the block;
  - lay out the words greedily with the same-font widths;
  - redraw each line at the original baselines.
  - Extra lines beyond the block's original count are an overflow. We warn and do not push the blocks below.

## 3. Prototype and measurements

### Pipeline (`scratch-edittext/editword.mjs`)
1. **Find the target.** `page.toStructuredText('preserve-whitespace').walk()` collects lines, and each char's text, origin, quad, size, colour and font name.
   - The font name keeps the subset prefix and is cut at 31 characters. Found on us-budget: "NewCenturySchlbkLTStd-BdIt" reads as "...-Bd".
   - Font dicts are matched on the full BaseFont first, by prefix match when the name is 31 characters long, and only then by family.
   - MuPDF `isBold/isSerif` flags are unreliable: HelveticaNeue reports serif. Use the name.
2. **Reverse map.** Parse ToUnicode (`bfchar` and `bfrange`, both array and offset forms) into a unicode-to-code map. Encode greedily, longest match first, so ligatures work.
   - Simple fonts without ToUnicode use ASCII plus `/Differences` glyph names.
   - Base-14 fonts that are not embedded (flipkart) get widths from `new mupdf.Font(name).advanceGlyph`.
   - **Availability rule:** a new character may use the same font only if the file already draws it with that font. Collect this from stext `onChar` by font name over the first 40 pages, as in Stirling's default "content-stream" strategy.
     - pdfTeX `/Widths` and full-range ToUnicode often list glyphs the subset does not contain.
     - MuPDF `Font.encodeCharacter` is not a substitute: it returns gid 0 for everything in the CID font (Chinese), and gives real gids for a full, non-subset font (aws HelveticaNeue has é).
     - The first run without this rule drew a "Z" with NimbusRomNo9L in attention. It rendered fine, but only by luck.
     - Non-embedded base-14 fonts have every glyph, so the rule could be relaxed for them. The fallback is the same font anyway.
   - Simple fonts are always 1-byte codes, even when their ToUnicode codespace says 2 bytes. The first run drew garbage on us-budget because of this.
   - Type0 works only with Identity-H/V. Type3, or Type0 without ToUnicode, goes to fallback or is refused.
3. **Match the look.** Char spacing Tc = (measured span minus natural width from `/Widths` or `/W`) divided by (n-1). Colour comes from stext (g, rg or k). The text matrix is built in page space from origin, line direction and size, then mapped to PDF user space with the inverse of `page.getTransform()`. This handles `/Rotate` and CropBox origin: rot90-cropbox-bert passed, as did `quirks/pdfjs-hello_world_rotated.pdf` with rotated text.
4. **Remove.** A Redact annotation over a band from 0.45 x size above the baseline to 0.05 x size below it, inset 0.15 pt at the ends. Then `applyRedactions(false, IMAGE_NONE, LINE_ART_NONE, TEXT_REMOVE)`. The full quad would clip glyphs on neighbouring lines.
5. **Draw.**
   - Same-font path: add the font ref to the page `/Font` as `SPDFEditN`. Contents become `[q, ...old, Q, new]`. The new word is one `Tj`, so pdf.js extracts it as one word. Moved runs use one `TJ` with per-glyph offsets taken from their original origins, which keeps the kerning.
   - Fallback path: pdf-lib plus `src/lib/fonts.js` `layoutText`/`drawRuns` (subset embed, fontkit shaping, bidi), then a MuPDF clean save.
6. **Save.** `garbage,compress`, then reopen and save `garbage=compact,compress,objstms` (dev-notes rules). The old glyph codes are then gone from the bytes. File size went down in 8 of 10 real files, flipkart stayed within 1 KB, and us-budget grew 1.4%.

### Checks per edit (`run.mjs`)
- **Pixels outside the edited box:** count of pixels with a channel delta over 32 at 144 dpi, outside the union of the old box, the new box and any moved runs plus 2 px. Max delta reported too.
- **Old text gone:**
  - doc-wide count in MuPDF text, default mode (ActualText applied) and `ignore-actualtext`;
  - pdf.js `getTextContent` on the page;
  - code-byte scan of every decoded stream for the word's codes (raw and hex).
- **New text found:** MuPDF and pdf.js, whitespace ignored.
- **Other chars moved:** every non-space char on the page must still exist at its origin (within 0.2 pt), or at origin + shift for the reflowed runs.
- **Overflow:** how far the new word's end goes past the next glyph's origin.
- **Target choice:** automatic. The word is unique in the document, has 4 or more letters (3 Han characters), has text after it on its line, sits outside the header and footer bands, and is in the file's own script.
- **Edits:** same-length (two letters swapped), longer (+3 letters), longer with reflow, missing glyph (one letter swapped for a character outside the font's map).

### Results (full table: `scratch-edittext/out/results.md`)

| File | Word | Same-length | Longer (overlap) | Longer + reflow | Missing glyph | Notes |
|---|---|---|---|---|---|---|
| invoices/aws-invoice | estimated | same font HelveticaNeue-Roman | overlaps next word by 8.6 pt | 7 runs moved 10.8 pt, exact | Helvetica fallback | |
| invoices/flipkart-invoice | manufacturer | same font Times-Italic (base-14, not embedded) | +10.3 pt | 2 runs moved | Times-Italic | |
| invoices/azure-interior | Beeswax | same font Lato-Regular, Tc 0.04 inferred | +15.4 pt | 1 run moved | Helvetica (Lato lost) | |
| reports/pdfjs-tracemonkey | Andreas | same font NimbusRomNo9L | +16.1 pt | **refused**: rest of line has a char not in ToUnicode, overlap left | Times-Roman (Nimbus is a Times clone, near-identical) | |
| reports/arxiv attention | Provided | same font NimbusRomNo9L, Tc -0.026 | +13.5 pt | 9 runs moved | Times-Roman | |
| reports/us-budget-2024 (tagged, MCID) | summary (p3) | same font NewCenturySchlbk-Roman | +18.5 pt | 1 run moved | Times-Roman | fallback took 5.8 s (pdf-lib parses a 2.3 MB file) |
| forms/irs-fw9 | Before | same font HelveticaNeueLTStd-Bd | +10.7 pt | 17 runs moved | Helvetica-Bold | |
| derived/rot90-cropbox-bert | Kristina | same font NimbusRomNo9L-Medi | +14.9 pt | 1 run moved | Times-Bold | rotation and CropBox correct |
| intl/udhr-arabic | اعتُمد | Noto Sans Arabic (shaped, correct joins) | overflow not measured (the runner's "next glyph" logic is LTR only; values in results.md are n/a) | RTL reflow not handled | Noto Sans Arabic | new text not extractable in 2 of 4 (mark order) |
| intl/udhr-chinese-simplified | 世界人 | same font ArialUnicodeMS (Type0, 2nd of 3 same-name dicts) | +40.5 pt | 1 run moved | Noto Sans SC | |
| synthetic hindi-sample (udhr-hindi has no text) | सार्वभौम | Noto Sans Devanagari, shaped correctly | | 1 run moved | Noto Sans Devanagari | new text not extractable (pdf-lib ToUnicode is in visual order); needs ActualText |
| intl/udhr-hindi | | | | | | refused: pages 1-4 image-only, "run OCR first" |
| scanned/fax-jean-schmidt-doe | | | | | | refused: OCR text sits under a full-page scan (text block drawn before a covering image) |
| intl/udhr-hebrew | | | | | | not exercised: no usable ToUnicode (text extracts as control chars), picker found no word. The op needs an explicit gate |
| intl/pdfjs-vertical (one.mjs) | い | | | | | **broken**: removed the wrong glyph and drew horizontally. Must refuse wmode 1 |

Totals over 44 edits:

| Check | Result |
|---|---|
| Pixels outside the box | 0/44 changed |
| Old text gone | 44/44 in MuPDF, with and without ActualText |
| Byte scan | 7 files had the word's codes as one string: the count dropped by exactly 1 every time (fw9 11 -> 10: the other 10 are substrings of other words). 3 files had the word split across TJ, so the scan proves nothing there. |
| Other glyphs moved | 0/44 |
| New text extractable | 38/44 (6 failures all Arabic or Devanagari) |
| Same font kept | 27/44 |
| Time per edit, same font | 8-260 ms, 1 s on the 2.3 MB us-budget |
| Time per edit, fallback | 16-350 ms on small files, 5.8 s on us-budget |

Example crops (3x): `out/aws-invoice-crop-longer-reflow.png`, `out/irs-fw9-crop-longer-reflow.png`, `out/pdfjs-tracemonkey-crop-missing-glyph.png`, `out/udhr-arabic-crop-same-length.png`, `out/hindi-sample-crop-same-length.png`, `out/udhr-chinese-simplified-crop-missing-glyph.png`, `out/hello-rotated-text.png`, `out/vertical.png`.

## 4. Recommendation

### Approach
(a)+ as prototyped: same font when the subset can encode the text, else a matched fallback, with line reflow on by default. Improvements over the prototype:
- **Borrow before falling back** (Stirling's idea): try other font dicts on the page with the same family and weight, ranked by name, then base-14 or Noto.
- **ActualText for complex scripts:** wrap fallback-drawn Arabic and Indic runs in `/Span <</ActualText (...)>> BDC ... EMC`. That makes the new text extractable (fixes the 6 failures).
- **Shorter text:** pull the rest of the line left by the same mechanism (negative shift), so no gap is left.
- **Fit to width (option):** when the reflowed line passes the column edge (stext block right edge), apply horizontal scaling `Tz` down to 85%, else warn.
- **Faster fallback:** do the fallback draw on the MuPDF document directly (`addFont` + `subsetFonts`) for Latin and CJK. Keep pdf-lib and fontkit only for scripts that need shaping, and draw into a one-page extract if needed. That avoids the 5.8 s full pdf-lib parse on big files.
- **Batch on save:** apply all edits of a page in one redaction pass and one content append when the user saves. Per-keystroke work is only the HTML preview.

### UX
- Edit tool gets a first mode, "Edit text" (before "Add text").
  - Hovering shows line boxes from stext.
  - Click selects the word, double-click the line, triple-click the paragraph (phase 2).
  - An inline input sits exactly over the run, styled with a close CSS font at the same size and colour.
  - Enter or click-away commits. Esc cancels.
- After commit the page re-renders from the edited bytes, so the user sees the real result, not the preview.
- A small badge on the edited run says "Original font" or "Substitute: Helvetica Bold". Hovering it explains: "This file only contains the letters it uses; new letters use a similar font."
- Overflow:
  - The rest of the line moves right.
  - If the line would pass the column or page edge: amber outline and "Text runs past the column", with choices "Fit to width" (scale down to 85%) or "Keep".
  - We never push other lines down in v1.
- Refusals, with the reason shown on click:
  - scanned page or text under an image: "This page is a picture. Run OCR first", with a link to OCR;
  - text with no Unicode mapping;
  - vertical text;
  - Type3 or outlined text (text drawn as paths).
- Signed PDFs: warning before the first edit, "Editing removes the digital signature", and the signature is stripped on save.

### Limits we tell the user
- New letters that are not in the file's font use a similar font. Bold and italic are kept for Latin. Non-Latin fallbacks are Regular only (bundled Noto has no Bold).
- Editing works per word or line. Paragraphs do not re-wrap in v1. Longer text pushes the rest of its line and may run past the margin.
- Right-to-left text: in-place word replacement works, but the line does not reflow.
- Not supported: vertical text, scanned pages (OCR first), text without a Unicode map, text in form fields (use Forms) or in comments and annotations.
- Justified lines keep their original spacing, so an edit can make one line look looser or tighter.

### Risks
| Risk | What happens | Mitigation |
|---|---|---|
| Digital signatures | Any content change invalidates them. A full rewrite drops the incremental revisions. | Detect `/Sig` fields with `/V`, warn, strip on save (same as other tools). |
| Tagged PDFs, ActualText | An ActualText span over the old word would keep old text extractable. New content has no MCID, so the structure tree misses it. | After redaction run `actualTextLeft` / `stripPageMarkedText` (redactOps) on the edited band. Wrap new runs in `/Span` with ActualText. Tagging new runs into the structure tree is parked. us-budget (tagged) passed, but its ActualText spans only covered spaces. |
| Type3 fonts | No ToUnicode or widths in glyph space. Redrawing in the same font is unsafe. | Same-font path off. Refuse if there is no Unicode, else fallback by name. |
| Vertical text (wmode 1) | Prototype removed the wrong glyph. | Refuse in v1. A vertical band and up-vector are needed later. |
| RTL | Same-font is impossible (presentation forms, shaping). Reflow is not handled. Mark order breaks extraction. | Always fallback with fontkit shaping, plus ActualText. No reflow for RTL in v1. |
| Glyph availability | ToUnicode and /Widths can list characters the subset does not contain. Drawing them gives blank or `.notdef` boxes that still extract as the right text, so text checks pass. | Availability is proven by use (the file draws it with that font) or by the font program (fontkit glyph lookup on the embedded file), never by ToUnicode or Widths alone. Corpus check: render the edited box and compare ink with the expected glyph count. |
| Font matching | Subset fonts only contain used glyphs. Fallback differs for brand fonts (Lato to Helvetica). | Borrow same-family glyphs first. Show the substitute badge. |
| Redaction band | A tight band can miss tall glyphs, and a loose one can catch neighbours on tight line spacing. | After apply, check like redact's `leftovers`: no target char left, every other char unmoved, else undo and tell the user. |
| Hidden or OCR text | OCR text under a scan looks editable. | Block order rule: a text block drawn before a covering image is hidden (worked on the fax). Also check render mode 3. |
| Performance | The fallback via pdf-lib re-parses the whole file (5.8 s at 2.3 MB). | MuPDF-only draw for Latin and CJK. Batch edits. Run in the ops worker. |
| MuPDF quirks | Double free in Device callbacks. `resolve()` followed by a compact save loses data. | The op uses only stext `walk` and `asJSON`, no Device callbacks and no object walk. Save in two passes. |

### Effort (one developer, Opus-level; files split so two devs can work in parallel)
| Unit | Files | Days |
|---|---|---|
| E1 op: find run, font dict match, ToUnicode reverse map, availability by use, widths, band redaction, same-font draw, Tc, reflow with TJ, borrow, fallback (MuPDF Latin/CJK, fonts.js complex), ActualText, leftovers check | `src/lib/editTextOps.js` (new) | 5 |
| E2 page model for UI: lines, words, blocks, editability reason per run (scanned, hidden, wmode, Type3, no Unicode), cached per page in the ops worker | `src/lib/textModel.js` (new), worker registration | 1.5 |
| E3 UI: "Edit text" mode in the Edit tool, hover boxes, inline editor, badges, overflow warning, undo, signature warning | `src/tools/v2/edit.jsx`, `g3-canvas.jsx` (dev B) | 4 |
| E4 corpus cases: the 4 edits x 12 files plus refusals, with checks for pixels outside the box, old gone, new found, neighbours unmoved | `scripts/corpus-test/cases-edittext.mjs`, `page-harness-edittext.js` | 2 |
| Review fixes buffer | | 1.5 |
| **Phase 1 total** | | **~14** |
| Phase 2: paragraph re-wrap inside the block, RTL line reflow, vertical text | | +4 to +6 |

Code to reuse:
- `redactOps.js`: the `applyRedactions` call pattern, `stripPageMarkedText`, `actualTextLeft`, `leftovers`, widget handling.
- `fonts.js`: `layoutText`, `drawRuns`, `runsWidth`, `unsupportedChar`.
- `docOps.saveMu`: two-pass save.
- `pageFrame.js`: view-space geometry.
- `g3-canvas.jsx` `PageStage`: overlay and canvas.
- `validate.mjs` `redactionLeaks` / `rawScan`: byte-level old-text checks in the corpus runner.
- The scratch prototype's ToUnicode parser and font-dict matcher can be ported as is.

## Sources
- iLovePDF blog, advanced editor: https://www.ilovepdf.com/blog/new-advanced-pdf-editing-ilovepdf ; edit text how-to: https://www.ilovepdf.com/blog/edit-pdf-text
- Stirling PDF repo (MIT core), `frontend/src/editor/core/tools/pdfTextEditor/` (charcode strategies, FontBorrowing tests, pdfium writer); known-issues spec `frontend/src/editor/core/tests/stubbed/pdf-text-editor-known-issues.spec.ts`: https://github.com/Stirling-Tools/Stirling-PDF
- Stirling text editor backlog (mirror): https://git.laurivan.com/Mirrors/Stirling-PDF/src/branch/demo/docs/pdf-text-editor-backlog.md (fallback font family matching, one text element per box, auto horizontal scale)
- Local: `docs/research/stirling-pdf.md`, `docs/research/ilovepdf-rea.md`, `docs/team/dev-notes.md` (MuPDF and font rules followed here).
