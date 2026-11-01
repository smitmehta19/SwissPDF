# Review 2: edit text spill / close, fix round 1 (uncommitted, 2026-11-01)

Scope: `git diff` of src/lib/editTextOps.js, src/lib/editParagraph.js, scripts/corpus-test/cases-edittext.mjs, src/tools/v2/edittext.jsx. Round 1: docs/reviews/2026-11-01-spill-review.md.
Method: Node only (no browser, no corpus runner). Round 1 repros re-run. New fuzz: page word sequence in reading order (stricter than the char multiset) for mid-line word growth, middle word replaced by text repeating the next line's first words, whole line + next line's words, first word, last word, whole-line delete. A copy of src/lib with refusal reasons tagged (scratch only) to see why spills fell back.

Verdict: fix. One P1 (text of untouched words changed in copy/search on a real file). Round 1 P0/P1 all closed.

Counts: P0 0, P1 1, P2 4.

## P1

### P1-1 Untouched words after a minus sign merge with the next word in copied text (free-fiber)
- Where: editTextOps.js:2933-2955 (spill rows drawn one word per BT, no space glyph between words); layout from editParagraph.js:spillLayout.
- Repro: invoices/free-fiber.pdf p1, run p1-l65 ("Free SAS au capital de 3.441.812 Euros − B 421 938 861 RCS Paris − Siège social: ..."), `wordIndex: 3` ("capital") -> "capital plus several more inserted words here to push it over".
- Observed: `spill {lines:1, moved:0}`, page reads "Euros −B 421", "Paris −Siège", and the new line "−N° de TVA ...". Glyph positions are right (gaps 1.9 pt, same as the other words, which do read with spaces).
- Expected: "Euros − B", "Paris − Siège", "− N° de TVA". Same edit with `spill: false` is refused 'no-room', so this text change is new with spill. Search for "B 421" now fails.
- Cause (likely, unverified): the source had real space glyphs; MuPDF does not infer a space after U+2212 from the gap alone. Moved rows are drawn the same way, so a moved row holding " − " likely merges too (not reproduced).
- Fix: draw the source's own space code between words where the font has one; and/or after drawing, re-read rows r0..last and fall back when the word sequence differs from the expected text (a generic net for this and unknown font cases). Add this edit as a corpus row with an exact word-sequence check.

## P2

### P2-1 New words on the re-laid line sit 0.05-0.1 pt off the line's baseline
- Where: editParagraph.js:569 and 587 (`r0v = g.rows[r0].v`, the rounded row v) used for new words (editTextOps.js:2940); kept words use their true baseline (`dv`).
- Repro: tracemonkey p1-l14, `wordIndex: 2` "such" -> "suchs": "suchs" drawn at y 434, the other words at 433.951. free-fiber above: new words 63, kept 62.9.
- Fix: take row r0's real baseline (spillPlan already computes `base`) as `r0v`. Cosmetic.

### P2-2 'no-room-below' can name the wrong cause (unverified)
- Where: editTextOps.js:2808 + 3438. Any `rowOk` failure (page margin, clip, a glyph on the same line for a delta-0 re-lay) becomes 'no-room' and then "No room below this paragraph" when the line edit is also 'no-room'. Not reproduced on a real file.
- Fix: return a distinct reason for rows that are not fresh (k < n0).

### P2-3 Round 1 P2-4 still open (clean-stack guard, list items)
- Not part of this round; spec guard "not a clean stack" still not implemented. Keep in the plan or update the spec.

### P2-4 Test gaps
- No corpus row for the P1-1 (round 1) delta-0 justified spread, nor for a mid-line word edit that spills. `close-attention` is `either` and now falls back (link on a moved row, 'spill-blocked' by the annots check), so it no longer exercises the P0-1 path; the tracemonkey `grow-next-word` row does.
- spillCheck counts characters, so it would not catch P1-1 above (merged words keep every char). Compare the page word sequence instead.

## Verified OK
- P0-1: tracemonkey p1 "ular since ..." both round 1 texts: exact order, next row whole ("deployment as easy as ..."). attention p2 close: now falls back cleanly (link guard), line removed, no stray "to".
- P0-2: tracemonkey p5 close: `spill {lines:-1, moved:10}`, "undefined," reads and renders right (render checked at 3x).
- P1-1 (round 1): tracemonkey p1 l14/l20/l25/l26 one-word growth: `spill {lines:0}`, line ends at 293.1 (column edge). l19 ("thated") falls back as 'no-room' (heading below), old overflow behaviour.
- P1-2: alpha/clip check in place; 0 'spill-blocked' from it across about 1000 edits on tracemonkey, TAMReview, attention, saeco, free-fiber (not refusing too often).
- P2-1, P2-2, P2-3: code read; P2-3 moved rows land on lead from baselines.
- Word-sequence fuzz, 0 bad: tracemonkey p1,p2,p5 mid (280 tried, 58 spills), rep (278, 52), p1-p3 nxt (230, 44), p2 first (40, 0 spills: no room), p3 last (40, 5); TAMReview p1-p3 mid (3 spills), nxt (3), del (14 closes); attention p3 rep (1); free-fiber del (2); saeco p1 mid/nxt (0 spills, no room). Only bad result: free-fiber mid (P1-1).
- Synthetic Times paragraph with em dash, en dash and hyphen on a moved row (close and grow): reads back right.
- UI diff: "Keep on one line" resends with `spill: false`; fit mode never spills.

