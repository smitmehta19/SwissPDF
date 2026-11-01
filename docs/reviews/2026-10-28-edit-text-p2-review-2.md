# Review 2: Edit text phase 2 fix round (2026-10-28)

Scope: uncommitted tree on `wip-parity` after the fix round: `src/lib/editTextOps.js`, `src/lib/editParagraph.js`, `src/tools/v2/edittext.jsx`, `edit.jsx`, `edittext.css`, `src/app/Shell.jsx`, `ResultScreen.jsx`, tests `cases-edittext.mjs`, `page-harness-edittext.js`, `edittext-ui.mjs`. Inputs: first review `2026-10-28-edit-text-p2-review.md`, blind test `2026-10-28-blind-edit-text-p2.md`, `docs/team/status-engine.md`, `status-ui.md`, dev-notes phase 2.

Probes: old ones re-run from `scratch-edittext/review/`; new ones in `scratch-edittext/review2/` (gitignored): `para.mjs` (paragraph edit + crops + MuPDF text), `word.mjs`, `pjs.mjs` (pdf.js text), `struct.mjs`, `compact.mjs`, `arabic.mjs` (with the `/fonts/` fetch stub), `fonts.mjs`, `w9.mjs`, `crop.mjs`. (`final.mjs` crashed on a missing paragraph and was not used.) Outputs in `scratch-edittext/review2/out/`. Run with `node <probe>.mjs ...` from that folder.

**Verdict: changes needed.** 1 P0, 1 P1, 6 P2 new. Of the 15 earlier P0/P1 items (5 from the first review, 10 from the blind test), 12 fixed and 3 partly (blind P1-1, P1-3, P1-7; none regressed). The P0 is the blind test's P0-2 turned inside out: the fix keeps every line-end hyphen, so TeX break hyphens now print mid-line after a re-wrap.

## 1. Fix verification

### First review

| Item | Verdict | Evidence |
|---|---|---|
| P0-1 removed text in StructElem /ActualText, /Alt | Fixed (but see N2) | `review/probe6.mjs`: replace and delete both leave ActualText and Alt null in the final file. Rows `edittext-para-struct-synthetic`, `edittext-para-struct-us-budget` pass (raw scan of the final file, real tagged file). |
| P1-1 ligature words get a space ("diffi cult") | Fixed | `review/probe4.mjs tracemonkey 1 p1-g12 languages languagesx`: MuPDF text "more difficult to com-", re-read "difficult". Chain probe on p2 keeps "difficult", "first", "naïve". New hard check "every word reads back whole (model, spaces kept)" in paragraph rows. |
| P1-2 new lines cross frames and table rules | Fixed | `review/probe1.mjs`: `frame` and `grid` now refuse `no-room` (were 3->5 lines over the rule). `bgpath` and `plain` still grow 3->5. Rows `decor-frame`, `decor-grid`. |
| P1-3 underline blocks every edit | Fixed | `probe1.mjs` `underline`: applies, `out/underline-out.png` keeps the line breaks; report `decorations: true` (row `decor-underline`). |
| P1-4 word edit then paragraph edit strands the line | Fixed | `review/probe3.mjs`: after "STATICALLY" the paragraph re-reads whole with STATICALLY in place; the paragraph edit applies inside the column (`review2/out/wtp.png`). Rows `para-word-then-para-*` (tracemonkey, bert). Note: that crop also shows N1. |

### Blind test

