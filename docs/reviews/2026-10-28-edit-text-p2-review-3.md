# Review 3: Edit text phase 2, final engine round (2026-10-28)

Scope: uncommitted tree on `wip-parity` after the "Final engine round" (`docs/team/status-engine.md`) and the redact / raw scan work (`docs/team/dev-notes.md`, "Redact XFA check and raw scan coverage"). Files: `src/lib/editTextOps.js`, `src/lib/editParagraph.js`, `src/lib/redactOps.js`, `src/tools/v2/edittext.jsx`, `edit.jsx`, `redact.jsx`, `src/app/Shell.jsx`, `ResultScreen.jsx`, `scripts/corpus-test/cases-edittext.mjs`, `cases.mjs`, `validate.mjs`, `page-harness-edittext.js`. Inputs: review 2 (`2026-10-28-edit-text-p2-review-2.md`), blind round 2 (`2026-10-28-blind-edit-text-p2-round2.md`).

Probes: `scratch-edittext/review2/` (re-run) and new ones in `scratch-edittext/review3/` (gitignored): `para.mjs`, `one.mjs` (one mid-paragraph edit), `stress.mjs` (50 mid-paragraph edits on 3 papers), `xfa.mjs`, `xfascan.mjs`, `scanfile.mjs`, `dynxfa.mjs`, `redactbox.mjs`, `crop.mjs`. Outputs in `scratch-edittext/review3/out/`. Run with `node <probe>.mjs ...` from that folder.

**Verdict: changes needed.** 1 P0, 6 P1, 10 P2. N1 and N2 are fixed. Of the 5 blind round 2 P0/P1 items, 2 are fixed (XFA on hybrid forms, underline), 2 are partly fixed (stray hyphens: lowercase TeX breaks fixed, camel-case words not; line then paragraph), 1 is not fixed in effect (coolblue address). Nothing in the reflow window moved words outside it (50 edits, 0 glyphs moved outside the changed box), but the re-read after an edit can merge two columns, and justified paragraphs now come back with condensed, ragged lines mid-paragraph. The new redact box cleanup removes far more than the user boxed.

## 1. Fix verification

| Item | Verdict | Evidence |
|---|---|---|
| Review 2 N1: TeX break hyphens mid-line | Fixed (lowercase breaks) | `review2/para.mjs tracemonkey 1 "Dynamic languages" replace ...`: editor text now "compile"; output has no "com-pile", "al-ternative", "ac-tual", "discov-ered" mid-line (`review2/out/trace-abs-a-after.png`). But see P1-3 (the "keep" break leaves a 3-word line "present an al-"). |
| Review 2 N2: struct cleanup too broad | Fixed | `review2/struct.mjs`: edited element loses ActualText; Figure `/Alt (Chart without values, drawn in blue)`, the other paragraph's ActualText and `/T`, and the page-2 element without `/Pg` are all kept. Row `edittext-para-struct-keep-others` passes. |
| Blind P0-1: stray hyphens in untouched words | Partly | Steps A (right column, sentence deleted): lines 1-5 untouched, no mid-line hyphen (`review3/out/rcol-a-after.png`, window [5,11]). Steps B (abstract twice): clean (`out/abs-twice.png`). Not fixed for words broken at a capital: "Trace-Monkey" (P0-1 below). |
| Blind P0-2: XFA copy keeps old caption | Fixed for hybrid forms | `xfa.mjs` on irs-fw9: final file has no `/XFA`, 1 `%%EOF`, 1 version, 23 widgets, 8 values; a text field still fills and saves. `scanfile.mjs` on the row output: xfaStreams 0, revisionXfa 0. New problem on dynamic XFA forms (P1-4). |
| Blind P1-1: line edit then paragraph edit | Partly | Hard break and the orphan "expressions" line are gone (row check passes). The line-edited row "may change at runtime. This means the compiler can no longer" still ends short inside the justified paragraph (`out/line-then-para.png`). P2-7. |
| Blind P1-2: underline | Fixed | Word under the underline refused `decorated`, file unchanged (row). Append re-lays only line 3 (window [2,2]), underline still covers "running across the field until", last line not stretched (`out/ul-after.png`). Copy problem: P2-1. |
| Blind P1-3: coolblue address | Not fixed in effect | Name line untouched and no squeeze (row passes), but the street change re-wraps the rest: "Keizersgracht 1001" / "bis 1025 RX" / "Amsterdam", and "Amsterdam" now sits directly on "Factuurnummer:" with no gap (`out/cb-after.png`). P1-5. |

