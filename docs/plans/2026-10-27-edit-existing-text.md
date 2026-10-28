# Plan: edit existing text in Edit PDF (2026-10-27)

Status: APPROVED 2026-10-27 (Smit: "go-ahead to deploy ... full and final"). Engine started in parallel with the polish gate; UI after the polish deploy. Research + prototype: `docs/research/2026-10-27-edit-existing-text.md`, `scratch-edittext/`.

## Goal
In Edit PDF, click text that is already in the PDF, change it, and keep the look. Works fully in the browser.

## How (from the prototype, measured on 44 real edits)
1. MuPDF finds the word or line (font, size, colour, baseline, glyph boxes).
2. MuPDF text-only redaction removes just those glyphs.
3. New text is drawn in the original font when the file already uses every needed letter in that font; otherwise a matching standard font (keeps bold/italic) for Latin, Noto for other scripts (shaping and right-to-left via the existing `fonts.js`).
4. A longer word pushes the rest of that line right; nothing else on the page moves.
5. Two-pass save so the old text is truly gone from the file.
Prototype numbers: 0 pixels changed outside the edited box (44/44), old word gone (44/44), original font kept 27/44, 8 ms to 1 s per edit.

## What the user sees (phase 1)
- Edit PDF gets an "Edit text" mode: hover shows editable lines, click a word or line, type, Enter or click away to apply. Undo works.
- A small note when a fallback font is used ("Closest match: Helvetica Bold").
- Clear refusals with the reason: scanned page ("run OCR first"), vertical text, text with no letter mapping, Type3/outlined text, form fields (use Forms), comments.
- Warning before editing a signed PDF (the signature is removed on save).
- Longer text that runs past the margin: warning plus an optional "fit to width".

## Definition of done
- Real-file corpus rows (3 per case: invoices, reports, forms/rotated, Arabic/Chinese/Hindi, scans refused) pass: old text gone from text layer and bytes, new text extractable (ActualText for complex scripts), no pixel change outside the edit box, ink present in the edit box (catches blank glyphs).
- UI script: click, edit, apply, undo, refusal messages, phone 390 and desktop 1440.
- Independent code review + a fresh no-context user test of Edit PDF.

## Open after review + blind test (P2, all P0/P1 fixed 2026-10-28)
- Single-word edit shorter than the original inside a line can leave a gap (whole-line edits close up).
- Bold Arabic falls back to regular weight (no bold Noto Arabic bundled).
- Phone: dense lines give 6 to 10 px tap targets; enlarged 16 px edit box covers nearby words.
- Refusal note on a right-edge heading can be clipped; squeezed text is visibly smaller than neighbours.
- Edited words move to the end of the reading order; structure-tree /Alt not cleaned (marked content is).
- Inline images inside Form XObjects are not restored after MuPDF redaction (data loss risk, not a leak).

## Out of scope (phase 2, 4 to 6 days, later)
Paragraph re-wrap across lines, right-to-left line reflow, vertical text, editing font/size/colour of existing text.

## Team and order
After the running polish batch is merged (it touches `edit.jsx`/`g3-canvas.jsx` neighbours):
- Developer 1: `src/lib/editTextOps.js` (edit op + page text model with "editable or why not") and corpus cases (`cases-edittext.mjs`).
- Developer 2: Edit tool UI (`edit.jsx`, `g3-canvas.jsx`), using Developer 1's API stub agreed up front.
- Reviewer, then a fresh no-context user test, fixes, full test run, deploy on your OK.

## Cost and time
About 14 dev-days of work by the research estimate; as agents roughly 2 developer runs + fixes + reviews, about 1.5 to 2M tokens, a few hours wall clock.
