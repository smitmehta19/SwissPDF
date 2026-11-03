# Edit text unit D: multi-line select editing

Status: done 2026-11-02 (Smit: "do your best"). Review: round 1 reject, fixed; confirm approve. Blind test: no P0. Units A, B, C are deployed (e0487ab, 34725a5, c189a99).

## What the user gets
Select 2 or more lines of one paragraph and change them in one box. The selected lines are laid out again. Lines after them move up or down as a whole, as a spill does today. Lines before them and other paragraphs are not touched.

## How it works
**Engine** (`editTextOps.js`, `editParagraph.js`):
- Today's single-line spill becomes a range of rows. `spillPlan` takes rows r0..r1, not just one row.
- `spillLayout` lays out the words of r0..r1. It starts at r0's x0 and wraps at the paragraph edge R, with the paragraph's own word gap. Justified paragraphs stay justified except on the last laid-out line, which stays ragged.
- Rows after r1 move by delta (new line count minus old line count), up or down. They are moved, not redrawn: the same bytes, same glyphs.
- All of today's safety nets are reused:
  - the blank-space-below check
  - the link, highlight and underline guards
  - the read-back on a scratch page (with unit C spaces)
  - the unit A overflow guard
  - the fall-back path: when the layout fails, the edit is refused with a reason and nothing changes
- Words are kept as they are. Only new or changed words are drawn with the fallback font when the original font cannot draw them.

**UI** (`edittext.jsx`):
- Shift+click a second line of the same paragraph, or Shift+Down/Up on a focused line, to select a range of lines. The range shows as one outline.
- Enter or a double-click opens the parked paragraph editor (textarea) over the range, holding the selected text. In the editor, Enter starts a new line and Ctrl+Enter applies (as the paragraph editor already says).
- Phone: the edit sheet gets a "+ next line" button that adds the line below to the selection.
- The note after the edit reuses unit B: wording, placement and busy sign.

## Decisions made (my call, reversible, logged)
- **Hyphenated words.** This killed paragraph re-wrap. In v1, a selection with a word broken by a hyphen inside the range is refused: "A word is split over these lines. Select up to that line." A hyphen at the range edge (into r0 or out of r1) keeps its piece, as spill does today.
- **Range limits:** one paragraph only, at most 12 lines. No RTL, vertical, centred or right-aligned paragraphs (same as spill).
- **Paragraph editing stays parked.** D gives the same result for the lines the user picks, and never touches lines they did not select.

## Done when
1. Engine rows (new corpus rows, real files):
   - tracemonkey justified 3-line grow and shrink
   - saeco address 2-line edit
   - fdic heading 2 lines
   - attention 2-line delete (close up)
   - hyphen inside the range refused
   - a range with a link refused
   - a range with no room below refused
2. Fuzz on 10 files, mode "range" (2 to 4 rows; grow, shrink, replace a middle word). The page character count must equal before, minus the old text, plus the new text. Word order must be kept. Target: 0 bad.
3. UI script: new `multiline` block.
   - mouse: Shift+click, edit, Ctrl+Enter
   - keyboard: Shift+Down, Enter, edit, Ctrl+Enter
   - phone: "+ next line"
   - Esc cancels
   - undo restores
4. edittext rows green, edittext-ui green, test:quick green.
5. Review by a separate agent (max 2 fix rounds). Then a blind test: a fresh agent edits 5 real files through the UI with no code access and reports damage. A P0 in the blind test means D is hidden behind a flag, like paragraph re-wrap.
6. Deploy, live Health green.

## Out of scope (parking lot candidates)
- Joining hyphenated words inside the range.
- Selecting across paragraphs or columns.
- RTL, vertical, centred or right-aligned ranges.
- Changing font, size or colour.

## Size and risk
- **Size:**
  - engine 0.5 to 1 day
  - UI 0.5 day
  - rows, fuzz, review and blind test 0.5 to 1 day
  - total 1.5 to 2.5 days
- **Risk: high.** It is close to the parked paragraph re-wrap. It is kept smaller by the hyphen refusal and by moving rows whole.
- **Main risk:** justified ranges ending mid-paragraph. The last laid-out line is ragged while the next untouched line is justified. Mitigation: if the range ends on a full justified line and the new text fills its last line to within 1 word, justify that last line too (same rule as spill).

## Parking lot
- Joined lines that do not fit wrap back to the same lines: applied, but nothing visible changes (say "Nothing to change" instead).
- API: rows [r, r] (one row) returns 'not-found' ("That text is no longer there"); the UI never sends it.
- Joining hyphenated words inside the range (today: refused 'split-word').
- free-fiber footer bullets (block p1-b27 rows 3-5): a shortened range is refused 'range-no-fit'; an unchanged row fails the room check, cause not traced.
- Phone (390): the note after an edit can sit over text in another column (saeco right address block): unit B placement on narrow screens.
- 'range-no-fit' copy also shows for a word wider than the column or glyphs that cannot be redrawn exactly.
- Shift held on an already focused line leaves the Shift flag set until the next focus.
- Blind test: copy/extraction order can put the re-laid lines before the line above them (TAM abstract); same known limit as line edits.
- Blind test: focus goes to the page after Ctrl+Enter (Esc returns it to the line).
- Blind test: refusal note can cover the lines above while the box is open; the box can slightly overlap the next unselected line.
- Blind test: "+ Next line" greys out once text is typed, with no hint why.
- Blind test: a hyphen-split pair shows as "English- to-German" in the box (space added).
- Wider wrap (review P2): text beside the block is only looked for from the first edited row down to the block's end, so a gap in a second column beside the block lets lines run into that column's x range (nothing overlapped). Ragged multi-column pages only.
- Wider wrap (review P2): the blank-paper check covers only 4 lines below the block, so a very long addition falls back to the old narrow wrap (taller).
- Wider wrap: a block holding the page's widest line no longer gets the old 10% extra width (stays out of the margin).
- Note after a range edit with no line count change says only the font part (or nothing).