## 2. Findings

### P0

**P0-1. Camel-case words broken at a capital print with a hyphen mid-line ("Trace-Monkey").**
- Where: `src/lib/editTextOps.js:669`. `hyphenKind` returns 'real' as soon as the right half starts with a capital, before it looks up the joined form in nearby pages.
- Repro: `node one.mjs ../../test-corpus/reports/pdfjs-tracemonkey.pdf 2 p2-g5 longer tm2-g5` (one word in line 2 made longer). Editor text already reads "tracing VM Trace-Monkey."; the output line reads "Trace-Monkey. TraceMonkey supports all the JavaScript features of Spi-". "TraceMonkey" occurs 39 times in the file, once in the same paragraph.
- Why it matters: this is the blind P0-1 class (an untouched word changes on the printed page). In tracemonkey the product name is hyphenated at line ends several times; any re-wrap that moves it mid-line prints the wrong name. Same for other camel-case names (JavaScript, SpiderMonkey, PostgreSQL) when TeX breaks them at the capital.
- Why tests miss it: `cases-edittext.mjs:1316` and `:1705` skip every pair the engine already kept with its hyphen in the editor text, so a wrong 'real' decision can never fail (P2-3).
- Fix: check `midWords` for the joined form first ('soft' when found), then the hyphenated form, and use the capital / own-hyphen rule only when neither is known. Add a row on tracemonkey p2-g5 that re-wraps and checks "TraceMonkey" stays whole.

### P1

**P1-1. After a paragraph edit, the paragraph and an untouched paragraph in the other column re-read as one non-editable paragraph.**
- Where: `editTextOps.js:735-750` (`ownLinesHome`). The home block is the one whose top-left matches the paragraph box within 1.5 pt. The first line of the paragraph is indented (x 66) but the box starts at x 54, so nothing matches and it falls back to the MuPDF block of the drawn line. MuPDF put the appended line into the block of the right column (block 9). Lines 740-749 then move the untouched lines of the paragraph into that block too.
- Repro: `node one.mjs ../../test-corpus/reports/pdfjs-tracemonkey.pdf 3 p3-g6 drop tm3-g6` (deletes one "the"). Before: p3-g6 (3 lines, left column) and p3-g8 (11 lines, right column), both editable. After: one paragraph p3-g6, 11 lines, bbox x 54 to 556, `editable: false, why: 'layout'`, text interleaved ("...as part of After recording is finished, TraceMonkey compiles the trace to the current trace..."). Same with the "longer" edit. In `stress.mjs` these were the only 2 of 50 edits whose re-read did not equal the new text.
- Why it matters: the user cannot edit either paragraph again as a paragraph, including one they never touched. No row covers a paragraph that ends a column next to another column.
- Fix: pick the home block by overlap with the paragraph box (most of its lines inside it), never fall back to a block whose lines lie outside the x-range of the paragraph (use a new block id instead), and add a row editing tracemonkey p3-g6 that re-reads both p3-g6 and p3-g8 as editable.