## Not verified
- Browser UI, screenshots, the "Keep on one line" flow when the one-line edit is refused (the spilled version probably stays with a refusal note).
- Moved rows holding U+2212 (P1-1 on moved rows).
- Tagged PDFs, form fields near moved rows, RTL/vertical.
- Ligature words on the re-laid line when both byte-exact and gidDraw fail (falls to the 'same' re-encode that printed "undefiined" in round 1); no case found.

## Round 3 (fix round 2 check)

Scope: `drawRows` refactor and `spillReadsBack` in src/lib/editTextOps.js, corpus row `edittext-spill-words-apart-free-fiber`.
Method: Node only. Old vs new on the same edits: the round 2 copy of src/lib (pre-fix, refusal tags only, in the round 2 scratchpad `r2/inst`) against the working copy, comparing the edited page's content streams and the report. A debug copy of the new lib (scratch only) to print what the scratch page reads.

Verdict: fix. One P1 (the check reads a different page than the real one; it blocks good spills and can, in principle, pass bad ones). Simple fix, then re-run.

Counts: P0 0, P1 1, P2 4.

### P1-1 The scratch page box changes MuPDF's space decision (check disagrees with the real page)
- Where: editTextOps.js:1134 `doc.addPage([-20000, -20000, 20000, 20000], 0, res, content)`.
- Repro: reports/pdfjs-tracemonkey.pdf p1, run p1-l46 ("on the first page. To copy otherwise, ..."), `wordIndex: 7` "otherwise," -> "otherwise, plus several more inserted words here to push it over".
- Observed: scratch page reads "978-1-60558-392-1/09/06... $5.00" (space before "$"), expected "...$5.00", so the spill is refused and the edit falls back to 'no-room'. The round 2 code spilled this edit and its real page reads "...$5.00" (correct). The word is one TJ with -150 gaps (0.15 em, MuPDF's space threshold): at coordinates near 20000 float rounding flips the decision.
- Proof: same debug copy with the scratch box set to the page's MediaBox [0 0 612 792]: check passes, spill applies. Box [-2000..2000] reads a third way ("06." "." "." "$5.00"). free-fiber with its own box [0 0 595 842] is still blocked (P1-1 of round 2 still caught).
- Impact: tracemonkey p1,p2,p5 mid: old 58 spills, new 52; all 6 lost (p1-l43..l47, l49, the ACM footer paragraph) were correct before (word multiset unchanged). The other direction (scratch reads a space the real page does not, so a merge passes) follows from the same cause; not reproduced.
- Fix: give the scratch page the source page's own MediaBox, CropBox and Rotate (so the page matrix and float values match the real page), then re-run the spill rows and the round 2 fuzz.

### P2-1 A throw in spillReadsBack breaks the edit instead of falling back (unverified)
- Where: editTextOps.js:1112-1145 and the spill call in editText (3479). No try/catch: a throw from graftObject, insertPage or toStructuredText leaves editParagraph and editText (the spill call is not guarded), so the user gets an error, not the old line edit. No repro found.
- Fix: wrap the body in try/catch -> false; destroy the page in finally.

### P2-2 Scratch pages are not deleted
- spillReadsBack leaves its page (and grafted fonts/forms) in the scratch doc; inkOk deletes its own. Bounded: one check per page per editText call, scratch doc destroyed at the end of editText. Fix: `doc.deletePage(n)` in a finally, as inkOk does.

### P2-3 Comment out of place
- editTextOps.js:1103-1112: spillReadsBack was inserted between inkOk's header comment and inkOk, so that comment now sits above the wrong function.

### P2-4 Builder's spill-rate claim not reproduced
- "Same spill rate as before (51/232 mid)" on tracemonkey: round 2 counted 58 spills in 280; this run 58 old vs 52 new (P1-1). Re-measure after the fix.

### Verified OK
- drawRows refactor (code read: same ops, `tm` built from the same `P.page`, form names made the same way, `gs` passed in): old vs new byte-identical page content and report for 274 of 280 tracemonkey p1,p2,p5 mid-word edits (incl. 52 spills; the other 6 are P1-1), 36 paragraph edits (`paragraphId`, insert and delete) on tracemonkey p1,p2,p5, 18 TAMReview p1-p3 whole-line deletes (14 closes). 0 throws.
- free-fiber repro (`wordIndex: 3`): refused 'no-room', same as `spill: false`; output bytes identical to the input. Whole-line variant (the corpus row's edit): old overflow line edit as before, reads "Euros − B 421".
- Refusal happens before removeGlyphs; doc changes before it (unused fallback forms) are the same as round 2's earlier refusals.
- Scratch doc lifetime: one per editText call, destroyed in its finally.
- Code read, no real-file run: hyphen halves (each half's own text, row break reads as a word break), glue items (joined only inside a row), ligatures (NFKC both sides), ActualText forms (MuPDF reads ActualText), gidDraw fonts (same font as the source page).

### Not verified (time budget)
- Rotated pages, Type3 fonts, CJK glue and ActualText forms on real files.
- Copy text in other readers (pdf.js, PDFium): script written (`r3/pj.mjs` in the scratchpad), not run.
- Rest of the old vs new batch (tracemonkey nxt/rep, attention del/mid, TAMReview and saeco paragraphs, fdic mid): stopped at the time budget.
