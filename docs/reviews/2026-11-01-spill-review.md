# Review: edit text spill / close (uncommitted, 2026-11-01)

Scope: `git diff` of src/lib/editTextOps.js, src/lib/editParagraph.js, src/tools/v2/edittext.jsx, corpus/UI test files. Spec: docs/plans/2026-11-01-edit-text-spill.md.
Method: code read + Node runs of `pageTextModel` / `editText` on real corpus files (no browser, no corpus runner). Fuzz: about 190 line edits over tracemonkey p1-p6, attention p1-p3, TAMReview, bert, saeco, fdic (grow / close / mid-word / first-word); each spill checked for the page word multiset (expected = before minus old line plus new text) and for glyphs outside `changedBox`; each non-spill compared with `spill: false` (report and page lines identical).

Verdict: reject until P0-1 and P0-2 are fixed (both change words the user did not touch, on ordinary edits).

Counts: P0 2, P1 2, P2 5.

## P0

### P0-1 Word diff over the whole paragraph moves, duplicates or reorders words
- Where: editTextOps.js:2569-2570 (`news = e.words`, `diffWords(g.words, news)` over the whole paragraph) + editParagraph.js:538-539 (`spillLayout` puts a unit on row r0 or a later row by the row of the OLD word the LCS matched it to).
- Cause: the `diffWords` traceback matches greedily (`olds[i] === news[j]` first). When words of row r0 are removed or replaced, a new word on r0 that equals a word of a later row gets matched to that later word. Its unit is drawn on the later row at the old position, and the later row's own copy (now unmatched, `ids [null]`) is put on r0. With delta 0 the later rows are not redrawn at all, so the copy is simply extra.
- Failing inputs (all reproduced in Node, default options):
  1. reports/arxiv-1706.03762-attention.pdf p2, whole line "reduced to a constant number of operations, albeit at the cost of reduced effective resolution due" -> "" (delete the line). Result: the line is replaced by a lone "to" (the next line starts "to averaging"), nothing closes up, report `spill {lines:0}`. Page reads "...this is / to / to averaging...".
  2. reports/pdfjs-tracemonkey.pdf p1, line "ular since they are expressive, accessible to non-experts, and make" -> "ular since they are expressive, accessible to all, and make the deployment of code more plain". Result: "...and make the of" / "code more plain deployment" / "deployment as easy as...". Word order of the user's text changed.
  3. Same line -> "ular and new words, easy to read, and make deployment simple and fast". Result: "...and make simple and fast" / "deployment" / "deployment as easy...".
  4. Close fuzz: 4 of 29 whole-line deletes on tracemonkey p1-p5 (p2-l6, p2-l61, p2-l115, p2-l134) and 1 of 12 on fdic p2 (p2-l12) leave one word of the deleted line behind, duplicating the next line's word.
