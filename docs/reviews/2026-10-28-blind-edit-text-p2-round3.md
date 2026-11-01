# Blind review: Edit PDF, editing existing text (round 3)

Date: 2026-10-28. Tester: first-time user, no source or docs read.
App: http://localhost:4182/SwissPDF/ (Chromium via Playwright, 1440x900 desktop, 390x844 phone).
Start state: site storage cleared (1 IndexedDB, 2 caches, 1 service worker removed), file list confirmed empty.
Checks on output: `pdftotext` (poppler, mingw) and MuPDF from the repo's `node_modules/mupdf` (read-only script in my scratch folder: structured text with fonts, page renders, decompressed object search, metadata).
Screenshots: `docs/reviews/blind-p2-r3/`.

Files used: `reports/pdfjs-tracemonkey.pdf`, `reports/arxiv-1810.04805-bert.pdf`, `reports/arxiv-1706.03762-attention.pdf`, `invoices/aws-invoice.pdf`, `invoices/coolblue.pdf`, `forms/irs-fw9.pdf`, `intl/udhr-arabic.pdf`, `intl/pdfjs-ArabicCIDTrueType.pdf`, `scanned/fax-jean-schmidt-doe.pdf`, plus my own picks `derived/edittext-decor-underline.pdf` (underlined text) and `invoices/flipkart-invoice.pdf` / `reports/fdic-quarterly-banking-profile-2023q4.pdf` (loaded, not edited for lack of time).

## Verdict

Word, line and plain paragraph edits are solid and the saved files are clean (old text gone, untouched words identical in every extracted page), but paragraph reflow still looks visibly wrong in common cases (ragged lines, forced hyphen breaks, address blocks re-wrapped) and a squeezed word can survive a paragraph rewrite.

## What worked

- Word edit, longer and shorter, and whole-line edit (double-click) on tracemonkey: page updates in about 0.5 to 0.8 s, warning "Runs past the margin or into the next text" with a one-click "Fit to width".
- Paragraph edits (triple-click) on tracemonkey: append a sentence, delete a sentence, edit the same paragraph twice, insert a sentence in the right column of a two-column page. Lines above the change stay exactly as before, the paragraph never overlapped the next one ("Squeezed to fit the room there" instead).
- Extracted text of every saved file matches the original except the intended change. Checked full-page diffs: tracemonkey p1 and p2 to 14, BERT p1 and p2 to 16, attention p1 and p2 to 15, W-9 p1 and p2 to 6, AWS, Arabic p1 to 5. Ligatures ("fi", "fl"), "naïve", hyphenated words ("com-pile" etc.) all come back correct in the output text.
- Bold/italic runs kept: BERT "**B**idirectional **E**ncoder **R**epresentations ... **T**ransformers" keeps its bold letters after a paragraph edit; blue citation links ("Vaswani et al., 2017", "Taylor, 1953") keep their colour; W-9 bold "Future developments." and italic URL kept.
- Table cell: AWS "Total for this invoice" $4.11 to $1,204.11 stays right-aligned and bold, no overlap with the row.
- Old text really gone: W-9 "perjury" and "legislation enacted after they were published" found in 2 objects of the original (content stream plus one other object), in 0 objects of the output after decompression and TJ-string joining, and not in the raw file bytes. Form fields (1 field tree, 23 widgets) and the tag tree survive.
- Refusals are clear and keep the typed text: paragraph made 4x too long ("Not enough room for this text, even squeezed: try shorter text", textarea still holds all 2611 characters, Apply disabled with "The last text edit was not applied"); scanned fax ("Scanned page: run OCR first to edit its text" + Open OCR button); form checkboxes ("This is a form field: use Forms"); Arabic lines with unreadable glyphs ("This text can't be read as letters. You can still click single words that read correctly.").
- Arabic: word edit and a one-line paragraph edit render right-to-left, right aligned, correct shaping (Noto Sans Arabic fallback, announced).
- Undo/Redo: undo after a word edit and after a paragraph edit restores the exact original page image; redo and undo again also exact; Apply goes back to disabled.
- Apply is instant (under 0.2 s for all files) and the result card explains what happened ("5 text edits, closest font match: Times-Roman").
- Redact on W-9: "Taxpayer" removed from page text, Subject property changed to "Request for [redacted] Identification Number and Certification", XMP no longer contains "Taxpayer", result card says "Also cleaned: 1 document property, XMP metadata".
- Phone 390x844: tap a word opens a bottom sheet with the word, Paragraph, Cancel, Apply; paragraph textarea is large and readable; both edits applied and saved correctly.

## Problems

Counts: P0 0, P1 5, P2 11.

### P1

