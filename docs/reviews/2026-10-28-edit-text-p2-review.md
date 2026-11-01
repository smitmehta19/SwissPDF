# Review: Edit text phase 2 (2026-10-28)

Scope: uncommitted working tree on `wip-parity`: `src/lib/editTextOps.js`, new `src/lib/editParagraph.js`, `src/tools/v2/edittext.jsx`, `edittext.css`, `edit.jsx`, tests `cases-edittext.mjs`, `page-harness-edittext.js`, `edittext-ui.mjs`. Spec `docs/plans/2026-10-28-edit-text-phase2.md`. `src/lib/fonts.js` is unchanged (no diff).

Probes (scratch, gitignored): `scratch-edittext/review/probe1.mjs` to `probe6.mjs`, outputs in `scratch-edittext/review/out/`. Run with `node <probe>.mjs` from that folder.

**Verdict: changes needed.** 1 P0 (carried over from phase 1, made wider by paragraph delete), 4 P1, 7 P2. The DoD asks for no P0/P1.

## P0

### P0-1 Removed text survives in the structure tree (StructElem /ActualText, /Alt) after finalizeEdits
- Where: `src/lib/editTextOps.js:2502-2537` (`removeGlyphs` calls `cleanPageMarked`), `cleanPageMarked` at `:1195`, which only walks content streams and `/Properties`. Nothing in the file touches `StructTreeRoot`.
- Repro: `node probe6.mjs`. Tagged page, `/P <</MCID 0>>` around a 3-line paragraph, StructElem with `/ActualText (Patient Johnsonwell was seen today)` and `/Alt (Note about Johnsonwell)`. Paragraph edit "Johnsonwell" to "Smithers", and a paragraph delete (empty text), both then `finalizeEdits`: the final file still holds both strings in the StructElem. A screen reader, a tagged-text extractor or a look at the object shows the old name.
- Context: plan item C5 (P2 #5) covers this and is marked NOT DONE in `status-engine.md`. It is pre-existing in phase 1, but paragraph delete makes it a likely path for "remove this personal text". The task's own P0 definition (old text recoverable) applies.
- Fix: after a successful removal, walk the StructTreeRoot elements whose `/Pg` is this page (and their MCRs), and drop `/ActualText`, `/Alt`, `/E` that contain a removed word (same `hasOld` rule as `cleanMarked`) or whose MCIDs no longer show any glyph. Until then, say it in the UI note for tagged files.

## P1

### P1-1 Unchanged ligature words come back with a space in the text layer ("diffi cult")
- Where: unchanged words are redrawn by `exactOf` in `editParagraph` (`editTextOps.js:2194`): `sameFont(..., {exact})` rejects ligatures (`:837`), so they go through `gidDraw` + `codeMap` (`:1469`, `:1423`), wrapped in a per-word ActualText span.
- Repro: `node probe4.mjs ../../test-corpus/reports/pdfjs-tracemonkey.pdf 1 p1-g12 languages languagesx`. Before: "... more difficult to compile ...". After: MuPDF text "more diffi cult to com-", and `pageTextModel` re-reads the paragraph as "diffi cult". Only "languages" changed. Search and copy break for untouched words in any LaTeX or Word file with fi/fl/ff/ffi; the next paragraph edit shows "diffi cult" in the editor and treats it as two words.
- Why tests miss it: `cases-edittext.mjs` (paragraph `validate`) compares `squash()`ed strings, which strip all whitespace, so "diffi cult" equals "difficult".
- Fix: draw a ligature word in one BT with one TJ and check in the scratch doc that the drawn word extracts as `it.text` (ActualText honoured); if not, fall back. In tests, compare whitespace-folded word lists of untouched words before and after, not squashed strings.

### P1-2 New lines below the paragraph overprint frames, table rules and other vector art drawn before the text
- Where: `editTextOps.js` `editParagraph`, the `blocks` list (`:2296`): `F.paints.filter((p) => p.seq > firstSeq || !overlaps(p.box, grow(paraBox, 1)))`. Any paint drawn before the text whose bbox touches the paragraph is treated as background and ignored as a whole, including its parts below the paragraph.
- Repro: `node probe1.mjs`, cases `grid` and `frame`. A table drawn as one stroked path (cell border at PDF y=612), 3-line paragraph in the top cell, text appended: report `3->5` lines, not refused; `out/grid-out.png` shows line 4 drawn straight across the cell border and line 5 in the next cell. Same with a single `re S` frame (callout box): new lines cross its bottom edge. Real files: Word/LibreOffice tables, form boxes, letterhead templates, full-page background images with footer art.
- Why tests miss it: `pixelsOutside(..., [rep.changedBox])` excludes the new rows (changedBox includes them), and `movedOutside` only looks at glyphs.
- Fix: for rows with `k >= n0`, check that strip on a render of the page before the edit (or on the old paints clipped to the strip) and require it to be blank. Add a corpus check: the area of new rows outside the old paragraph box was blank before the edit.

### P1-3 A paragraph with an underline (or any paint drawn over it later) shows editable but every edit is refused "no-room"
- Where: same `blocks` filter: paints with `seq > firstSeq` block even where they overlap the paragraph's own rows, so `rowOk` (`:2314`) fails for the original rows too.
- Repro: `node probe1.mjs`, case `underline`: paragraph with a blue line under part of row 2, edit "brown" to "red" (shorter): refused `no-room`, `3->3`. The note says "Not enough room for this text, even squeezed: try shorter text", which is wrong advice. Underlined hyperlinks in Word exports hit this on ordinary body text.
- Fix: either mark the paragraph `covered` at model time (the UI then explains it), or test the original rows (k < n0) only against paints that did not already overlap the source rows; new rows against everything.

### P1-4 Word or line edit, then paragraph edit: the edited line is cut out of its paragraph and stranded
- Where: model grouping `editParagraph.js:59-78` (MuPDF block) via `paragraphsOf` in `editTextOps.js:622`. A phase 1 edit draws its line again after the page content, so MuPDF reads it as its own block.
- Repro: `node probe3.mjs ../../test-corpus/reports/pdfjs-tracemonkey.pdf 1`. Word "statically" to "STATICALLY" on line 2 of `p1-g12`. Re-read: `p1-g12` stays editable but its text is "... compile than\nis available ..." (line 2 missing, a false hard break), and the line is a 1-line paragraph `p1-g24`. A paragraph edit on `p1-g12` applies: `out/wtp-crop2.png` shows "than" alone at the start of line 2, a wide gap, then the stranded line running past the column; justification lost on that line. This is the normal flow (fix a word, then rewrite the paragraph).
- Fix: when reading paragraphs, merge our own SPDFBox lines back into the block whose rows they sit on (same baseline, inside L..R), or mark the paragraph `layout` when foreign text shares one of its rows, so the editor never shows a paragraph with a hole.

## P2

| # | Where | Problem | Repro | Fix |
|---|---|---|---|---|
| P2-1 | `editTextOps.js:335` (`info.byGid`) | No embedded-font check. For a non-embedded CIDFontType2 Identity-H font, MuPDF's gid comes from its substitute font, not the CID, so `gidDraw` would write substitute gids as CIDs (wrong glyphs in other viewers). Used by RTL push/pull and by `exactOf` for Arabic and Indic words. | Unverified (no such corpus file found in time). | Require `FontDescriptor/FontFile2` for `byGid`. |
| P2-2 | `editTextOps.js:631-640` (`canRedraw`) vs `exactOf` | Dev-flagged: simple fonts count as redrawable without running `codeMap`. If `codeMap` fails (not 256 glyphs, gid not found, or a mark on a second baseline in `gidDraw`), the unchanged word falls to the normal path and a char like CMSY "∗" refuses `unsupported-char` on a paragraph shown as editable. Safe (refusal), but confusing. | Code path; the `authors` row only covers the case where it works. | Run `codeMap` at model time for fonts that need it (cached per font) and mark `encoding` when a glyph of the paragraph has no code. |
| P2-3 | `editTextOps.js` `editParagraph` draw | Link annotations are not moved or dropped when words re-wrap: a link stays over whatever text now sits there. | `node probe5.mjs`: both links keep their old rects after a paragraph rewrite. | Drop or move links whose words moved, or flag it in the note. |
| P2-4 | `editParagraph.js:214-222` | Hyphen join also removes real hyphens at line ends ("self-" + "contained" -> "selfcontained"); after any re-wrap the hyphen is gone from the page and the editor shows the merged word. | Code path. | Keep the hyphen when the halves are a known compound, or show the hyphen in the editor and let re-wrap drop only soft (U+00AD) hyphens. |
| P2-5 | `edittext.jsx:37` and `:1021` | `fallbackName.split('+')` leaves spaces (engine joins names with ' + '): `fallbackFontsIn` lists names with a leading space (duplicates in the Set), the note shows "A ,  B". | Read the code. | Split on '+' and trim each name. |
| P2-6 | `editTextOps.js:2374` (`removed.filter((w) => w.length >= 2)`) | Only removed words of 2+ letters are cut from ActualText/Alt; a removed initial stays in a span's ActualText while the span still shows glyphs. | Code path. | Also cut a span whose own text no longer matches what it shows. |
| P2-7 | `cases-edittext.mjs` RTL rows; `edittext-ui.mjs` rtl paragraph check | RTL coverage is thin: `rtl-shorter` and `rtl-noroom` picked 1-line paragraphs (`p1-g15 (right, 1 lines)`), multi-line RTL re-wrap rests on one file (ArabicCIDTrueType, 2 lines), RTL push has one file (DoD says 3 per case). The UI check "rtl: paragraph edit applies, or says why not" passes on any refusal. | Run log below. | Pick multi-line RTL paragraphs (a Hebrew file or a derived file); make the UI RTL check require an apply. |

Also noted, not ranked: the synthetic test paragraph in `probe2.mjs` B ended with "at" alone on a line after a re-edit. That comes from the hard-break rule on hand-broken lines (the next word would have fitted), so it is expected, not a bug.

## Plan divergence (not ranked)
- P2 #5 (reading order, structure tree /Alt) not started; see P0-1.
- P2 #4 line-edit squeeze floor is still 60% (paragraphs 85%): needs Smit's decision (`status-engine.md`).
- P2 #2: no self-hosted Noto Sans Arabic Bold; synthetic bold for every bold-less fallback.
- P2 #1 partial (no pull when the row continues in another piece).
- DoD asks for rows for each P2 fix; #1 and #4 (engine part) have no dedicated rows.

## What I verified and how
- Targeted corpus run, with the lock: `timeout 900 npm run test:touched -- --case '^edittext-(para-|rtl-push|p2-form)'`: 28 pass, 0 fail, 0.8 min (the runner wrote `docs/test-results/2026-10-28-run.md` / `.json`).
- 'no-room' and the other paragraph refusals happen before removal; `editText` returns a copy of the input when nothing applied; a throw after removal rejects the whole call (input bytes untouched). Fallback forms are added to the doc before removal, so on a refusal they only reach a save when another page in the same call applied (orphans, dropped by finalize).
- Re-edit of a paragraph edit: earlier SPDFBox spans are cut and replaced, not stacked; old words gone from text and raw glyphs (`probe2.mjs` B).
- Paragraph-level ActualText around the old text is cleaned (`probe2.mjs` C: "SECRETX" gone from the content).
- Links survive the redaction (`probe5.mjs`), see P2-3.
- No network with document data: `fonts.js` fetches only same-origin `BASE_URL/fonts/<file>`; no fetch in the changed files.
- RTL push row passes (push -9.4, pull +4.15).
- UI (read only): Enter new line, Ctrl+Enter apply, Esc cancel with stopPropagation, Shift+Enter opens the paragraph, triple-click via `detail >= 3` on both the line layer and the open input, stale remap for paragraphs (folded text + overlapping anchor), every engine refusal reason has a WHY entry, phone bar buttons keep focus via `onMouseDown preventDefault`, Paragraph button disabled once typed.

## Could not verify
- P2-1 on a real non-embedded CIDFontType2 file.
- `codeMap` on unusual Type1 built-in encodings beyond the corpus.
- Phone bar on real iOS/Android keyboards (visualViewport inset, blur on button tap).
- `edittext-ui.mjs` and `test:quick` were not re-run (one heavy run used on the engine rows).
