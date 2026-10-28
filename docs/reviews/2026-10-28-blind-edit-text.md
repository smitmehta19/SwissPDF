# Blind test: Edit PDF, change existing text (2026-10-28)

Tester: brand-new user, no docs, no source. Site http://localhost:4180/SwissPDF/#/edit. 13:09 to 13:40.
Desktop 1440x900 and phone 390x844. Outputs checked with PyMuPDF and pypdf (text, positions, pixels, raw streams).
Screenshots: `.playwright-mcp/blind/edit-*.png`. Downloads: `.playwright-mcp/blind/out/`.

## First impressions
- Knew what to do without help. Edit opens in "Edit text" mode with one clear line: "Click a word to change it. Double-click for the whole line." Click a word: an inline box opens on the word, text preselected, type, Enter. Felt like a real editor.
- Fast: measured 0.5 to 1 s from Enter to the change on the page (small invoice felt instant, not timed). Apply plus ready-to-download 1.6 to 2.5 s.
- Strong edge handling: signed PDF asks first ("Edit a signed PDF?"), scanned fax shows "run OCR first" with an Open OCR button, rotated page and Arabic RTL work, odd letters (Zoë Ünal €, ß ✓ Ω) render and extract.
- Weak spots: no reflow (longer text runs over neighbours, shorter text leaves holes), one line that would not edit at all, and one file whose page got damaged on save.

## Problems, ranked

### P0
**P0-1. Saving an edit corrupts inline images on the edited page (seen on the password PDF): header bar disappears, content stream invalid**
- Likely general: inside an inline-image dict `/I` means Indexed as a `/CS` value but Interpolate as a key. The rewriter turned `/CS[/I/RGB 3<..>]` into `/CS//I true`, so any edited page with an abbreviated indexed inline image should break. TAM page 1 is the only page in my test set with inline images (other 6 outputs: no inline images, no MuPDF warnings, pixel diffs only where I edited). Could not separate Unlock from Edit here, but the BI dict was re-serialised (now `/F/AHx` hex), which points at the Edit page rewrite.
- Steps: Files, type password in the locked card (user-pw-TAMReview.pdf), Unlock. Edit, pick it, click "Indiana", type "Purdue", Enter, Apply, Download.
- What happened: text change is fine, but page 1's inline image (grey/orange rule under "Working Papers on Information Systems") is rewritten with a broken colour space: original `BI/CS[/I/RGB 3<ECEB...>]...` became `BI /W 1/H 8/BPC 2/CS//I true/D[0 3]...`. MuPDF reports "unknown colorspace", "syntax error in content stream", "unknown keyword 'EI'" on every open. The rule is gone in the saved file. App console fills with 20+ mupdf errors.
- Expected: only the edited word changes; everything else on the page byte-identical in meaning.
- Evidence: `edit-31-locked-logo.png` (top = original, bottom = output), `edit-30-locked-before-after.png`.

### P1
**P1-1. Password silently dropped from the saved file**
- Steps: as P0-1.
- What happened: original is AES-256 with a user password. Downloaded `user-pw-TAMReview-edited.pdf` opens with no password (PyMuPDF `needs_pass 0`, no /Encrypt). Only hint is "Made from an unlocked file, so it is kept for this session only". Nothing says "the download is no longer password protected".
- Expected: keep the original password, or ask / clearly warn before download. Kept at P1: nothing left the device and I typed the password myself.
- Evidence: checker output in this run; `edit-29-locked-edit.png`.

**P1-2. Longer text runs over neighbouring text, no warning, baked into the file**
- Steps: flipkart-invoice, double-click billing line "near Fun republic mall and nehru", type a longer line, Enter. arxiv paper, double-click "noam@google.com", type "noam@example.org".
- What happened: new text keeps going to the right and overprints the Shipping Address column ("Zoë Ünal €" on top of "near Fun republic") and the next author's email ("noam@example.orgnikip@google.com"). Same in the downloaded PDF.
- Expected: warn when the new text does not fit, or shrink / wrap it, like iLovePDF and Acrobat do.
- Evidence: `edit-07b-flip-crop.png`, `edit-11-flip-out-fitz.png`, `edit-14-arxiv-edits.png`, `edit-15-arxiv-out-fitz.png`.

