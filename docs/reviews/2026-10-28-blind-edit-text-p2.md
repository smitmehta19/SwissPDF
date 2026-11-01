# Blind test: Edit PDF, edit existing text (phase 2)

Date: 2026-10-28. Tester: first-time user, no source or docs read. App: http://localhost:4180/SwissPDF/#/edit (Chromium via Playwright, 1440x900 and 390x844).
Screenshots: `docs/reviews/blind-p2/`. Downloaded outputs (gitignored scratch): `.playwright-mcp/dl-tracemonkey.pdf`, `dl-attention-phone.pdf`, `dl-fw9.pdf`, `dl-arabic.pdf`, `dl-arabiccid.pdf`.
Output checks: pdf.js 5.4 (`getTextContent`), poppler `pdftotext`, MuPDF (PyMuPDF) text + render, raw content-stream search.

Files used: `reports/pdfjs-tracemonkey.pdf`, `reports/arxiv-1706.03762-attention.pdf`, `forms/irs-fw9.pdf`, `intl/udhr-arabic.pdf`, `intl/pdfjs-ArabicCIDTrueType.pdf`, `scanned/letter-to-benjamin-glover.pdf`.

## What worked

- Discoverable: hint line under the toolbar ("click a word, double-click line, triple-click paragraph") and a fuller one in the side panel. Phone gets a bottom sheet with Paragraph / Cancel / Apply, readable and easy to hit.
- Word, line and paragraph editors open on the right target and commit instantly (under 20 ms on desktop, about 60 ms on phone).
- Old text is really gone. In every output, the replaced or deleted words are absent from pdf.js, poppler and MuPDF text, and from the raw page content streams (checked "traditional compilers", "difficult", "But this requires...", "unintended tail duplication", "sequence transduction", "We show that the Transformer...", "Business name", "resident alien", "more than one name"). All six downloaded outputs have a single `%%EOF`, so no older revision is left behind.
- Latin bold and italic kept: W-9 p1 "Note: If the account is in more than one name, see..." shortened to "Note: See the instructions...". Output keeps bold "Note:" (HelveticaNeueLTStd-Bd) and italic "What Name and Number To Give the Requester" (HelveticaNeueLTStd-It), same 8 pt fonts as the original (32-latin-bold-note-preview.png, 33-latin-bold-kept-200dpi.png).
- First paragraph edit on tracemonkey p2 (add a sentence) looked good: italics kept (guards, branch trace, trace tree), first-line indent kept, nothing overlapped, rest of the page did not move. Font squeezed slightly smaller to fit, with a note saying so.
- Shortening a paragraph leaves the rest of the page in place (gap below, no shifting).
- Refusals have clear words: "No room for this text here, even squeezed: try shorter text", "Not enough room for this text, even squeezed", "This text can't be read as letters, so it can't be edited", "These lines sit side by side, like a table: edit them one line at a time". Overflow gives a "Fit to width" button.
- Scanned page: banner "Scanned page: run OCR first to edit its text" with an "Open OCR" button (16-scanned-refusal.png). Very clear.
- W-9: editing label text kept all 23 form fields working.
- Arabic: a word edit on UDHR ("الديباجة" to "المقدمة") came out right-aligned and as real Unicode, searchable in pdf.js and poppler.
- Undo in the edit session works (6 to 5 edits, paragraph restored, 11-after-undo.png). Result screen offers Undo too.
- Done screen is clear: size before/after, time, "Nothing was uploaded".

## Problems

### P0 (wrong output)

**P0-1. Hyphens vanish from re-typeset paragraph text.** File `arxiv-1706.03762-attention.pdf`, page 1 (abstract) and page 2 (intro para 1).
Steps: phone width, tap a word in the abstract, Paragraph, delete the last sentence, Apply, Apply 2 edits, download. Same on desktop: triple-click intro paragraph on p2, append " They remain popular.", Ctrl+Enter.
Seen: printed text reads "English to French", "single model", "state of the art", "long short term memory", "encoder decoder". The text layer still has the hyphens, but the page shows a blank where each hyphen was. Words the user never touched are changed on the printed page.
Evidence: 27-hyphens-lost-render-200dpi.png vs 27-hyphens-original-200dpi.png (MuPDF render of the output), 26-hyphens-lost.png, 28-reopen-ligature.png.