| Item | Verdict | Evidence |
|---|---|---|
| P0-1 hyphens vanish from re-typeset text | Fixed | attention p1 abstract, last sentence deleted (`para.mjs ... attn-abs2`): "English-to-German", "single-model", "state-of-the-art" printed (`out/attn-abs2-a-after.png`). p2 intro append: "short-term", "encoder-decoder" printed (`out/attn-intro-a-after.png`). |
| P0-2 real line-end hyphen deleted ("Englishto-German") | Fixed, but the fix causes N1 | Editor text now "English-to-German". Every line-end hyphen is kept, soft TeX hyphens included. |
| P0-3 second edit of the same paragraph corrupts it | Fixed | `para.mjs tracemonkey 2 "Nested loops" chain ...`: step 2 opens with whole words, applies, re-reads editable and justified, no stretched lines (`out/trace-chain-b-after.png`). Row `edittext-para-twice-pdfjs-tracemonkey`. |
| P1-1 edited text out of order or reversed | Partly | Poppler reversal fixed (W-9 "Company" reads in place in `pdftotext` and `-layout`). Inline placement works for some edits (tracemonkey title, attention p2 word, attention intro paragraph) but falls back to appended for others: tracemonkey body word p1 and p2, attention p3 word, the first tracemonkey p2 paragraph edit, W-9 (pdf.js reads "Company" at index 5595 of 5657). Documented as a limit in `status-engine.md`. |
| P1-2 Arabic bold word comes back regular | Fixed | Synthetic bold for the Noto fallback; row `rtl-bold-arabic-cid` checks the report says "(synthetic bold)" (hard check). Visual weight not compared by me. |
| P1-3 Arabic paragraph merges bold and regular lines | Partly | Merge fixed: paragraphs now split where an all-bold row meets an all-regular row (`editParagraph.js:135-150`); ArabicCIDTrueType p1 reads as 4 one-line paragraphs, so a regular line is no longer restyled. Blind steps re-run with `arabic.mjs p1-g3` (append to line 4): applies, 4 lines, "NotoSansArabic-Regular (synthetic bold)", order inline, rows above unchanged (`out/arabic-para.png`). Not fixed: in pdf.js the rewritten line still has no word spaces ("اﻧﻮاعاخلﻄﻮط" vs source "اخلﻄﻮط اﻧﻮاع"), so copy and search in browser viewers break on those lines. The corpus row only warns (soft). Appending to the regular line 3 is refused `no-room` (line 4 sits right below), which is correct. |
| P1-4 justified paragraph comes back ragged | Fixed | attention abstract after the edit is justified (`out/attn-abs2-a-after.png`). |
| P1-5 shortened paragraph not reflowed ("For other" alone) | Fixed | W-9 TIN paragraph, sentence removed: 4 reflowed lines, italics kept (`out/w9-tin-a-after.png`). |
| P1-6 refused paragraph throws away typed text | Fixed | UI run: "shell: a refused edit stops the held Run, the text stays to shorten: kept 6919/6919" and the para draft check pass. |
| P1-7 Arabic body text on UDHR all refused | Partly | Mixed note + open editor fixed (UI check passes, 0 editors). Lines with unmapped lam-alef glyphs are still refused as a whole, and the refusal copy does not say that single words can be clicked (`edittext.jsx:150`; the engine dev suggested "Click a single word to edit it."). Honest, but the user is still stuck. |

### First review P2 (status only)

P2-1 fixed (`editTextOps.js:342` requires FontFile2). P2-2 fixed (`codeMap` run at model time, `:654`). P2-3 not fixed (links). P2-4 replaced by N1. P2-5 not fixed (`edittext.jsx:38`, `:1184` still `split('+')`, engine joins with ' + '). P2-6 partly (short words still matched only in strings of 3 or fewer tokens). P2-7 not fixed (`rtl-shorter`, `rtl-noroom` still pick 1-line paragraphs).

## 2. New findings

### P0

**N1. After a re-wrap, TeX line-break hyphens print mid-line ("com-pile", "al-ternative", "ac-tual", "discov-ered").**
- Where: `src/lib/editParagraph.js:232-243`. A line-end hyphen followed by a lowercase word is always kept inside the joined word. Soft hyphens are recognised only as U+00AD, but TeX and Word draw break hyphens as a plain "-".
- Repro: `node para.mjs ../../test-corpus/reports/pdfjs-tracemonkey.pdf 1 "Dynamic languages" replace "Dynamic languages=>Modern dynamic languages" trace-abs`. The editor text already reads "com-pile than statically", and the output prints "com-pile", "al-ternative", "ac-tual" and "discov-ered" mid-line (`out/trace-abs-a-after.png`; also `out/wtp.png` from `review/probe3.mjs`). None of these words was touched.
- Why it matters: this is the blind P0-2 class (untouched words change on the printed page), and the more common one. In this abstract all 4 line-end hyphens are TeX breaks; real compounds split at a line end ("English-" / "to-German") are rarer. It happens on almost any edit that adds words to a hyphenated TeX paragraph, because `keepLayout` then gives up and the paragraph re-wraps. The editor shows the hyphens, but a user will not spot 4 hyphens in 14 lines.
- Why tests miss it: `dehyph` (`cases-edittext.mjs:1204`) strips every hyphen before a lowercase letter, and "every word reads back whole" compares against editor text that already has "com-pile".
- Fix:
  - Decide per break, not globally. Keep the hyphen when the second half has its own hyphen or starts with a capital ("to-German"), or when the hyphenated form appears mid-line elsewhere in the document text. Otherwise treat the break as soft: drop it on re-wrap, put it back when the break is kept.
  - Show soft breaks in the editor without the hyphen.
  - Add a row that re-wraps the tracemonkey abstract and checks that no source line-end hyphen joining two lowercase halves shows up mid-line.

