# Status: engine (edit text phase 2)

Owner: engine dev. Files: `src/lib/editTextOps.js`, `src/lib/editParagraph.js` (new, pure layout), `scripts/corpus-test/cases-edittext.mjs`, `page-harness-edittext.js`. Not touched: `src/lib/fonts.js`, `public/fonts/`, `src/app/ops.js` (no new worker op).

## Steps
- 1 paragraph model in `pageTextModel`: DONE
- 2 paragraph op LTR: DONE (rows shorter / longer / justified / bold / no-room / delete, 3 real files each)
- 3 RTL: DONE line push + pull (gid redraw), RTL paragraph (rows on udhr-arabic + ArabicCIDTrueType)
- 4 P2: #1 partial, #2 synthetic bold DONE (no Arabic Bold font file), #4 paragraph part DONE / line part kept at 60%, #5 NOT DONE, #6 DONE
- Coordinator fixes (2026-10-28): author paragraph with "∗" editable, same-length swap keeps line breaks + original font, `edittext-report-pdfjs-tracemonkey` green again, delete ('') rows added: DONE
- Results: tier 1 `docs/test-results/2026-10-28-p2-engine-t1c.md` (66 edittext rows) + `-t1d.md` (24 new rows, 0 fail); tier 2 `docs/test-results/2026-10-28-p2-engine-quick.md` 195/195
- Fix round (review + blind test, 2026-10-28): see "Fix round" below. Tier 1 `2026-10-28-p2-fix-t1i.md` (79 edittext rows, 78 pass; the 1 fail was the test picking a word whose glyphs are not bold, fixed and green in `-t1k`). Tier 2 ops layer `2026-10-28-p2-fix-quick-ops.md` 161/161. Full `test:quick` was cut by its 900 s timeout: 20 `intake` UI rows waited 60 s each for the shell ("UI shows a result") while Shell.jsx / ResultScreen.jsx were being changed and the UI dev's `edittext-ui.mjs` + `serve-pages-sim` were running; not engine rows.

## Spill and close-up (2026-11-01, plan `docs/plans/2026-11-01-edit-text-spill.md`)