**P0-2. A real hyphen at a line end is deleted when a paragraph is rejoined.** Same file and steps as P0-1.
Original "English-" / "to-German" (line break after the hyphen) becomes printed "Englishto-German". The paragraph editor already shows "Englishto-German" when it opens, so any paragraph edit bakes in the wrong word.
Evidence: 27-hyphens-lost-render-200dpi.png, 23-phone-paragraph-open.png.

**P0-3. Editing the same paragraph a second time corrupts it.** File `pdfjs-tracemonkey.pdf`, page 2, paragraph "Nested loops can be difficult...".
Steps: triple-click the paragraph, delete the last three sentences, Ctrl+Enter (fine, 08-paragraph-shorter.png). Triple-click it again, delete "When the inner loop exits, the VM would detect that a different branch was taken.", Ctrl+Enter.
Seen: the reopened editor text reads "diffi cult", "fi rst", "fi nd" (ligatures split with a space). After applying, the page prints "diffcult", "hot fi rst", "fi nd", and two lines ("VM would start tracing there." and "The VM would try") are stretched across the full column width (09-paragraph-sentence-deleted.png). Afterwards a triple-click on that paragraph refused with "These lines sit side by side, like a table". Undo restored the clean version (11-after-undo.png).
Reproduced a second time on a fresh upload and confirmed in the saved file `.playwright-mcp/dl-tracemonkey-repro.pdf`: pdftotext p2 gives "hot fi rst", "fi nd"; MuPDF render shows "diffcult" and the stretched lines (29-repro-reopen-ligature-text.png, 30-repro-second-edit.png, 31-ligature-corruption-in-file-200dpi.png).

### P1 (stuck or visibly wrong)

**P1-1. Replaced words are out of order or reversed when copied/searched.**
- pdf.js (Chrome/Firefox style viewers): all edited text sits at the end of the page's text, after the other column and footer. tracemonkey p1 ends with "Fast challengingis available, old compilers..." (no space, after the right column). p2: both edited paragraphs come after the right column and figure. attention p1: "token transduction models are based on complex recurrent orThe dominant". W-9: "Company name/..." is the last text on the page. Arabic: "المقدمة" appears after the page header URL.
- poppler (pdftotext, Evince/Okular): single-word and line edits come out reversed: W-9 "Company" reads "y na pm oC"; tracemonkey abstract line reads "t a ht e p yt ... s a s F i". In non-layout mode "Fast", "challenging" and the edited line are missing altogether.
- Paragraph edits read in the right order in poppler, but pdf.js and MuPDF still push them to the end.
Steps: any word edit, Apply, download, open in pdf.js or run pdftotext.

**P1-2. Arabic bold word comes back regular.** File `pdfjs-ArabicCIDTrueType.pdf`, line 3 (bold). Click "العربية", type "الفارسية", Enter.
Seen: new word in NotoSansArabic Regular next to bold words; note "Runs past the margin or into the next text" (14b-arabic-bold-lost.png).

**P1-3. Arabic "paragraph" merges a bold and a regular line and restyles them.** Same file. Triple-click line 4, append " وأنواع الخطوط الفارسية والتركية", Ctrl+Enter.
Seen: editor holds lines 3 and 4 together. Result breaks the bold line into "انواع الخطوط" / "الفارسية" on two lines even though there was room, turns the old regular line 4 bold (synthetic), and pushes text down into free space (15-arabic-paragraph.png). In pdf.js the rewritten lines have no spaces between words.

**P1-4. Justified paragraph comes back ragged.** attention abstract after the phone paragraph edit: original is justified, result is ragged right and line breaks differ (26-hyphens-lost.png).

**P1-5. Shortened paragraph is not reflowed.** `irs-fw9.pdf` p1, "Enter your TIN..." paragraph. Triple-click, delete the "However, for a resident alien..." sentence, Ctrl+Enter.
Seen: "For other" left alone on a short line, then "entities, it is your..." continues on the old line (19-form-edits.png). Looks like a typo in a tax form.

**P1-6. Refused paragraph throws away what the user typed.** W-9 TIN paragraph, add six long sentences, Ctrl+Enter. Message is clear ("Not enough room... try shorter text") but the editor closes and the typed text is gone; the user must retype to shorten it (18-too-long-paragraph.png).

**P1-7. Arabic body text on UDHR is almost all refused.** `udhr-arabic.pdf` p1: heading and every body line tried ("لما كان الاعتراف...", "ولما كان تناسي...", "ولما كان من الضروري...") say "This text can't be read as letters". Only lines without a lam-alef ligature work. Message is honest but a user cannot edit an Arabic paragraph here at all. (Also: triple-click opened a word editor and showed the refusal note at the same time.)