**P1-2. Redact: one box over an ordinary line cleans common words across the whole file, deletes unrelated comments and renames form fields.**
- Where: `redactOps.js:1514-1546` (`boxedWordTests`: every word of 4+ characters under a box), used by `cleanDocument` (`:1461-1477`: matching comments deleted, links dropped, every attachment dropped) and `scrubStrings` (`:1353`: every string in the file, field names `/T` included).
- Repro: `node redactbox.mjs`. A box over the single line "Please send this form with your Address" (well under half the page):
  - document title "Signing form with notes" becomes "Signing [redacted] [redacted] notes";
  - bookmark "Address details and form notes" becomes "[redacted] details and [redacted] notes";
  - the comment "Check this with legal" on page 2 is deleted;
  - the form field named `Address` on page 2 is renamed `[redacted]` (its value stays). Two boxed field names would both become `[redacted]`; same-named fields then share one value (inferred from the PDF field rules, not run).
- Why it matters: the user asked to hide one line on page 1. Comment deletion and `/T` renaming are the existing search-term behaviour; what is new is that any box over a word of 4+ letters now triggers them. The 4-character floor lets in "with", "this", "your", "form", "from", "that", "have". The whole-page and over-50% guard does not help for a line or paragraph box, which is the common case. A box over one word now also removes every attachment (documented in dev-notes, but not something a user expects from one box).
- The other direction (code read, not run): a word hyphenated across lines under a box is split at the inserted line break, so "redac" and "tion" are cleaned elsewhere but "redaction" in bookmarks or metadata is not. Words of 3 letters (short names) are never cleaned elsewhere.
- Fix: for box-derived words use a stopword list and a frequency limit (a word that is also frequent outside the boxes is not private), or only the boxed phrase as a whole. Never delete whole comments or rename `/T` for box-derived tests (clean `/V` and `/Contents` text only). Join line-end hyphen halves. Add a row with a common-word line box, a comment, a bookmark and a field name.

**P1-3. Justified paragraphs come back with condensed, ragged lines in the middle (regression of blind P1-4).**
- Where: `editTextOps.js:2707-2718` (squeeze tried before the window grows; `SQUEEZE` at `:2435`), `editParagraph.js:503-505` (a line whose gap would pass 2x natural is left ragged), `editParagraph.js:469-478` (a "keep" break always ends the line).
- Repro:
  - `node one.mjs ../../test-corpus/reports/pdfjs-tracemonkey.pdf 1 p1-g20 longer tm-g20`: one word made 11 letters longer. Window lines 4-7 are drawn at 91% horizontal scale next to 100% lines, and lines 4-6 are ragged inside a justified paragraph (`out/tm-g20.png`).
  - `stress.mjs`: 10 of 25 "longer" edits squeezed their window lines (fit 0.88 to 0.97) while the rest of the paragraph stays at 100%.
  - `review2/para.mjs` N1 repro (one word added at the start): the abstract is re-set at 97%, and the "keep" break "al-ternative" forces a 3-word line "present an al-" (`review2/out/trace-abs-a-after.png`), although "alternative" is mid-line in the same paragraph (the lookup skips this page).
- Why it matters: adding a word to a justified paragraph is the most common paragraph edit. Mixed letter widths and short lines mid-paragraph look patched. Rows pass because `noStretch` only caps the widest gap; nothing checks short lines or a mixed scale.
- Fix: before squeezing, let the window run on (more lines re-laid, still inside the paragraph box) and let justified gaps shrink to about 80% of natural. Squeeze, if needed, the whole paragraph at one scale. For "keep", also count mid-line words on this page outside the edited paragraph. Add a check that no window line other than the last of a part ends more than about 15% short in a justified paragraph, and that all lines share one scale.

**P1-4. Editing a dynamic XFA form removes the whole form.**
- Where: `editTextOps.js:3264-3271`. XFA is dropped on every applied edit with no dynamic-XFA guard (`docOps.js:1714` `dynamicXfa` and `DYNAMIC_XFA_MSG` already stop this for other tools). The code deletes `NeedsRendering` from the AcroForm dict, but it is a catalog key, so it stays true.
- Repro: `node dynxfa.mjs`. `forms/xfa-issue14315.pdf` (0 fields) and `forms/xfa-imm1344e-filled.pdf` (NeedsRendering true): a word edit on the "Please wait..." / "requires Adobe Reader" page applies, XFA gone, NeedsRendering true kept. The UI then says the form "also had an XFA copy; it was removed", which is wrong: it was the form.
- Fix: refuse text edits on dynamic XFA files (same test as `dynamicXfa`) with the docOps message; delete `NeedsRendering` from the catalog. Add a row on xfa-issue14315.