**P1-3. Some lines cannot be edited; message is misleading**
- Steps: flipkart-invoice, double-click "WS Retail Services Pvt. Ltd.," (Sold By line), type "WS Retail", Enter. Tried 3 times, also after waiting.
- What happened: toast "Not changed: The page changed: try again". Retrying never works. Nothing on the page had changed. A single-word click on the same line works.
- Expected: line edit works, or a message that says what to do instead ("edit word by word").
- Evidence: `edit-08-soldby-noop.png`.

### P2
- **P2-1 Shorter text leaves holes.** "Services" -> "Stores" gives "WS Retail Stores    Pvt. Ltd.,"; "dominant" -> "main" in a justified paragraph gives "The main       sequence". No reflow of the rest of the line. `edit-11-flip-out-fitz.png`, `edit-15-arxiv-out-fitz.png`.
- **P2-2 Centred lines stop being centred.** Longer title "Attention Is Everything We Want" and BERT subtitle grow from the old left edge. `edit-15-arxiv-out-fitz.png`, `edit-17-rot-edited.png`.
- **P2-3 Style drift.** Arabic bold heading "الديباجة" comes back regular weight (`edit-21-arabic-out-fitz.png`). Paper's typewriter email font becomes thin Courier. Fonts swap to standard Helvetica/Times (close, but not the original).
- **P2-4 Garbage in the edit box.** Clicking an Arabic heading word whose text layer is broken shows "ا��نسان" in the box, then refuses with "This text can't be read as letters". Refusal is right; showing the garbage first is not. `edit-20-arabic-edited.png`.
- **P2-5 Scary/unclear Run wording.** "Replaces the 5 selected files with the results" when only 1 file has edits. Only the edited file was replaced. `edit-06-flip-4edits.png`.
- **P2-6 Reading order changes.** Edited lines are moved to the end of the page text, so copy-all / screen readers get "Stores", "999.00" after the footer.
- **P2-7 After Apply only the result stays selected.** File picker in the viewer disappears; must go to Files, Select all, back to Viewer for the next file. Easy to get lost (I clicked the sidebar "Unlock" tool by mistake while looking for the card's Unlock button: two buttons with the same name).
- **P2-8 Phone view not fitted, tiny targets.** At 390 px the page opens wider than the screen and is cut off on the right; editing still works. Word targets are about 11 px tall and the inline edit box about 12 px, far below a usable tap size. `edit-32-mobile-open.png`, `edit-34-mobile-after.png`.
- **P2-9 Fax page:** banner says run OCR, but the sidebar still says "Click a word to change it".
- **P2-10 Console noise:** mupdf "dropping unclosed output" on apply for the BERT file; pdf.js font warnings.

## Edits tried

"Text" = gone from PyMuPDF and pypdf text at the old position. "Raw" = count of the old string in page content streams, original -> output (remaining hits are other, untouched copies). Times: from Enter to the change showing; "not timed" where I did not measure cleanly.

| File | Change | Worked | Looks OK | Old text gone: text / raw | Time to show |
|---|---|---|---|---|---|
| flipkart-invoice | word Anushrut -> Abhishek (same length) | yes | yes | yes / 2 -> 1 | not timed (looked instant) |
| flipkart-invoice | line -> longer + Zoë Ünal € | yes | no, overlaps Shipping column | yes / n/a | not timed |
| flipkart-invoice | line "WS Retail Services Pvt. Ltd.," -> "WS Retail" (shorter) | no, "The page changed: try again" x3 | n/a | n/a | n/a |
| flipkart-invoice | word Services -> Stores (shorter) | yes | gap before "Pvt." | yes / 3 -> 2 | not timed |
| flipkart-invoice | delete word "Memory" | yes | yes ("cards" stays put) | yes / 2 -> 1 | not timed |
| flipkart-invoice | 319.00 -> 999.00 | yes | yes | yes / 3 -> 2 | not timed |
| flipkart-invoice | undo / redo with Ctrl+Z, Ctrl+Shift+Z | yes | yes | n/a | instant |
| arxiv attention | title line -> longer | yes | not re-centred | yes / n/a (encoded, 0 -> 0) | 0.95 s |
| arxiv attention | email -> longer | yes | no, overlaps next email | yes / 1 -> 0 | 0.5 s |
| arxiv attention | "Abstract" -> "Résumé ß ✓ Ωmega" | yes | yes (fallback font) | yes / 1 -> 0 | 0.9 s |
| arxiv attention | word dominant -> main | yes | big gap | yes / 1 -> 0 | not timed |
| rot90 BERT | word Abstract -> Summary | yes | yes | yes / 1 -> 0 | 1.0 s |
| rot90 BERT | subtitle line -> longer | yes | not re-centred | yes / n/a | 1.0 s |
| udhr-arabic | line الديباجة -> المقدمة الجديدة | yes | shaped OK, bold lost | yes / n/a (encoded) | not timed |
| udhr-arabic | word in heading | no, "can't be read as letters" | n/a | n/a | n/a |
| irs-fw9 form | (Rev. March 2024) -> (Rev. April 2025) | yes | yes | yes / 1 -> 0 | not timed |
| irs-fw9 form | "Individual/sole proprietor" -> "Individual" | yes | yes, 23 fields kept | yes / 2 -> 1 | not timed |
| fax scan | click text | blocked with "run OCR first" + button | n/a | n/a | n/a |
| signed invoice | $4.11 -> $9.99 after warning | yes | yes, signature removed as told | yes / 4 -> 3, single revision | not timed |
| locked TAMReview (unlocked in card) | Indiana -> Purdue | yes | NO: header rule lost, stream errors | yes / 2 -> 1 | not timed |
| TAMReview, phone 390x844 | Mohammad -> Muhammad | yes | yes | not checked | not timed |
| TAMReview, phone 390x844 | Abstract -> Summary | yes | yes | not checked | 0.97 s (timed to edit count) |
| TAMReview, phone | Undo / Redo toolbar buttons | yes, count 2 -> 1 -> 2 | n/a | n/a | instant |
| TAMReview, phone | line focused (programmatic focus) + Enter opens line box, Esc cancels and restores focus | yes | n/a | n/a | instant |

Other checks
- All outputs open in PyMuPDF and pypdf; page counts kept; untouched pages pixel-identical (arxiv 14, BERT 15, UDHR 4, W-9 5); outline (22 entries) kept; rotation and cropbox kept.
- Old words: removed at their old position in every saved file; any remaining hits are other, untouched copies of the same word. No incremental update (one %%EOF), so old bytes are not hiding in an earlier revision.
- New text is searchable and copyable in both readers, including accents, €, ß, ✓, Ω and Arabic.
- MuPDF render warnings on every edited page: none, except TAMReview page 1 (P0-1).
- Network: page load fetched only localhost GETs (app assets, wasm, Noto fonts). During a full edit, Apply and Download on the phone: zero requests. No POST, no other host.

## Verdict
Editing existing text works and feels good: clear, fast, keyboard friendly, honest about scans and signatures, and the old text really is removed from the file, nothing uploaded. Not ready to call done: saving can corrupt other content on the edited page (inline images, likely any file that has them), password protection is silently dropped, and with no fit handling longer text overprints its neighbours. Fix P0-1, P1-1, P1-2, P1-3, then re-test with more inline-image files.

## Re-check (fresh build, 13:55 to 14:20)

Same rules: only the site and the downloads. Fresh copies of the originals added to the workspace. Downloads in `.playwright-mcp/blind/out2/`, screenshots `edit-r*.png`. Each download checked in PyMuPDF (MuPDF warnings over all pages, text, raw page streams, pixel diff vs original) and pypdf where relevant.

### Status of earlier findings

| Item | Now | Evidence |
|---|---|---|
| P0-1 inline image corrupted (TAMReview) | **Fixed.** "Indiana" -> "Purdue" on page 1: both inline images kept byte-for-byte (`/CS[/I/RGB 3<ECEB...>]` intact), header bar present, no new MuPDF warnings (only "bogus font ascent/descent", which the original also has), only the edited line differs | `out2/tam2-crop.png` |
| P1-1 password silently dropped | **Fixed (as a warning).** Result card says "Made from an unlocked file: the result has no password ... use Protect if it needs a password again." Download still has no password, which is now stated | `edit-r07-tam-done.png` |
| P1-2 longer text overprints | **Fixed.** Flipkart billing line: note "Runs past the margin or into the next text. Squeezed to fit before the next column" with a "Fit to width" button; text ends at x=324, Shipping column starts at 326, no overlap in the file. arXiv email squeezed, no collision. An address line too long even when squeezed is refused with "No room for this text here, even squeezed: try shorter text" (AWS ATTN line) | `edit-r02-flip-long.png`, `out2/flip2-crop.png`, `out2/arxiv2-crop.png` |
| P1-3 Flipkart "WS Retail Services Pvt. Ltd.," line will not apply | **Fixed.** Applies first time (0.9 s), "Sold By : WS Retail" in the file | `edit-r03-flip-soldby.png`, `out2/flip2-crop.png` |
| P2-1 gaps after shorter text | **Partly fixed.** Line rewrites close up: "Lucknow" -> "Agra" and arXiv "dominant" -> "main" have no gap (arXiv line now ends a bit short of the justified margin). Still a gap on a word edit in the TraceMonkey title: "Tracing        Just-in-Time Type..." | `out2/tm2-crop.png` |
| P2-2 centred titles | **Fixed.** "Attention Is Everything We Want" is centred over the rule | `out2/arxiv2-crop.png` |
| P2-3 style drift (Arabic bold) | **Not fixed.** "الديباجة" (SegoeUI-Bold) still comes back as NotoSansArabic Regular | `out2/udhr2-crop.png` |
| P2-4 Arabic edit box garbage | **Fixed.** No edit box opens; refuses straight away: "Not changed: This text can't be read as letters, so it can't be edited". The note bubble is clipped at the viewer's right edge, and the line's accessible name still contains broken characters | `edit-r08-arabic-word.png` |
| P2-5 "Replaces N files" | **Fixed.** Now "Replaces flipkart-invoice.pdf with the result" | `edit-r04-flip-short.png` |
| P2-8 phone fit and tap targets | **Mostly fixed.** At 390x844 the page fits the width (326 px, no side scroll). Tap area is now bigger than the line (a tap 6 px above a line hits it) and the edit box opens enlarged (58x18 px). Line boxes are still 6 to 10 px tall and the enlarged box covers nearby words; still well below a 44 px target | `edit-r09-phone.png`, `edit-r10-phone-tap.png` |

### Files not tried before

| File | Change | Result | Old text gone | Other pages |
|---|---|---|---|---|
| aws-invoice | right-aligned "August 3 , 2014" -> "Sept 30 , 2015" | stays right-aligned, clean | yes (2 -> 1, other copy untouched) | unchanged |
| aws-invoice | "ATTN: iViveLabs Limited" -> a much longer company name | refused with a clear "No room ... try shorter text"; nothing changed | n/a | n/a |
| pdfjs-tracemonkey | title word "Trace-based" -> "Tracing" | applied, same bold font, but leaves a wide gap before "Just-in-Time" | yes | unchanged (page 2 content identical) |

### New small issues (P2)
- "user-pw-TAMReview.pdf is already in your files. Added again." banner stays on screen for the whole session, through every file switch and even after a reload.
- Re-adding a file that is already in the workspace keeps both copies (two locked TAMReview cards). The edited outputs get " (2)" names, which is fine.
- Squeezed text (Flipkart billing line) is noticeably narrower and smaller (7.9 pt vs 9 pt) than its neighbours; readable, but visible.

### Network
Request log from the last page load (phone check, then the AWS and TraceMonkey edits, applies and downloads): only localhost GETs (wasm, Noto font, app assets). No POST, no other host. Earlier re-check steps were not captured.

### Re-check verdict
No P0 or P1 left. The P0 (inline image damage) and all three P1s are fixed and verified in the downloaded files. Open P2s: gap after a shorter word in some single-word edits (TraceMonkey title), Arabic bold lost, small tap targets on phone, the sticky "Added again" banner, the clipped refusal bubble.
