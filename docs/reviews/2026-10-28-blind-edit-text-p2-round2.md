# Blind review, Edit PDF text editing, round 2 (2026-10-28)

Tester: first-time user, no source, docs or earlier reviews read. App at http://localhost:4180/SwissPDF/#/edit, Chromium via Playwright, 1440x900 and 390x844.
Outputs checked with pdftotext (poppler), PyMuPDF/MuPDF text extraction, and 2.5-3x MuPDF renders.
Session was paused once (usage limit, about 3 hours) and resumed on the restarted server; aws-invoice was redone after the pause.

Files used:
- `reports/pdfjs-tracemonkey.pdf` (two-column justified paper, hyphenation, ligatures)
- `invoices/aws-invoice.pdf` (table, right-aligned amounts)
- `forms/irs-fw9.pdf` (form fields)
- `derived/edittext-decor-underline.pdf` (underlined words)
- `intl/udhr-arabic.pdf` (Arabic, right to left)
- `scanned/lincoln-ellsworth-letter-1861.pdf` (scan)
- `invoices/coolblue.pdf` (my pick: Dutch invoice, NotoSans, coloured slogan, address block)

Screenshots: `docs/reviews/blind-p2-r2/`. Files ending `-out.png` / `-orig.png` are MuPDF renders of the downloaded PDF / the original.

Not tested (time): arxiv attention paper, Arabic paragraph on a second Arabic file (udhr-arabic paragraphs refuse, see P2-6), copy-paste from a desktop viewer (checked via text extraction instead).

## What worked

- Word edits, shorter and longer, incl. ligature word ("difficult" -> "challenging") on a justified line: line stays justified, no overlap (`tm-word-short.png`, `tm-word-long.png`, `tm-out-abstract.png`).
- Whole-line edit (double-click) keeps the line in place (`tm-line.png`).
- Appending a sentence to the tracemonkey abstract: clean result, same font, ligatures fine, no overlap with the heading below (`tm-out-abstract.png`).
- Right-aligned table amount "$4.11" -> "$104.11" stays right-aligned in its cell (`aws-amount.png`, `aws-out.png`).
- Form field click: "This is a form field: use Forms" with an "Open Forms" button (`fw9-field-click.png`). Output keeps all 23 widgets; only the edited label changed.
- Too-long word: "Not changed: No room for this text here, even squeezed: try shorter text", typed text kept in the box (`fw9-word-long.png`).
- Far too long paragraph (+5,900 chars): clear refusal, typed text kept (5,926 chars still in the box), Apply disabled with "The last text edit was not applied: change it, or press Esc." (`para-too-long.png`).
- Scanned page: banner "Scanned page: run OCR first to edit its text." with "Open OCR" (`scanned-click.png`).
- Arabic word edit: box opens right to left, result is right-aligned and correctly shaped, extracts as logical Arabic "المقدمة العامة" (`ar-word.png`, `ar-word-out.png`).
- Undo of a paragraph edit: 0.23 s, page back to the previous state, edit count drops by one (`tm-undo.png`).
- Old text gone from the page text of every output (MuPDF and pdftotext): "difficult to com", "may vary at runtime", "Without exact type information", "iViveLabs", "Additional information", "Bluebird", "Sessamestreet", "Nederland", "zelf wel", Arabic "الديباجة". Single `%%EOF`, no incremental leftovers.
- Whole-file stream scan (every object, decompressed) of the tracemonkey, aws, coolblue (x2), underline and Arabic outputs: no unreferenced streams with text, and none of the old words in any stream (the only "Dynamic" hits are the title and later pages, which are real). Exception: the fw9 XFA copy, see P0-2.
- New text is selectable and extracts in reading order in MuPDF and pdftotext (Arabic checked with `pdftotext -enc UTF-8`: "المقدمة العامة" in logical order).
- Reloading with unsaved edits shows the browser "Leave site?" warning.
- Phone (390x844): bottom bar with the text box, Paragraph, Cancel, Apply works for both word and paragraph edits (`phone-word-open.png`, `phone-para-open.png`); output correct (`phone-out.png`).
- No console errors during the whole run.

## Problems

### P0