### P1

**N2. `cleanStruct` / `cleanMarked` remove alt text and ActualText of content that is still there.**
- Where: `editTextOps.js:1238-1247` (`namesOld`: removed words of 4+ letters match as substrings) and `:1351-1353` (`cleanStruct` treats an element with no `/Pg` in its chain as this page).
- Repro: `node struct.mjs` (synthetic tagged 2-page file, delete the paragraph "Results came back with normal values ... this year."). Results:
  - A Figure on the same page with `/Alt (Chart without values, drawn in blue)` loses its Alt ("with" matches inside "without", "values" matches).
  - An element with no `/Pg` whose MCR points to page 2 loses `ActualText (Page two text without the patient name.)`.
  - Control: the untouched paragraph's ActualText and `/T` are kept.
- Why it matters: a paragraph delete or rewrite removes words like "with", "that", "this", "from", "have", so on tagged pages figure alt text and replacement text silently go. Screen readers then get nothing for those figures. The same rule applies to `/Alt` and `/ActualText` in the page streams and form XObjects through `cleanMarked`.
- Note: this is the `hasOld` rule the first review suggested for P0-1; the developers followed that advice. The rule is too broad for paragraph-sized removals.
- Fix:
  - Main fix: cut entries only from elements whose MCIDs (or MCRs) lost glyphs. The edited paragraph's MCIDs are known from the marked content around the removed glyphs. Whole-word matching alone is not enough (the Figure above shares the whole word "values").
  - Fallback for untagged spans: match whole words or word sequences, not substrings.
  - Treat an element with no `/Pg` as on another page unless an MCR in it points to this page.
  - Add a row with a figure Alt holding common words on the edited page.

### P2

| # | Where | Problem | Repro / evidence | Fix |
|---|---|---|---|---|
| N3 | `editTextOps.js:2741` comment vs `:2827` code | The comment says cuts are only at q depth 0. The code allows any depth whose levels set no clip, gs or d0/d1, so dash, line width, colour and text state from an open q can reach the insert. The MuPDF pixel gate (`:2898`) catches visible differences, so I found no wrong output, but the safety rests on one renderer at tolerance 8. | Code read. No second renderer on this machine (no `pdftoppm`). | Either require depth 0 as documented, or reset stroke state (`w`, `d`, `J`, `j`, `M`, `RG`) inside the insert too. |
| N4 | `editTextOps.js` paragraph draw | Justified lines with wide spreads are drawn as separate words. MuPDF stext then reads each word as its own line ("results,\nincluding\nensembles,\nby\nover..."). pdf.js and poppler read them fine. MuPDF-based viewers, and the app's own MuPDF text (Redact search uses MuPDF stext), may miss a phrase across those words. | `para.mjs ... attn-abs2`, MuPDF text in the log. pdf.js: "results, including ensembles, by over 2 BLEU." | Draw each line as one TJ with the spread as kerning (or Tw), so the words share one text line. |
| N5 | `editParagraph.js` layout | No hyphenation on re-wrap: a long unbreakable word leaves very loose justified lines ("present an al-ternative compilation technique for"). | `out/trace-abs-a-after.png`, line 5. | Leave the line ragged when its gap would pass about 2x the natural gap. |
| N6 | `Shell.jsx:604-611` | `pendingRun` is not cleared when the tool or the selected files change. A held click could then start a different tool's run once that one is ready. The window is short (one apply, about 0.1 to 1 s). | Code read. | Clear `pendingRun` on tool, selection or file change. |
| N7 | `edittext.jsx:38`, `:1184` | Carried from the first review (P2-5): names split on '+' without trim. With the new suffix the list also shows "NotoSansArabic-Regular (synthetic bold)" as a font name, and duplicates with a leading space. | Code read. | `split('+').map((s) => s.trim())`, and strip the suffix for the font list. |
| N8 | `cases-edittext.mjs`, row `para-twice` | The comment promises "no stretched lines", but no check asserts it. The blind failure (two lines stretched across the column) would pass if words, order and bbox stayed right. | Code read. | Check that rows other than the last of each part have gaps within about 2x the natural gap. |

