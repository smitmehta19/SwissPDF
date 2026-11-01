# Plan: Edit PDF text, phase 2 (2026-10-28)

Status: APPROVED 2026-10-28 (Smit: "build this" on the phase 2 + open P2 list). Deploy on a green gate, same as the last release.
Builds on `docs/plans/2026-10-27-edit-existing-text.md` (phase 1, live) and `docs/research/2026-10-27-edit-existing-text.md`.

## Goal
1. Edit a whole paragraph: the text re-wraps across its lines and keeps the look.
2. Right-to-left text (Arabic, Hebrew) reflows like left-to-right text does.
3. Close the 6 open P2s from phase 1.

## In scope
### A. Paragraph re-wrap (engine + UI)
- Model: `pageTextModel` adds `paragraphs: [{ id 'p<n>-g<k>', runIds, bbox (view), text, align: left|right|centre|justify, dir: ltr|rtl, editable, why }]`. A paragraph = the MuPDF stext block, minus lines that are not editable (then the paragraph is not editable, with that line's why). Text joins lines with a space; a line ending in a hyphen before a lowercase letter joins without it.
- Op: `editText` accepts `{ pageNum, paragraphId, text, old? }`. Report entry: `{ paragraphId, font, fallbackName, lines (count), overflow, refused, fit, box, changedBox }`. A newline in `text` is a hard break.
- How: remove every glyph of the paragraph (same band redaction and safety checks as phase 1), lay the words out greedily inside the paragraph width, redraw on the original baselines and leading; first-line indent kept; alignment kept (justify: all lines but the last spread to the edge with per-word positions, not Tw).
- Styles: a word-level diff of old vs new words; unchanged words keep their own font, size and colour (a bold word stays bold); new words take the style of the word before them (else after). Same-font when proven by use, else the phase 1 fallback chain.
- More lines than before: use free space under the paragraph (same leading) up to the next text/paint below or the page margin. Still too long: squeeze horizontally down to 85%. Still too long: refuse `no-room` and change nothing. Fewer lines: the space stays empty; nothing below moves.
- UI: triple-click (or a "Paragraph" button in the editor bar) opens a multi-line editor over the paragraph. Enter = new line, Ctrl+Enter or click away = apply, Esc = cancel. Undo as today. Phone: same via the button.

### B. Right-to-left reflow
- Line edits in RTL text push the rest of the line left (mirror of LTR push), with the same safety checks (covered, opacity, clip, collision with the next column).
- Paragraph re-wrap works for RTL (right edge as start, bidi order per line through `fonts.js`), Noto fallback with ActualText as today.

### C. The 6 P2s from phase 1
1. Shorter single word inside a line leaves a gap: pull the rest of the line back.
2. Bold Arabic falls back to regular: self-host Noto Sans Arabic Bold (OFL, free, on-demand like the others); other bold-less scripts get a light synthetic bold (fill + thin stroke). Same for Devanagari Bold if the size is reasonable.
3. Phone: dense lines give 6-10 px tap targets; the enlarged 16 px edit box covers nearby words. Fix: a tap picks the nearest line within 22 px; on narrow screens the editor opens as a bar above the keyboard, the page shows only a highlight.
4. Refusal note on a right-edge heading can be clipped: clamp/flip inside the viewport. Squeezed text visibly smaller than neighbours: grow into free space first, squeeze only what is left, floor 85% before refusing.
5. Edited words move to the end of the reading order, structure-tree /Alt not cleaned: insert the new draw at the content position of the old text when the page structure allows (same marked-content /MCID span), else append as today; clean /Alt in the structure tree for removed words. Time-boxed: if the insertion is not safe on the corpus, ship the /Alt cleanup only and record why.
6. Inline images inside Form XObjects not restored after MuPDF redaction: extend the inline image restore to form XObjects the redaction touched.

## Out of scope (Parking lot)
- Vertical text editing (wmode 1).
- Changing font, size or colour of existing text.
- Pushing blocks below a grown paragraph down the page.
- Same Form XObject inline-image fix inside Redact (check later; Redact uses the raster path there today).

## Definition of done
- Corpus rows (3 real files per case, `cases-edittext.mjs`): paragraph re-wrap shorter / longer / with a bold word / justified / RTL Arabic / no-room refusal; RTL line push; each P2 fix. Checks as phase 1: old text gone (text layer and bytes), new text extractable in order, no pixel change outside the paragraph box (plus any moved runs), ink in the box, other glyphs unmoved.
- UI script `edittext-ui.mjs`: paragraph open, type, apply, undo, refusal, phone 390 and desktop 1440; P2 #3 and #4 checked.
- Existing phase 1 rows and the full corpus stay green.
- Independent code review (no P0/P1) and a fresh no-context user test of Edit PDF.
- Full gate (build, `test:full`, all UI scripts), deploy, Health on the live site.

## Team and order
Two developers in the same checkout, disjoint files, no commits. Tests one at a time (lock), tiers per the global rule.
- Engine dev (Opus): `src/lib/editTextOps.js`, new `src/lib/editParagraph.js` if useful, `src/lib/fonts.js` (bold fonts), `public/fonts/`, `scripts/corpus-test/cases-edittext.mjs`, `page-harness-edittext.js`. Order: paragraph model (unblocks UI) > paragraph op LTR > RTL push + RTL paragraph > P2 1, 6, 2, 4 (engine part), 5. Status in `docs/team/status-engine.md`.
- UI dev (Opus, loads `design-master`): `src/tools/v2/edittext.jsx`, `edittext.css`, `edit.jsx`, `g3-canvas.jsx`, `scripts/corpus-test/edittext-ui.mjs`. Order: P2 3, 4 (UI part) > paragraph editor against the API above > end-to-end once the engine lands. Status in `docs/team/status-ui.md`.
- Then: reviewer + blind no-context test in parallel, one fix round, full gate, deploy.

## Cost and time
About 2.5 to 3.5M tokens; 5 to 7 hours wall clock. No money.