- Fix: in spill mode do not diff the paragraph. `spillPlan` already knows the split: words [0, i0) and (i1, end) map to themselves (from = index, head/tail too); only `mid` is diffed against W (the edited line's own old words) with the index offset. Pass that mapping (e.g. `plan.diff`) and use it instead of `diffWords`. Add rows: close the attention line above; a grow on tracemonkey p1 whose new text contains the next row's first word (check the exact page text).

### P0-2 Ligature word on a moved row printed with an extra letter ("undefiined")
- Where: editTextOps.js:2585-2600 (`exactOf`: when the exact re-encode fails, `plain(tc)` re-encodes the word's text with `sameFont`); the guard at 2784 only checks `kind === 'exact'`, which the `plain` draw also returns.
- Failing input: reports/pdfjs-tracemonkey.pdf p5, whole line "iteration of a loop. Some variables inside the loop might initially be" -> "" (close). The moved row "undefined, before they are set..." (italic F46, source `(unde\002ned)`, \002 = fi ligature) is drawn as `<756e646502696e6564>`: "unde" + fi ligature + "i" + "ned". Renders and copies as "undefiined" (checked on a render). Report `spill {lines:-1, moved:10}`, no refusal.
- Likely root cause: `encode` maps f to code 02 (the code learned for the ligature glyph that MuPDF reads as f), then draws i again.
- Fix: rows that move whole accept only a byte-exact draw (`tj` from `sameFont(..., {exact:true})`) or `gidDraw`; if a token needs `plain`, refuse the spill (fall back to the line edit). Also re-read the moved rows after drawing and undo/refuse if their text differs from the source rows. Add the tracemonkey p5 close as a row.
- The decision log assumption "words with ligatures on moved rows ... reads back whole" is false for this font.

## P1

### P1-1 Justified line left ragged when the spill fits on one line (delta 0)
- Where: editParagraph.js:572-573 (`lastLine = j === out.length - 1`, never spread). For delta 0 the only line is r0, so a mid-paragraph justified line is drawn unjustified.
- Failing input: tracemonkey p1, word edits making the first lowercase word 1-2 letters longer ("s" / "ed"), e.g. p1-l14 "Dynamic languages such as JavaScript are...": the line now ends at x 285 instead of the column edge 293.1 (also p1-l19, l20, l25, l26: ends 279-290). Report `spill {lines:0}`, no note, so the user is not told. Before this change the same edit pushed and was flagged overflow with Fit to width.
- Fix: spread j = 0 when delta is 0 and r0 was not the paragraph's last row (and not before a hard break), e.g. `lastLine = j === out.length - 1 && (delta > 0 || r0 === n - 1 || hard)`.

### P1-2 Opacity of moved rows lost (spec guard "opacity" not implemented)
- Where: editTextOps.js:2555-2556 (`alpha` / `clip` from `states[0]` only, applied to every row); the spill path has no check that all moving rows share the first glyph's drawing state.
- Failing input (synthetic, 4-line Times paragraph, row 3 drawn inside `q /G1 gs` with ca 0.4): whole-line edit of row 1 + " plus several extra words" spills; row 3 is moved and redrawn without any `gs`, so it turns fully opaque. Same when only the edited row is translucent (row 0 opaque).
- Fix: in spill mode fall back when the moving rows (r0..last) differ in alpha or clip from `states[0]`, as the spec's guard list says.

## P2

### P2-1 Probe field `align` survives a successful spill
- Where: editTextOps.js:3408. `Object.assign(one.rep, init, ...)` resets only keys in `init`; the probe's `rep.align` (not in `init`) stays. If the probe saw a centred whole line, the note says "Kept centred" while the spill re-laid it from the row start. Unverified on a real file (needs a centred line inside a 'start' paragraph).
- Fix: clear `one.rep` first (as the fallback branch does), then assign `init` and the spill fields.

### P2-2 'no-room-below' text shown when the spill failed for another reason
- Where: editTextOps.js:3414. Any spill refusal ('decorated', 'draw-failed', a link or highlight on a moved row, a word wider than the column) followed by a 'no-room' line edit becomes "No room below this paragraph". Example: derived/edittext-spill-guards.pdf p1 (link on the last row) with text long enough to pass the 60% squeeze floor. Spec: that text only when the space below is not blank.
- Fix: rename only when the spill refusal came from the blank-below / `rowOk` test; keep 'no-room' otherwise.

### P2-3 Moved rows shift by the quantised leading, not the real one
- Where: editParagraph.js:99 (`v` = mode on a 0.2 grid) feeds `g.leading`; spillLayout moves rows by `delta * lead`. Tracemonkey: real leading 9.96, rows moved by 10.00 (0.04 pt per added line, 0.2 pt after 5). Cosmetic.
- Fix: leading from unrounded baselines (median of raw origin differences).

### P2-4 Spec guard "clean stack" (left-aligned, spacing within 10%) not implemented
- Where: spillPlan, editTextOps.js:2451-2497, checks only align start/justify and leading vs size. Benign in the cases tried (rows move whole), but a list block with single-line items puts spill lines at `cont` = `g.L` (under the bullet, not the item text), and an emptied first row moves row 1 up without the first-line indent. Unverified on a real list file.
- Fix: implement the guard as written, or update the spec.

### P2-5 Test gaps
- spillCheck's "reads in order" only checks `head + next` contiguity; it would not catch P0-1 (no row inserts a word that also starts the next row, no close row with a shared word). No row checks the exact page text after a spill, ligature words on moved rows (P0-2), delta-0 justified lines (P1-1) or mixed opacity (P1-2).

## Verified OK
- Spill on the tracemonkey p1 justified paragraph: moved rows glyph-exact (same x, one dy), lines above and the other column unchanged.
- Hyphen tail ("pop-" / "ular"): the tail piece stays at the end of the last new line, the next row moves whole; a head piece changed to "ular," falls back cleanly.
- Fuzz: 0 glyphs moved or added outside `changedBox` in every spill; 0 differences between the fallback path and `spill: false` (report and page lines) across about 140 non-spill edits, so no probe/fallback state leak seen.
- Guards: link on a moved row (p1) and highlight under a moved row (p2) of edittext-spill-guards fall back; control (p3) spills.
- Second edits: spill on a moved row, close of a moved row, spill on a line with an earlier word edit (own SPDFBox span): right text and order.
- CropBox offset (tracemonkey p1 with CropBox [20 30 600 780]): same result, box shifted by the crop. /Rotate 90/180/270: no spill, old line-edit behaviour.
- UI: Keep on one line only for `spill.lines > 0`, unrefused line notes; resends with `spill: false` and replaces the version; fit mode never spills; note copy matches the spec.
- Whole-line trim only for `wordIndex == null`.

## Not checked
- Browser UI flow (no Playwright run), screenshots, focus after apply.
- RTL / vertical (code returns null before any change; not run).
- Tagged PDFs: structure tree / ActualText after a spill (moved rows lose their MCIDs, as in paragraph mode; not measured).
- Form fields near moved rows, the underline (decor) guard on real files, clip differing per row.
- Cost of the double editPage call on large pages.
- A `removeGlyphs` refusal inside a spill followed by the fallback edit on the same `P` (restore path): not reproduced.