Also noted, not ranked: the dev-reported refusal of the 40th repeated edit of one aws word (`tight-lines`) was not investigated by them or me.

## 3. New code checked and found sound

- **`placeContent` (reading order).**
  - Cuts are made only outside BT, BX/EX and marked content. Inside BT, only right before a line move, and the line matrix is restored with Tm after the inserted ET/BT. q/Q nesting is balanced: the insert is `q ... Q`, and in a BT cut `ET q ... Q BT tlm Tm`.
  - The binary search picks the first cut after the "before" glyphs are drawn, i.e. right after an ET or at a line move. The cut list also has points inside a path, but the smallest qualifying cut always follows a text-show op, so they are never picked.
  - Any failure, or any pixel difference against the appended draw, falls back to append. Optional content (`/OC` BDC) is excluded (mc > 0).
- **Compact final save.** `finalizeEdits` opens fresh bytes and saves `garbage=compact` with no object walk. `compact.mjs`: per-page text length and render hash are identical before and after finalize on attention (15 pages, including the p13 figure from the known bug), tracemonkey (14), irs-fw9 (6) and us-budget (184).
  - The us-budget `final: true` diff in my first run was a probe bug: the paragraph id was not found, so the comparison was against an unedited copy.
  - `final: true` has no caller in src.
- **Glyph-id redraw.** `byGid` now needs an embedded FontFile2 (closes first-review P2-1). `canRedraw` runs `codeMap` at model time (P2-2).
- **Shell held Run.**
  - The button is disabled while held, and the effect clears the hold before calling `run()`, which has its own `startingRef` guard, so there is no double run.
  - A refused edit sets `textHold` in the same batch as busy going off, so the held click is dropped, never run without the edit.
  - Blur always commits (NO_FONT is not checked on blur), so `textOpen` cannot hold Run forever.
  - UI checks pass.
- **Floating notices.** Fixed position under the bar, `pointer-events: none` on the wrapper, auto on the toast. The stage does not move (UI check: 236.5 -> 236.5 -> 236.5). Not checked: whether a long notice covers the Edit toolbar (Undo) on phone for its 8 s.
- **Tests.** No hard check was removed or softened: `git diff -- cases-edittext.mjs edittext-ui.mjs page-harness-edittext.js | grep -E '^-.*(ctx.check|check(|soft)'` shows only the phone "tap 4 px above" check, which moved into a table-driven loop (`edittext-ui.mjs:538`) and still runs. The in-order checks in paragraph rows are soft, but the 3 order rows check order hard (MuPDF, pdf.js, poppler when present). Weak spots: N1 (`dehyph`) and N8.

## 4. What I ran

- `timeout 900 npm run test:touched -- --case '^edittext-' --name 2026-10-28-p2-review2-t1`: **81 pass, 0 fail, 0 skip**, 1.5 min, 7 soft warnings (RTL pdf.js order, RTL re-read). Scorecard `docs/test-results/2026-10-28-p2-review2-t1.md`.
- `CORPUS_OUT=review2ui timeout 900 node scripts/corpus-test/edittext-ui.mjs --only para,shell,rtl,fw9 --no-shots`: **34 PASS, 0 FAIL, 1 SKIP** (no note after the paragraph edit), "all passed", 0 requests off host. No Playwright browser left running afterwards.
- Probes listed above, Node only (MuPDF + pdf.js legacy), `pdftotext` from `/mingw64/bin`.

## 5. Not verified

- Inline placement in a second renderer (no `pdftoppm`; only pdf.js and poppler text order were checked).
- Arabic synthetic bold weight against the source bold (report field only).
- Phone keyboards and iOS zoom on the bar editor, and a long floating notice over the toolbar at 390 px.
- `edittext-ui.mjs` sections aws, trace, flip, rot, arabic, scan, signed, phone and note (not re-run), and `test:quick`.