**P1-1. A word squeezed with "Fit to width" is hidden from the paragraph editor and survives a paragraph rewrite (paragraph editing).** Borderline P0: the saved page contains a word the user could not see or remove.
- File: `pdfjs-tracemonkey.pdf` page 2 (also seen on page 1).
- Steps: click "Nested" at the start of "Nested loops can be difficult..." , type "Nestedly", Enter, click "Fit to width". Triple-click the same paragraph. The textarea starts "loops can be difficult to optimize..." with no "Nestedly". Delete the first sentence "loops can be difficult to optimize for tracing VMs." and press Ctrl+Enter, Apply, download.
- Seen: page and saved PDF read "Nestedly In a naïve implementation, ...". pdftotext of output confirms. On page 1 the same happened with "Dynamic" to "Interpreted" (textarea started "languages such as JavaScript..."). Without "Fit to width" the edited word does show in the textarea (tested with "Every" to "Each"), so it is the squeeze step.
- Screens: `05-para-open.png`, `55-fit-then-para.png`, `56-squeezed-word-orphan.png`.

**P1-2. Reflowed paragraph lines lose justification and old line-end hyphens become forced short lines (paragraph editing).**
- Files: `arxiv-1810.04805-bert.pdf` p1 right column; `arxiv-1706.03762-attention.pdf` p1 abstract (phone); `pdfjs-tracemonkey.pdf` p1 right column.
- Steps (BERT): triple-click "In this paper, we improve the fine-tuning based...", change "we improve" to "we greatly improve", Ctrl+Enter, Apply, download.
- Seen: the 5 reflowed lines are left-aligned and ragged while the rest of the justified paragraph stays justified; "previously mentioned unidi-" sits alone on a half-empty line before "rectionality". Attention abstract: every line from "less time to train" down is ragged. Tracemonkey: "combinations. While compile-time static type infer-" then a ragged "ence might be able to gather ..." line. The text is correct, the look is not.
- Screens: `20-bert-bold-para.png`, `22-output-bert-ragged.png`, `61-output-attention-phone-ragged.png`, `15-output-tm-p1-rightcol.png`.

**P1-3. Address blocks: the paragraph editor drops line breaks, so a small change re-wraps the block (paragraph editing).**
- File: `coolblue.pdf` p1. Steps: triple-click "Sessamestreet 32". Textarea shows one line: "Pino Bluebird Sessamestreet 32 1025 RX Amsterdam". Change the name to "Pino Bluebird-Vandersteen" and street to "Sesamstraat 132 bis", Ctrl+Enter.
- Seen: "Pino" alone on line 1, "Bluebird-Vandersteen" on line 2, then street and city. The block grows from 3 to 4 lines and "1025 RX Amsterdam" now sits right on top of "Factuurnummer". 
- Same family on `aws-invoice.pdf`: textarea shows "ATTN: iViveLabs Limited 93B Sai Yu Chung\nYuen Long, ..." (first two lines merged, the third kept). Changing only "93B" to "95C" kept the 3 lines, but a typed line "Flat 12, 95C Sai Yu Chung Road" wrapped "Road" onto its own line although there is free room to the right.
- Screens: `45-coolblue.png` (before), `46-coolblue-address.png` (after), `25-aws-address-longer.png`.

**P1-4. Underlined text cannot be edited at all, and the message tells the user to do what they just did.**
- File: `derived/edittext-decor-underline.pdf` p1 (my pick). Steps: click "field" in the underlined run "running across the field until", type "fiold" (same length) or "meadows", Enter. Also tried "running".
- Seen: "Not changed: Underlined or struck text: edit it word by word" every time, for a single word. "sun" in the same line (not underlined) works. A paragraph edit is refused with the same message, but only after the user typed the new text (the textarea opens normally). Typed text is kept, so no loss.
- Screens: `37-underline-word.png`, `39-underline-tries.png`, `40-underline-para.png`.

**P1-5. Redact removes letters outside the black box and leaves a white hole.**
- File: `irs-fw9.pdf` (my edited copy, v2) p1. Steps: Redact tool, drag a box over "Taxpayer" in "Request for Taxpayer" (box bottom edge just touching the top of the next line), Redact 1 PDF, download.
- Seen: the black box covers only "Taxpayer", but the next line now reads "Identification Numb            fication": "er and Certi" was deleted with no black fill there. pdftotext of page 1 confirms. Expected: remove only what the black box covers, or extend the fill to what was removed.
- Screens: `42-redact-box.png` (box as drawn), `44-redact-output-overreach.png` (output render).

### P2