**P1-5. Blind P1-3 still happens: the address block re-wraps across its lines and closes the gap below.**
- Where: `editParagraph.js:173-174` (column right edge = widest source line), `:256` (hard break only when the next first word would have fitted).
- Repro: row `edittext-para-coolblue-address` output (`test-corpus/derived/outputs/edittext-para-coolblue-address/chain.pdf`, `out/cb-after.png`): "Keizersgracht 1001 bis" does not fit the 140 pt column of a left-aligned block with free space to its right, so "bis" goes down, "1025 RX" joins it and "Amsterdam" takes a new line directly on "Factuurnummer:" (y 141.9 to 155.5 vs 155.5).
- Why it matters: street, postcode and city are mixed on an invoice address. The row passes because it checks only the window start and the squeeze flag.
- Fix: for start-aligned blocks of short lines (no line near a shared right edge), treat each source line end as a hard break, and let a line use the free room to its right up to the next obstacle. Check the expected lines in the row ("Keizersgracht 1001 bis", "1025 RX Amsterdam") and a gap above "Factuurnummer".

**P1-6 (tests). The rows given as proof for blind P1-3 and P1-4 cannot see those complaints.** Rows `para-coolblue-address`, `para-twice-*`, `para-abstract-twice-*`, `para-line-then-para-*` check window start, squeeze flag and widest gap only (`cases-edittext.mjs:1669-1673`, `:1735-1739`). See P1-3 and P1-5 for the checks to add.

### P2

| # | Where | Problem | Repro / evidence | Fix |
|---|---|---|---|---|
| P2-1 | `edittext.jsx:155` | The `decorated` copy says "Underlined or struck text: edit it word by word", but a word edit that moves underlined words is refused `decorated` too (row `decor-underline-word`). | Code read + row. | Say what works, e.g. "Underlined or struck text: keep the change the same length, or edit outside the underline". |
| P2-2 | `edit.jsx:362-370` | The result note mentions a removed signature but not the removed XFA; the XFA note is only a toast while editing. | Code read. | Add "XFA form copy removed" to the output note. |
| P2-3 | `cases-edittext.mjs:1316`, `:1705` | The mid-line hyphen check skips every pair the engine kept hyphenated in the editor text, so a wrong "real" decision (P0-1) never fails. | Code read; P0-1 passes the rows. | Allow a pair mid-line only when its hyphenated form occurs mid-line in the source file. |
| P2-4 | `cases-edittext.mjs:1792` | "old caption in no XFA stream" filters hits by `/xfa/i` in `where`, but `where` reads "obj N stream", so it never matches. Covered anyway by `xfaStreams === 0`. | `xfascan.mjs`: an unfinalized file with 6 XFA streams gives 0 such hits. | Drop the check or mark XFA streams in `where`. |
| P2-5 | `editTextOps.js:666-693` | The hyphen lookup reads 6 other pages per model read (tracemonkey p5: 432 ms first read, 191 ms second; attention p5: 116 / 98 ms). Local only, nothing leaves the device. The decision can change after an edit on a nearby page (not checked in the UI). Same-page words are ignored (P1-3). | Timing via `pageTextModel`. | Cache per document; count this page minus the edited paragraph. |
| P2-6 | `Shell.jsx:611-615` | Review 2 N6 still open: `pendingRun` is not cleared on tool or selection change. | Code read. | Clear it on tool, selection or file change. |
| P2-7 | line edit, then paragraph edit | The line-edited row stays short inside a justified paragraph when the paragraph window starts below it. | `out/line-then-para.png`. | Start the window at a line we drew in a justified paragraph, or justify line edits that end near the old right edge. |
| P2-8 | `validate.mjs:775-798` | Earlier versions: only the newest 8 are scanned, and a version that fails to open is skipped silently. Revision hits are dropped for terms found live; that is safe in `redactionLeaks` (a live hit already fails). | Code read. | Report skipped versions and any count past 8 in `bad`. |
| P2-9 | `redactOps.js:1530` | Box words: hyphenated words split at the line break; 3-letter words never cleaned elsewhere (see P1-2). | Code read. | Join line-end halves; document the 3-letter limit. |
| P2-10 | review 2 carry-overs | N4 (MuPDF reads spread justified words as one line each), N5 (no hyphenation), N7 (font names split on "+" without trim), first review P2-3 (links), P2-7 (RTL coverage): no change seen in the diff, not re-checked. | Code read. | As in review 2. |