**P0-1. Paragraph edits put stray hyphens inside words the user never touched.**
File `reports/pdfjs-tracemonkey.pdf`, page 1.
Steps A: triple-click the right-column paragraph "Compilers for statically typed languages...", select and delete the sentence "Without exact type information, ... type combinations. ", Ctrl+Enter.
Seen: the paragraph reflows and the old end-of-line hyphens stay inside words mid-line: "informa-tion", "pro-gramming", "infer-ence", "opti-mized" (`tm-para-delsentence.png`, `tm-out-rightcol.png`). pdftotext of the download also returns "informa-tion", "pro-gramming", "infer-ence", "opti-mized".
Steps B: triple-click the abstract a second time (after an earlier paragraph edit), delete the last two sentences, Ctrl+Enter.
Seen: "com-pile" moves to a line start, "al-ternative", "ac-tual", "discov-ered" mid-line (`tm-para-twice.png`). (I undid B before saving; A is in the saved file.)
Cause visible to the user: the paragraph text box already shows "com-pile", "al-ternative", "ac-tual", "discov-ered", "informa-tion" as one word with a hyphen, so the user is handed the broken words and must fix each one by hand.

**P0-2. Form with an XFA copy: the edited label is changed on the page but the old text stays in the file.**
File `forms/irs-fw9.pdf`, page 1.
Steps: click the checkbox label "Partnership" (line 3a), type "Partners", Enter, Apply, download.
Seen: page text is correct ("Partners", only that line differs from the original, 23 of 23 form widgets kept). But the file still carries its XFA form (`/AcroForm /XFA`, template object 38) and that template still holds the original captions: 24 copies of "Partnership", none of "Partners". Anyone can read the old label from the file, and a viewer that renders XFA may show the old label instead of the edit. For a label this is harmless; for a name or number on an XFA form the "removed" text would still be in the file. Either drop the XFA part on save (and say so) or refuse edits on XFA forms.

### P1

**P1-1. An earlier line edit becomes a hard break inside the paragraph; justified paragraph gets an orphan word line and a ragged line.**
File tracemonkey, page 1, right column.
Steps: double-click line "may vary at runtime. This means that the compiler can no longer", change to "may change at runtime. This means the compiler can no longer", Enter. Then triple-click the same paragraph and delete a sentence (P0-1 step A).
Seen: the text box shows hard line breaks before and after the line-edited line. Output has "expressions" alone on its own line, then "may change at runtime. This means the compiler can no longer" left-aligned and not justified, inside a justified paragraph (`tm-out-rightcol.png`). The first line of the paragraph is also stretched with very wide gaps ("Compilers for statically typed languages rely on type").

**P1-2. Underlined text: edit is accepted and the underline no longer matches the words; paragraph alignment changes.**
File `derived/edittext-decor-underline.pdf`, page 1. Original underline covers "running across the field until" (`underline-orig.png`).
Steps: click "the" (underlined) in line 2, type "sprinting", Enter. Then triple-click the paragraph, add " Then it slept well.", Ctrl+Enter, Apply, download.
Seen: no warning about the underline. Output underline stays at its old length and now covers "running across sprinting field", "until" is no longer underlined (`underline-out.png`). The paragraph was left-aligned (ragged); after the edit line 3 "last, tired but happy with the long day it had today." is stretched like justified text.

**P1-3. Address block paragraph edit re-wraps untouched lines, shrinks the font and closes the gap to the next block.**
File `invoices/coolblue.pdf`, page 1.
Steps: click "Bluebird", type "Blackbird-Smithson", Enter. Triple-click the address block, select "Sessamestreet 32", type "Keizersgracht 1001 bis", Ctrl+Enter, Apply.
Seen: the text box shows the 3 address lines joined with spaces ("Pino Blackbird-Smithson Sessamestreet 32 1025 RX Amsterdam"), line breaks lost. Result: the name is split over two lines ("Pino" / "Blackbird-Smithson") although I did not touch it in the paragraph edit, all lines shrink 10 pt -> 9.4 pt ("Squeezed to fit the room there"), and "1025 RX Amsterdam" now sits directly on "Factuurnummer:" with no blank line between (`cb-para.png`, `cb-out.png`).

### P2

**P2-0. Add keeps the previous file selected, so one Apply changes two files.**
Repro: Edit tool, Add flipkart-invoice.pdf, change one word, do not apply. Add pdfjs-openoffice.pdf. Files panel now says "2 selected"; the viewer switches to the new file (a file picker appears in the viewer header). After editing the second file the Run panel says "2 edited PDFs will be created with 2 edits. Replaces the 2 selected files with the results." (`repro-after-add-b.png`). So it is disclosed, but easy to miss when you think you are working on one file.
Related, not confirmed: on aws-invoice after my session pause, one Apply also saved "aws-invoice-edited (2).pdf" with 2 edits I did not make in this session ("Invoice Number:" -> "Invoice s", "410 Terry Ave North" -> "410 otto Ave North") (`aws-done-2files.png`). I could not trace them to anything I did. Possibly left by someone else using the same browser profile during my pause, possibly a pending edit carried over; worth a developer look.