1. **Hyphens shown inconsistently in the paragraph textarea (paragraph editing).** Tracemonkey abstract: "com-pile" joined to "compile", but "al-ternative", "ac-tual", "discov-ered" keep the hyphen; BERT: "ma-jor" joined, "espe-cially", "re-strictions", "incor-porate", "re-sult" not. If the user edits near them and the line reflows, a mid-line "al-ternative" would appear. Saved text came out right in my tests.
2. **Squeezed text looks condensed.** "Interpreted" (tracemonkey p1) and the inserted sentence in the right column ("Squeezed to fit the room there") are drawn with visibly narrower letters than the lines around them. The app says so, but a reader sees odd type. `06-zoom200-abstract.png`, `14-output-tm-p1.png`, `15-output-tm-p1-rightcol.png`.
3. **Copy/reading order in the saved file.** MuPDF raw order puts edited and reflowed lines after all other text on the page (tracemonkey p1: "Interpreted" and the 4 reflowed abstract lines come after the footer and right column). Arabic edited line is extracted one word per line. pdftotext (which sorts by position) is fine; viewers that copy in stream order will not be.
4. **Arabic CID font: replacement word uses synthetic bold on a regular line.** `pdfjs-ArabicCIDTrueType.pdf` line 2, "العربية" to "الفارسية": new word is clearly heavier and larger than "انواع الخطوط". `60-arabiccid-word.png`.
5. **Line edit falls back to Times-Roman.** Tracemonkey "Mozilla Corporation∗" to "Mozilla Foundation" is set in Times-Roman instead of the embedded Nimbus Roman; looks almost the same here, but the superscript marker style is lost.
6. **Hint popups cover the text being edited.** "Runs past the margin or into the next text" sits over the next two lines; "Squeezed to fit the room there" and "Closest match ..." stay until dismissed. `03-word-longer.png`, `10-para-right-below.png`.
7. **Phone: page opens at 40%, lines about 5 px tall.** Tapping a single word on a 390 px screen is hard without zooming first. `49-phone-word-open.png`.
8. **"SwissPDF was opened in another tab" banner with only one tab open** after clearing site data. `01-loaded.png`.
9. **Inconsistent "too long" handling for a word.** "Dynamic" to "Interpreted" was accepted with a Fit to width offer; "Nested" to "Deeply-nested" in a similar justified line was refused ("No room for this text here, even squeezed"). Both are fine alone, but users cannot predict which.
10. **Empty form text fields give no feedback** when clicked in Edit text mode (only checkboxes show "This is a form field: use Forms"). W-9 line 1 field.
11. **Scanned page fills the accessibility tree with dozens of "Scanned page: run OCR first" labels** (one per hidden region), noisy for screen readers. `31-scanned.png`.

## Latency

Measured from the key press or click that commits (Enter, Ctrl+Enter, Fit to width, Undo) to the page image changing. My script polls every 25 ms through Playwright, so each number includes up to about 25 to 40 ms of my own polling and messaging; the fixed waits I added after each step (300 to 700 ms, for screenshots) are not included. Apply = click to Download button visible.

| File | Action | App time |
|---|---|---|
| tracemonkey p1 | word longer (Dynamic to Interpreted) | 474 ms |
| tracemonkey p1 | Fit to width | 476 ms |
| tracemonkey p1 | paragraph append sentence | 630 ms |
| tracemonkey p1 | same paragraph, delete sentence | 929 ms |
| tracemonkey p1 | right column, insert sentence (squeezed) | 1564 ms |
| tracemonkey p1 | line edit (Mozilla) | 623 ms |
| tracemonkey p1 | word shorter (productivity to work) | 767 ms |
| tracemonkey p1 | Undo | 287 ms |
| tracemonkey | Apply 5 edits | 129 ms (app says under 0.1 s) |
| tracemonkey p2 | word (Every to Each) | 662 ms |
| tracemonkey p2 | word + Fit to width | 581 + 584 ms |
| tracemonkey p2 | paragraph delete sentence | 1389 ms |
| tracemonkey | Apply 3 edits | 178 ms |
| BERT p1 | paragraph delete sentence | 665 ms |
| BERT p1 | paragraph insert word (bold runs) | 794 ms |
| BERT p1 | paragraph delete, then Undo / Redo / Undo | 756 / 36 / 147 / 143 ms |
| BERT | Apply 3 edits | 146 ms |
| AWS | address paragraph small change | 355 ms |
| AWS | address paragraph, add a line | 414 ms |
| AWS | table cell word | 323 ms |
| AWS | Apply 3 edits | 97 ms |
| UDHR Arabic | word | 441 ms |
| UDHR Arabic | one-line paragraph | 475 ms |
| UDHR Arabic | Apply 2 edits | 166 ms |
| Arabic CID | word | 274 ms |
| W-9 | word | 479 ms |
| W-9 | paragraph | 557 ms |
| W-9 | Apply 2 edits | 88 ms |
| W-9 | Redact run | 289 ms |
| coolblue | address paragraph | 257 ms |
| underline | word outside underline | 203 ms |
| attention (phone) | word | 345 ms |
| attention (phone) | paragraph | 697 ms |
| attention (phone) | Apply 2 edits | 161 ms |

## Not verified

- Flipkart and FDIC files were loaded but not edited (time).
- No word was edited inside an Arabic line that also has unreadable glyphs.
- Visual check of saved files was done on MuPDF renders only, not in a second viewer.
- The Playwright tool also wrote copies of each download into the gitignored `.playwright-mcp/` folder (overwriting older copies with the same names).