## 3. Checked and found sound

- **Reflow window bounds.** `stress.mjs`: 50 mid-paragraph edits (one word made longer, one word dropped) on tracemonkey p1-3, attention p2-3, bert p1-2. 0 glyphs moved or lost outside the reported changed box in all 50; re-read text equals the new text in 48 (the other 2 are P1-1); no duplicated or missing lines. When the window syncs it has replaced exactly as many lines as it drew (`layoutWindow` makes one output line per source row and returns `last = r - 1`), so nothing overlaps the lines kept below. Lines above the first changed line are never in `winChars`.
- **Mid-line hyphen hits in `stress.mjs` on bert** ("pre-train", "task-specific") are real compounds: "pre-train" occurs mid-line 62 times and "task-specific" 8 times in the source. Probe false positives.
- **XFA drop on hybrid forms.** Only `/XFA` goes; `/Fields`, `/DA`, `/DR`, `/SigFlags`, all 23 widgets and their values stay, and a field still fills after the edit (`xfa.mjs`). The final save leaves one version with no XFA packet.
- **`selectNewOnly`** is set only by Edit (`edit.jsx:324`); other tools keep the old selection rule, so multi-file tools are not affected.
- **validate.mjs raw scan.** The new coverage (trailer strings, XML text without markup, attached PDFs, earlier versions) only adds hits. `redactionLeaks` forces `revisions: true` and fails on `revisionXfa`. No existing check became easier to pass.
- **No test weakened.** `git diff -- scripts/corpus-test/ | grep '^-'` for checks: only the phone "tap 4 px above" check, moved into a loop in review 2. The hyphen folding in paragraph rows is gone (stricter). `g4-ui.mjs` now waits for the options panel to be attached on phone (screenshot script, not a check).

## 4. What I ran

- `timeout 900 npm run test:touched -- --case '^edittext-' --name 2026-10-28-p2-review3-t1`: **90 pass, 0 fail, 0 skip**, 2.7 min (`docs/test-results/2026-10-28-p2-review3-t1.md`).
- `timeout 900 npm run test:touched -- --tool redact --name 2026-10-28-p2-review3-redact`: **79 pass, 0 fail, 0 skip**, 1.3 min (`docs/test-results/2026-10-28-p2-review3-redact.md`).
- The probes above, Node only (MuPDF WASM and the engine modules). No test browser left running afterwards.

## 5. Not verified

- UI flows (`edittext-ui.mjs`), `test:quick`, phone layout of the floating notices.
- Whether the hyphen decision flips in the UI after an edit on a nearby page (P2-5).
- P1-2 attachment drop on a box: the attachment in my probe was not registered in the source file, so the drop was not observed (the behaviour is in the code and in dev-notes).
- Hyphenated words under a redact box (P2-9); struct cleanup on real tagged files beyond the existing rows.
- Other renderers (no `pdftoppm`); all crops are MuPDF renders.