**P2-1. Leftover space glyphs at old text positions.** aws output: the old "ATTN" line and the deleted second line of the "Greetings" paragraph still have dozens of single space glyphs at their old positions (MuPDF lines with only " "). coolblue and slogan the same. Not visible, old words gone, but text extraction gets stray spaces.

**P2-2. Font fallback is visible.** tracemonkey line edit -> Times-Roman (toast "Closest match: Times-Roman"); aws ATTN line HelveticaNeue-Light -> Helvetica, visibly heavier (`aws-top.png`); coolblue "Nederland" -> "Holland" in Helvetica next to NotoSans (`phone-out.png`); Arabic heading SegoeUI-Bold -> NotoSansArabic synthetic bold (`ar-word-out.png`). Messages are honest, result looks patched.

**P2-3. False overflow warning.** aws, line "ATTN: iViveLabs Limited" -> "ATTN: Example Trading Company Limited": toast "Runs past the margin or into the next text" with "Fit to width", but the line ends at x=224 pt, nowhere near the next column at 257 pt (`aws-line.png`, `aws-top.png`).

**P2-4. Squeezes when not needed.** coolblue slogan "Dat betaal ik zelf wel." -> "Dat betaal ik graag zelf." (+2 chars, empty space to the right): "Squeezed to fit the room there", 16 pt -> 15 pt (`phone-para.png`).

**P2-5. Toasts cover the text being worked on.** "Closest match" toast sits over the next lines of the column (`tm-line.png`); form-field toast covers the fields (`fw9-field-click.png`); "Squeezed" toast covers the address (`cb-para.png`).

**P2-6. Arabic paragraph in udhr-arabic cannot be edited, and the screen reader label is garbage.** Triple-click on the paragraph "ولما كان من الضروري ..." opens no editor; message "Not changed: This text can't be read as letters, so it can't be edited" (clear). Typing goes nowhere. The focused element's label contains replacement characters ("ال��وري", "ا��نسان"). The file's own text layer is broken, so the refusal is fair; the label should not expose the garbage.

**P2-7. Phone: page shown at 41%, words are tiny tap targets.** Word height is about 4 px at 390 px width (`phone-word-open.png`). Works with precise taps; a finger will miss.

**P2-8. Paragraph commit and some Apply runs over 2 s.** See table. The done screen reports "Time 0.1 s / 0.2 s" for runs that took 2.0 to 2.3 s from click to done screen, so the shown number understates the wait.

## Latency

Measured from the commit key / click to the page image changing (edits) or to the done screen (Apply). Tool overhead (one browser round trip, about 10 to 30 ms for edits, about 100 ms for Apply clicks) is included; Playwright's own waits are not.

| File | Action | Time |
|---|---|---|
| tracemonkey | word shorter (Dynamic -> Fluid) | 1.03 s |
| tracemonkey | word longer (difficult -> challenging) | 0.65 s |
| tracemonkey | whole line | 1.23 s |
| tracemonkey | paragraph longer (+1 sentence) | **2.55 s** |
| tracemonkey | paragraph, delete sentence | 1.88 s |
| tracemonkey | same paragraph second time | 1.34 s |
| tracemonkey | Undo | 0.23 s |
| tracemonkey | Apply (5 edits) | 0.42 s |
| aws-invoice | word (amount) | 0.57 s |
| aws-invoice | line | 0.40 s |
| aws-invoice | paragraph shorter | 0.80 s |
| aws-invoice | Apply (2 files) | 1.53 s |
| irs-fw9 | word | 0.86 s |
| irs-fw9 | Apply | 1.62 s |
| underline | word | 0.16 s |
| underline | paragraph (+1 sentence) | 0.27 s |
| underline | Apply | **2.04 s** |
| udhr-arabic | word | 0.54 s |
| udhr-arabic | Apply | **2.31 s** |
| coolblue | word | 0.27 s |
| coolblue | paragraph (address) | 0.56 s |
| coolblue | Apply | 1.68 s |
| coolblue, phone | word | 0.28 s |
| coolblue, phone | paragraph | 0.32 s |
| coolblue, phone | Apply | 0.17 s |

Refusals (too-long word, too-long paragraph, form field, scanned page, unreadable Arabic) appeared at once (under 0.5 s).

## Counts

P0: 2. P1: 3. P2: 9.

## Verdict

Word and line edits, refusals and old-text removal from page content are solid; not ready to ship as is: paragraph reflow breaks hyphenated words the user never touched and re-wraps or re-aligns nearby lines, and on XFA forms the old text stays in the file.
