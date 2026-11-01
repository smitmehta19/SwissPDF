# Blind test: Edit text "spill" (long line continues below)

Tester had no knowledge of the code. Driven with Playwright (Chromium headless, 1440x900 plus one pass at 390x844). Dev server on :5173, stopped afterwards. Screenshots in `docs/reviews/blind-spill-shots/`.

Files used: saeco, free-fiber, quality-hosting, azure-interior (invoices); pdfjs-tracemonkey, pdfjs-TAMReview, fdic-quarterly (reports). About 35 edits in total, of which 14 are described below.

Counts: P0 = 0, P1 = 4, P2 = 5.

## Issues

### P1-1 Address block: long text is squeezed to about half width instead of continuing below
- File saeco.pdf, line "Strategic Corp" (Factuuradres block, 5 short lines, ~90 px blank below the block).
- Double-click, append " Holdings International Limited trading as the Strategic Corporation of the Netherlands B.V. Department of Finance", Enter.
- Expected: extra words continue on new lines, lines below move down (or "No room").
- Actual: the whole text is squeezed horizontally into the column (very condensed, hard to read). Note: "Runs past the margin or into the next text. Squeezed to fit before the next column. Closest match: Helvetica". No spill.
- Shot: `saeco-E1-after.png`

### P1-2 Centred heading grows past both page edges and is clipped
- File pdfjs-TAMReview.pdf, title line "Overview of the Technology Acceptance Model: Origins,".
- Double-click, append " and a rather lengthy extra subtitle phrase".
- Expected: spill to a new line, or a clear refusal.
- Actual: "Kept centred", so the line extends beyond the page on the left and right. Start of the title is cut off ("Overvie..." is lost at the left edge, line box starts at x=-8). Second title line is not moved. Note offers only "Fit to width".
- Shot: `tam-S3-title-note.png`

### P1-3 A line containing a special glyph cannot be edited at all, with a cryptic error
- File pdfjs-tracemonkey.pdf, bottom-left footer line "Copyright (c) 2009 ACM 978-1-60558-392-1/09/06...$5.00" (the circled-c glyph).
- Double-click, append " and this additional sentence ...", Enter.
- Expected: edit applies, or error names the problem in plain words.
- Actual: "Not changed: No font here has the character "<combining glyph>"". The user typed only ordinary letters; the problem is a character already in the line, and the message does not say so. Editor stays open, no way forward except deleting the whole text.
- Shot: `tm-U2-bottom-left-copyright-note.png`

### P1-4 Overflow instead of "no room" when a box or page edge limits the paragraph
- File free-fiber.pdf, last line of the boxed paragraph "signaler toute anomalie a votre service abonne." (inside the "Avis de prelevement" frame, blank space exists only inside the box).
- Append " and this additional sentence keeps going with several more words so that it cannot possibly fit on the original line anymore".
- Expected: "No room below this paragraph", or spill inside the box.
- Actual: the line runs through the right border of the box and off the page edge; note "Runs past the margin or into the next text" + Fit to width. Same pattern on azure-interior ("Due to global inflation..." line, text runs off the page) and on pdfjs-TAMReview mid-line and FDIC body (see P2-1). The spec allows "squeezes/overflows as before", but the output PDF then has text cut off by the page edge.
- Shots: `ff-FF2-last-long-note.png`, `az-A1-inflation-long-note.png`, `az-A2b-after.png`

### P2-1 "No room" message is rare and inconsistent
- "No room below this paragraph. Try shorter text, or use PDF to Word for bigger rewrites" appeared only once (tracemonkey Abstract, left column, `tm-T1-mid-left-note.png`). Other no-room cases give "Runs past the margin or into the next text" (TAMReview abstract mid-line +31 chars where the next block is 1 line away; FDIC body paragraph +long text; `fdic-F1r`, `tam-S1r` results) or "No room for this text here, even squeezed: try shorter text" (quality-hosting table cell, `qh-Q1`). Three different outcomes for the same situation (no space below). The user cannot tell whether the page was damaged.

### P2-2 Note card covers the lines it is talking about
- The note box sits right under the edited line and hides the next lines (saeco `saeco-E1-after.png`, tracemonkey `tm-D4-after.png` covers the first line of the "Permission to make..." block, phone `phone-1-spill.png` hides most of the moved lines).

### P2-3 Selection outline stays on after the edit and cuts through the first spilled line
- `tm-U1-bottom-right-note.png`, `tm-C1-after.png`: the purple outline of the original line overlaps the top of the first continuation line.

### P2-4 Apply is delayed with no feedback
- After Enter the editor closes and the page can look unchanged for 1 to 4 s (machine was loaded). In one run (azure "Our Olive Oil..." +long) a 1.2 s wait showed no note and no change, and the right panel still said "No text changed yet"; it applied later. A user may think nothing happened and press Enter again.

### P2-5 After "Keep on one line" the text still runs off the page
- tracemonkey right column, mid-paragraph edit then "Keep on one line": the line goes back to one line (lines below move back up, correct) but it extends past the page edge and is clipped (`tm-D2-keepone.png`). Note changes to "Runs past the margin..." with "Fit to width". Behaviour matches the description, only the clipped result is ugly.

## What worked well
- Spill itself: tracemonkey right-column bottom last line (`tm-U1`): 3 new lines, justified, readable, note "Continued on 3 new lines" + Keep on one line. Mid-paragraph spill (`tm-C1`): "one mapping of values to types..." reflowed into 2 new lines, the rest of the paragraph moved down, other lines' words unchanged, note "Continued on 2 new lines; the lines below moved down".
- Second edit on a line that was moved by an earlier spill worked (`tm-C2`), spilled again by 1 line, correct order, no overlap.
- Undo / redo (two levels each, toolbar arrows) restored and re-applied the exact layout; panel counter ("No text changed yet", "1 / 2 text edits applied") stayed correct.
- Keep on one line puts text back and moves the lines below back up.
- Delete a whole line: lines below move up by one line, note "The lines below moved up" (FDIC body, TAMReview abstract, tracemonkey intro). Deleted text gone, neighbours unchanged.
- Run: "Done" screen, Download button works. Downloaded pdfjs-tracemonkey-edited.pdf (mupdf text check, page 1): continuation lines in the right order ("one mapping of values to types. When the VM executes a / compiled and then a considerably longer continuation of this / sentence follows right here / trace, it cannot guarantee ..."), deleted line "deployment as easy as ..." absent, neighbours intact, still 14 pages.
- Esc cancels typed text (no edit recorded). Single click edits one word.
- Phone 390x844: edit and spill work, no horizontal page scroll.
- The one "No room below this paragraph" case kept the page untouched and the editor open.

## Not tested
- Deleting lines in quality-hosting (table description block): my screenshot clip was off and the before/after diff ambiguous, so whether the lines below closed the gap there is unverified.
- Double-tap on phone (hint there only says "Tap a word to change it.", so whole-line editing on touch is undiscoverable; not tried).
- Spill on a table cell with real blank space below, spill on right-to-left text, multi-page documents beyond page 1, redo after Keep on one line, Run with 5+ edits.
- Visual check of the downloaded PDF render (only text-checked with mupdf).