- A single line edit that does not fit continues on new lines below; later rows of the paragraph move whole. An emptied line moves the rows below up. Anything unsafe falls back to the old line edit (`editText` option `spill: false` and the UI's "Keep on one line" do the old edit on purpose).
- Code: `spillPlan` (word map from the edited line only, precise leading), `editPage` decide hook, `editParagraph` spill mode, `spillLayout` (editParagraph.js), `spillReadsBack` (scratch page with the page's own boxes: words must read back the same, else fall back).
- Guards: links/annotations or paint under moved rows, decoration, alpha/clip differing in the paragraph, moved words that need re-encoding, RTL/vertical, centred, leading out of range, a word wider than the column.
- Reviews: `docs/reviews/2026-11-01-spill-review.md` (reject: word mix-up, ligature misprint), `-spill-review-2.md` (round 2: merged copied words; round 3: scratch box too big, fixed), blind `2026-11-01-blind-spill.md` (0 P0; P1s are existing behaviour, parked).
- Gate: full corpus `docs/test-results/2026-11-01-spill-gate.md` 978/978.

## Ship prep (2026-10-28, after review 3)

- Paragraph editing is hidden in the UI and parked (logged rule after review 3 P0-1). The engine op and its rows stay.
- `pageTextModel(bytes, pageNum, { paragraphs = false })`: paragraphs (and the nearby-page hyphen lookup, review 3 P2-5: up to 432 ms per read) only on request; `paragraphs: []` otherwise. Worker op `editTextModel(bytes, pageNum, opts)` passes it; the corpus harness and cases pass `{ paragraphs: true }`.
- Dynamic XFA (review 3 P1-4): a file whose form exists only as XFA (Catalog NeedsRendering true, or no AcroForm fields besides signatures; same test as docOps `dynamicXfa`): every run `why: 'xfa-dynamic'`, every edit refused `'xfa-dynamic'`, bytes unchanged. Static hybrid forms (irs-fw9) keep the XFA drop; `NeedsRendering` is now removed from the Catalog (it was deleted from /AcroForm, where it never is). Rows `edittext-xfa-dynamic-xfa-issue14315`, `edittext-xfa-dynamic-xfa-imm1344e-filled`.
- Word path after review 3 P1-1: row `edittext-word-p3g6-pdfjs-tracemonkey` (one word in p3-g6 made longer): the edited line and every other line re-read as editable runs.
- UI copy needed: `'xfa-dynamic'` (suggest docOps' DYNAMIC_XFA_MSG: "This is a dynamic XFA form: the form exists only as XFA ...").

## Parked: paragraph re-wrap (pick up later)

Open findings from `docs/reviews/2026-10-28-edit-text-p2-review-3.md` (paragraph mode only):
- P0-1 Camel-case words broken at a capital print with a hyphen mid-line ("Trace-Monkey"): `hyphenKind` says 'real' on a capital before looking up the joined form. Fix: joined form first ('soft'), then the hyphenated form, then the capital / own-hyphen rule; row on tracemonkey p2-g5 that keeps "TraceMonkey" whole.
- P1-1 After a paragraph edit at the end of a column, the paragraph and the next column's paragraph re-read as one non-editable 'layout' paragraph (`ownLinesHome` home block by top-left; the first-line indent breaks the match). Fix: home block by overlap with the paragraph box, never a block outside its x-range; row on tracemonkey p3-g6 re-reading both p3-g6 and p3-g8 editable.
- P1-3 Justified paragraphs come back with squeezed (91%) and ragged lines in the window. Fix: grow the window (more lines re-laid, justified gaps down to about 80%) before squeezing; one scale for the whole paragraph; for 'keep' breaks also count this page outside the paragraph; checks for short lines and mixed scale.
- P1-5 Address blocks (coolblue) still re-wrap across lines and close the gap below. Fix: in start-aligned blocks of short lines, each source line end is a hard break and a line may use free room to its right; check the expected lines and the gap.
- P1-6 Tests: the coolblue / twice / abstract / line-then-para rows cannot see the above (only window start, squeeze flag, widest gap).
- P2-3 The mid-line hyphen check skips pairs the engine kept hyphenated, so a wrong 'real' never fails: allow a pair mid-line only when its hyphenated form occurs mid-line in the source file.
- P2-5 Hyphen lookup cost (432 ms per model read on tracemonkey p5); cache per document and count this page minus the edited paragraph. (Now skipped unless paragraphs are requested.)
- P2-7 A line edit then a paragraph edit leaves the line-edited row short inside a justified paragraph when the window starts below it.
- Carry-overs: review 2 N4 (MuPDF reads spread justified words one per line), N5 (no hyphenation), links not moved, RTL multi-line coverage (one real file).

## Final engine round (review 2 + blind round 2, 2026-10-28)

Results: tier 1 `2026-10-28-p2-final-t1d.md` 89/90 (the 1 fail was the test picking a no-op swap, "occurring" c/c; fixed, green in `-t1e`), tier 2 `2026-10-28-p2-final-quick.md` 197/197.

API changes for the UI:
- Report `window: [firstLine, lastLine]` (source lines re-laid; others untouched).
- Refusal `'decorated'` (paragraph window or a word/line edit would move words under an underline/strike).
- `editText` result `xfaRemoved: true` when the file's XFA copy of the form was dropped.
- `paragraph.text` at a hyphen line break: soft (the joined word appears mid-line on other pages, or U+00AD) reads without the hyphen ("compile"); real (hyphenated form found, or right part has a capital / its own hyphen) and not known read with it ("pre-train"). A word whose break is "not known" never moves mid-line (its line break is kept).

1. Reflow window: lines above the first changed line are never removed or redrawn; layout runs from that line and stops before the first line where the remaining words are the source's (same pieces, same hyphen breaks); squeeze only in the window. Window lines carry `/SPDFPara [paragraph box]`, so the model puts them (and the untouched lines below) back into one paragraph.
2. Hard breaks: next line's first word fits -> hard ('\n'); font change still breaks, except for lines we drew (fit test only). coolblue address still reads as one text (its lines do not pass the fit test), but an edit of the street line leaves the name line untouched and squeezes only window lines (row `para-coolblue-address`).
3. Hyphens: as above; kept breaks keep their original glyphs (pieces); `dehyph` removed from the tests.
4. Decorations: refused 'decorated' (rows `decor-underline-word`, `decor-underline-change`); an edit that does not move decorated words applies (`decor-underline-append`, window [2,2]).
5. XFA dropped on any applied edit (row `xfa-fw9-partnership`: no XFA, one caption copy fewer, none in XFA).
6. N2: ActualText/Alt/E cleaned only for marked content that lost glyph bytes in this edit (compared span by span before/after redaction); struct elements only when one of their MCIDs on this page lost glyphs; page-less elements only through an MCR to this page; whole-word fallback only when spans cannot be compared. Rows `para-struct-keep-others` (figure Alt and page-2 ActualText kept), `para-struct-synthetic` / `-us-budget` (P0-1) still pass.
7. N8: stretch check in `para-twice-*`, `para-abstract-twice-*`, `para-line-then-para-*` (widest gap within 2x source median or 1.05x its widest). A justified window line is left ragged rather than spread past 2x the natural gap. N3: placeContent comment now matches the code.
8. Rows: `para-abstract-twice-pdfjs-tracemonkey`, `para-right-col-delete-pdfjs-tracemonkey`, `para-line-then-para-pdfjs-tracemonkey`, `para-coolblue-address`, the underline rows, `xfa-fw9-partnership`, `para-struct-keep-others`. Every paragraph row now checks: the re-read paragraph is exactly the new text, no source line-end hyphen printed mid-line, other glyphs unmoved outside the window box.

## Fix round (code review + blind test)

API changes the UI must know (NEW this round):
- `paragraph.text` keeps a real hyphen at a line end: "English-" + "to-German" reads "English-to-German", "com-" + "pile" reads "com-pile" (never drop a real hyphen). A soft hyphen (U+00AD) still joins without it. When the edit keeps that line break the hyphen goes back at the line end.
- A spacing accent drawn before its letter reads as the letter: "na¨ıve" -> "naïve".
- Paragraphs also split where an all-bold line meets an all-regular line (a heading over body text).
- Report `decorations: true` when an underline/strike drawn over the old lines was kept in place (it does not move with re-wrapped words).
- Refusal `'covered'` (not 'no-room') when the new text is not longer yet something on the lines blocks it. So "try shorter text" is only shown when shorter text could help.
- ActualText is now only on shaped-script fallbacks (Devanagari): same-font and Latin fallback text reads from its own glyphs. This fixed poppler reading word edits reversed ("y na pm oC").

UI change needed for blind P1-7 (not made, UI file): none required. The engine and `edittext.jsx` both refuse text with U+FFFD on purpose; udhr-arabic's lam-alef ligature glyphs have no ToUnicode entry and the subset font has no cmap, so those letters are unknown (checked: 0 presentation forms in the font's cmap). Words without U+FFFD on those lines can be edited by clicking the word (the UI checks the word, line, or paragraph text as chosen). Suggested UI copy for the refusal: "Some letters here can't be read. Click a single word to edit it."

Reading order (P2 #5, time-boxed round, 2026-10-28): report field NEW `order: 'inline' | 'appended'` on every applied edit.
- `placeContent` puts the new draw where the old text was read: at a cut in the redacted content after the last kept glyphs read before the edit and before the first read after it (binary search with MuPDF stext on content prefixes). Cuts: between operators where no open q level set a clip or ExtGState, outside marked content and BX/EX; or inside a text object right before a line move (Td TD Tm T*), where the insert closes the BT and restores the line matrix (pdfTeX pages are one BT). The CTM there is undone; text state is reset inside the insert.
- The page must render the same (2x, tolerance 8) as with the draw appended, else it is appended. tracemonkey body paragraphs fall back this way (a sub-point shift showed up in the next column); the cause is not found.
- A line edit that overflows its column is always appended (read in place it joined the next column's paragraph on bert).
- Tagged text inside a marked-content span inside a text object (irs-fw9 labels) has no legal cut: appended. Poppler reads appended text in place anyway.
- Rows: `edittext-order-title-pdfjs-tracemonkey` (inline; MuPDF, pdf.js and poppler read the title in order), `edittext-para-order-attention-intro` (inline; the paragraph reads between the heading and the next paragraph in MuPDF, pdf.js, poppler), `edittext-order-w9-company` (appended; poppler in place).
- Repeat-edit size (fixed): aws, N repeated edits then one finalize, minus one direct edit: before 5 -> +1968 B, 10 -> +4318, 20 -> +8700 (about 430 B and 31 objects per edit). The extra objects were free xref slots (null objects): `garbage` level 1 drops unused objects but keeps their numbers, and each edit makes about 30 short-lived objects (placement probes, checks). `finalizeEdits` now saves `garbage=compact` (safe here: this op never does the resolve() walk behind MuPDF's compact bug). After: 5 -> +310 B, 10 -> +322, 20 -> +20, flat. Limit unchanged. Row `edittext-repeat-aws-invoice`: 148716 B vs 148679 B. Tier 1 `2026-10-28-p2-size-t1.md` 81/81.
- Found while measuring: the 40th repeated edit of the same aws word is refused `tight-lines` (page left unchanged); edits 1 to 39 apply. Not investigated.

Not done this round:
- P2 #5 / blind P1-1 for MuPDF and pdf.js (before the placement round): edited text is still drawn after the page content, so those two read it at the end of the page. Inserting at the old content position needs the graphics state at that point (CTM, clip, colour space, ExtGState, across a split /Contents array) and MuPDF's redaction drops the ops that would mark the place; a wrong insertion paints under later boxes or with a stacked transform. Poppler now reads in place (row `edittext-order-title-pdfjs-tracemonkey`, pdftotext found in /mingw64/bin).
- Review P2-3 (links not moved with re-wrapped words), P2-7 (RTL multi-line coverage: still one real file for multi-line RTL), blind P2 polish (justified-line hole after a shorter word edit, squeeze when a gap was free, Nimbus vs Times fallback), blind P1-6 (UI: refused paragraph text kept).

## API for the UI (as shipped; NEW = additions to the plan)

`pageTextModel(bytes, pageNum)` also returns `paragraphs`:

```
paragraphs: [{
  id: 'p<page>-g<k>',          // valid only for the bytes they came from
  runIds: ['p1-l58', ...],     // runs (stext lines) it is made of
  bbox: [x0, y0, x1, y1],      // view space
  text: '...',                 // lines joined with a space; "com-" + "pile" -> "compile";
                               // NEW: '\n' = hard break in the source; Chinese/Thai join without spaces
  align: 'left' | 'right' | 'centre' | 'justify',
  dir: 'ltr' | 'rtl',
  editable: boolean,
  why: null | <run why> | 'no-unicode' | 'covered'
       | 'layout'   (NEW: pieces side by side far apart, a table row; or mixed directions)
       | 'encoding' (NEW: a glyph that can be drawn neither in its font nor by a fallback),
  lines: 12,                   // NEW: visual lines
  fontSize: 9,                 // NEW: main size (pt)
}]
```

Paragraph = one MuPDF text block, split where the text size changes. Visual lines = rows (stext lines on one baseline join).

Real example (tracemonkey p1): `{ id: 'p1-g20', runIds: [12 ids], bbox: [317.01, 387.84, 556.12, 505.44], text: 'Compilers for statically typed languages ... a web browser.', align: 'justify', dir: 'ltr', editable: true, why: null, lines: 12, fontSize: 9 }`. Hard-break example (aws `p1-g2`): `"Service Provider:\n(Not to be used for payment remittance)\nAmazon Web Services, Inc.\n410 Terry Ave North\nSeattle, WA 98109-5210, US"`.

Edit: `{ pageNum, paragraphId, text, old? }` in the same `editText` call. `''` deletes the paragraph. One paragraph edit per page per call; other edits on that page in the same call get `refused: 'conflict'`.

Report: `{ paragraphId, font: 'original' | 'fallback' | 'mixed' | null, fallbackName, lines, overflow, refused, char?, fit, box, changedBox }`.
- fallbackName: names joined ' + '; NEW suffix ' (synthetic bold)' (was '(no bold version)' in phase 1, line edits too).
- overflow: needed lines below the old box, or squeezed.
- refusals: run whys, 'stale', 'not-found', 'no-room', 'render-mode' (NEW: outlined/clipping text), 'conflict', 'unsupported-char', 'no-glyph', 'tight-lines', 'inline-image', 'draw-failed'. Refused = bytes unchanged.

Layout rules: if the new text still fits the source's own line breaks (each kept word on its old line, new words on the line of the word before), those breaks are kept, hyphenated halves included; else greedy re-wrap. More lines: free space below at the same spacing, then squeeze to 85%, then 'no-room'. Fewer lines leave the space empty.

Line edits (phase 1 API unchanged): RTL lines now push/pull the rest of the line (`pushed` negative = moved left). `noPush: 'rtl'` only for mixed RTL/LTR edits on one line.

## Not done / limits
- P2 #5 (reading order, structure tree /Alt): not started (time). New text is still drawn after the page content.
- P2 #2: no self-hosted Noto Sans Arabic Bold; synthetic bold (fill + 0.03 em stroke) for every bold-less fallback.
- P2 #4 line edits: auto-squeeze floor stays 60%. Raising it to 85% refused edits two phase 1 rows rely on (tracemonkey 'longer', aws repeat step 7). Needs a decision.
- P2 #1: lines whose row continues in another piece no longer pull (a gap opened in the middle); moved runs that cannot re-encode exactly now redraw at their font widths instead of blocking the pull. Other noPush cases (covered, opacity, clip) still leave the gap.
- RTL push: one real file (udhr-arabic); the other Arabic file repeats one phrase (no unique word). Pushing does not move other pieces of the same visual row (the row then reports collision and stays put).
- RTL paragraphs: re-read can split into one paragraph per line (wide line spacing); pdf.js text of Noto Arabic is soft.
