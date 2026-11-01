# Edit text: spill long lines onto new lines, close gaps (option A)

Status: APPROVED by Smit 2026-11-01.

## Problem
1. Editing a line to longer text runs past the paragraph's right edge or, when the page edge or the next column is in the way, gets squeezed and then refused ("No room for this text here, even squeezed: try shorter text"). Smit wants the extra words on new lines, with the rest of the paragraph moving down.
2. Deleting a whole line leaves a blank gap; deleting words at the start of a line leaves the rest where it was. Smit wants the rest to close up.

## What it does
Spill, when a line edit would pass its paragraph's right edge, get squeezed, or be refused for room:
1. The edited line is broken at spaces in the new text. The first part stays on the line, starting where it started. The rest goes on 1 or more new lines just below it, at the paragraph's left edge, same font, size and line spacing.
2. Every later line of the same paragraph moves down by the added lines, whole: same glyphs, same word spacing, same justification. No word on those lines is re-broken or re-hyphenated (what broke the parked re-wrap).
3. Lines above the edit, other paragraphs, other columns: untouched.
4. The space needed below the paragraph must be blank paper (no text, drawing, form field, link; inside page margin and clip). Else nothing changes and the refusal says: "No room below this paragraph. Try shorter text, or use PDF to Word for bigger rewrites."

Close gaps:
5. A line edited to empty (whole line deleted): the paragraph's later lines move up by one line, whole.
6. Words deleted at the start of a line: the rest of the line slides back to the line's start (leading spaces in the new text trimmed).
7. Not included: pulling words up from the next line to fill a shorter line (parked re-wrap).

## Guards (fall back to today's behaviour)
- Not a clean stack: the moving lines are not left-aligned to the paragraph (first-line indent allowed) or line spacing varies more than 10%. Protects against MuPDF grouping two columns or a table as one block (parked finding P1-1).
- Something on a moving line would end up wrong: underline or strike, link or comment, highlight or cell shading under it, form field, clip, opacity, outline text.
- Right-to-left lines, vertical text, one-line blocks (labels, table cells) with nothing blank below.
- A single new word wider than the column: squeeze as today (60% floor), then refuse.

## Build
- Engine (`src/lib/editTextOps.js`, maybe `src/lib/editParagraph.js`): `spill` / `close` path inside the line edit, reusing the exact glyph redraw, blank-below check and window drawing of the paragraph code. Paragraph lines from the MuPDF block, not the parked hyphen-aware finder. Report adds `spill: { lines, moved }` / `closed: { moved }`.
- UI (`src/tools/v2/edittext.jsx`): result note "Continued on N new line(s); the rest of the paragraph moved down." / "Lines below moved up." New refusal text. No new toggle.
- Tests: corpus rows in `cases-edittext.mjs` on real files, each checking (a) nothing above the edit changed, (b) moved lines pixel-identical to the originals, shifted, (c) copied text in order, (d) a second edit works.
  - spill OK: single column ragged, justified two-column (tracemonkey), paragraph at end of a column.
  - close OK: whole line deleted mid-paragraph, words deleted at line start.
  - refused/fallback: next paragraph right below, table cell, link line, Arabic line, highlighted line.
  - 3 to 4 steps in `edittext-ui.mjs`.

## Done when
New rows pass, existing edittext rows pass (overflow rows that now spill get updated expectations), `test:quick` green, one independent review and one blind no-context test with no P0/P1 open, then full gate (corpus + 12 UI scripts) and deploy.

## Convergence rule
Max 2 fix rounds after the first review. Not green: ship behind `SPILL_EDIT = false` and ship only the clearer refusal text.

## Estimate
Build about 6 to 8 hours, review + blind test about 2 hours, full gate about 1.5 hours. 1.5 to 2 days elapsed.

## Out of scope (parking lot)
- Re-wrapping the rest of the paragraph to fill lines (parked paragraph re-wrap).
- Pushing other paragraphs, figures or tables down; flowing onto the next page.
- Spill / close for right-to-left and vertical text.
- Moving links and highlights together with the text.
- (Smit, 2026-11-01) Select several lines and edit them as one box. Next unit candidate: same "move lines whole" base; the selected lines are re-laid, lines after them move. Close to parked paragraph re-wrap, so it inherits its hyphen / justify risks for the selected lines only.
- (blind test 2026-11-01, existing behaviour, not spill) Centred title grows past both page edges (TAMReview); a line holding a glyph no font can redraw (circled c) gives a message about a char the user did not type; overflow past a box border or page edge is applied with only "Runs past the margin" (free-fiber, azure).
- (blind test) When a spill has no room and the edit then squeezes or overflows, say "no room below" in the note too; three wordings today for "no space".
- (blind test) Note card covers the lines it describes; selection outline overlaps the first spilled line; no busy sign during the 1-4 s apply.
- (review 2, P2) New words on the edited line sit 0.05 to 0.1 pt off the baseline (row v rounded); clean-stack guard (round 1 P2-4); a corpus row for the justified single-line spread and a mid-line spill; draw the font's own space between moved words so fewer spills fall back.