### P2 (polish)

1. Shorter word leaves a hole: "Dynamic" to "Fast" leaves a wide gap before "languages" in a justified line (01-word-shorter-preview.png, 03-word-longer-ok.png).
2. Longer word is squeezed by shrinking the font (tracemonkey "challenging" printed at 7.5 pt vs 9 pt body), even though the gap left by "Fast" on the same line was free (03-word-longer-ok.png).
3. Line edit that runs past the margin is still counted as applied; the user has to notice the toast and press "Fit to width" (04-line-edit.png). Replaced line uses Times-Roman instead of the file's NimbusRomNo9L.
4. Paragraph editor shows the whole text in italics for tracemonkey p2 (06-paragraph-open.png) and shows source artefacts like "na¨ıve".
5. Arabic double-click "whole line" opens only a fragment "( المؤرخ في 10" of a mixed Arabic/number line (12-arabic-line-fragment.png).
6. Clicking an empty form field on W-9 does nothing: no hint that the Forms tool fills fields (17-form-name-field.png).
7. Notes/toasts sit on top of nearby page text and hide what just changed (05, 07, 18).
8. Viewer scrolls by itself after some edits on W-9 and after closing the "already in your files" banner, so the next click lands on a different line.
9. Edit counter is odd: a paragraph edit left "4 text edits" unchanged, the next one jumped to 6.
10. Toolbar shifts when a line is selected (a "Paragraph" button appears), moving Undo under the pointer.
11. Apply to done screen often takes about 2.1 s wall time although the done screen says 0.2 to 0.3 s (one run 0.4 s).

## Latency

Commit = Enter / Ctrl+Enter / phone Apply until the editor closed; screenshots 300 to 400 ms later always showed the updated preview, so the real time is somewhere under 0.4 s. Apply = click "Apply N edits" until the done screen with Download shows (wall clock, includes test-tool overhead of a few ms).

| Action | File | Time |
|---|---|---|
| Word shorter (commit) | tracemonkey p1 | instant (preview updated within one poll) |
| Word longer, refused | tracemonkey p1 | 16 ms |
| Word longer, squeezed | tracemonkey p1 | 9 ms |
| Line edit | tracemonkey p1 | 11 ms |
| Fit to width click | tracemonkey p1 | 1.65 s (includes test-tool wait, not exact) |
| Paragraph longer | tracemonkey p2 | 9 ms |
| Paragraph shorter | tracemonkey p2 | 15 ms |
| Paragraph sentence delete | tracemonkey p2 | 17 ms |
| Arabic word | udhr-arabic p1 | 11 ms |
| Arabic CID word / paragraph | ArabicCIDTrueType | 8 ms / 11 ms |
| Too-long paragraph refusal | irs-fw9 p1 | 16 ms |
| Phone word / paragraph | attention p1 | 54 ms / 59 ms |
| Apply (5 edits, 14 pages) | tracemonkey | wall not measured, app says 0.2 s |
| Apply (2 paragraph edits, 14 pages) | tracemonkey repro | **2.27 s** wall, app says 0.2 s |
| Apply (1 edit) | udhr-arabic | **2.09 s** wall, app says 0.3 s |
| Apply (2 edits) | ArabicCIDTrueType | **2.08 s** wall, app says 0.2 s |
| Apply (2 edits) | irs-fw9 | **2.08 s** wall, app says 0.2 s |
| Apply (1 paragraph edit) | irs-fw9 (fresh) | 0.40 s |
| Apply (2 edits, phone) | attention | 1.50 s |

Over 2 s: only the Apply step, 4 of 6 runs at 2.08 to 2.27 s while the app itself reports 0.2 to 0.3 s; one run took 0.4 s, so the extra time is not steady.

## Not verified

- Undo on the done screen (after Apply) was not exercised; only in-session undo.
- Ligature corruption (P0-3) reproduced twice on tracemonkey only; attention p2 re-open kept "firmly" intact.
- Selecting text inside the app's own viewer after download was not tried; pdf.js, poppler and MuPDF were used instead.

## Verdict

Word edits are fast and the old text is truly removed, but paragraph edits can silently change untouched words (lost hyphens, joined words, broken ligatures) and edited text reads out of order or reversed in common viewers, so it is not ready to ship as is.
