# SwissPDF live design critique, 2026-10-27

Method: single-context live walk by a reviewer who did not build it. The impeccable detector (`detect.mjs`) was not run: the design-master skill map says to skip impeccable scripts without approval. Assessment is by hand in a real browser.

Build: `npm run build` (17 s, OK), served by `scripts/serve-pages-sim.mjs` at http://localhost:4180/SwissPDF/ (GitHub Pages sim, no COOP/COEP headers, coi-serviceworker on). Browser: Playwright Chromium. Screenshots: `.playwright-mcp/live-*.png` (gitignored). Viewports: 1440x900, 1280x720, 1024x768, 768x1024, 390x844. Themes: light and dark. Reduced motion emulated.

Real files used: `reports/pdfjs-tracemonkey.pdf`, `invoices/aws-invoice.pdf`, `office/poi-sample.docx`, `forms/irs-fw9.pdf`, `images/photo-castle-3456x2628.jpg`, `images/heic-nokia-C001.heic`, `large/911-commission-report.pdf`, `quirks/pdfjs-empty_protected.pdf`, plus a truncated PDF and a .txt made for the error test.

Test artefact, not an app bug: the duplicate `poi-sample.docx` and `irs-fw9.pdf` cards in some shots came from my own double upload (harness set the files twice). The real finding from it is "no duplicate warning, and identical output names" (S13).

## 1. Verdict

**Ship with fixes.** The core loop (add files, pick tool, set options, run, review card, undo, chain the next tool) works on real files, is fast, and the trust message is everywhere it should be. Big jumps since 2026-10-18: legacy tools are gone (chaining works), phone Run bar is sticky with an Options sheet, engine download is opt-in with a real progress bar, tabs are a proper tablist, contrast fail fixed, split names carry bookmark titles.

What blocks a clean ship is not looks, it is **which files a run touches**. Counts disagree on one screen, ineligible files stay checked, earlier results silently join the next run (Redact would redact 4 files when the user added 1), and the result screen offers next tools that dead-end on a just-locked file. Three must-fix items, all small to fix.

**Layout: keep it. Do not reconsider.** Top bar + left tool list + workbench + right options panel holds up at every width tested:
- 1440: workbench 780px, all four regions visible (live-04).
- 1280x720: workbench 661px, still works; only the options column gets cramped (S4) (live-38-compress-1280).
- 768: tool list becomes a drawer, workbench 413px + options 340px, usable (live-38-compress-768).
- 390: single column, sticky Run bar with an Options sheet (live-28, live-30).

The real layout problems are density inside the regions (55 tools always expanded, nested scrollers, the Files step eating the options column), not the structure. Moving to Stirling's rail + library + right tools layout would cost a rebuild and fix none of the must-fix items.

## 2. Design health (Nielsen, 0-4)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Determinate progress + Cancel in the Run bar (live-17-word2pdf-progress-1, live-21). But Undo is silent and the workbench shows nothing while a job runs |
| 2 | Match with real world | 3 | Verb run labels ("Compress 2 PDFs", "Download engine (55 MB) and convert"). Raw engine errors break it (S6) |
| 3 | User control and freedom | 3 | Undo, Cancel, Back to files, Discard page edits, version badges |
| 4 | Consistency and standards | 2 | Three different file counts on one screen; three control styles for single choice; Automate step order differs |
| 5 | Error prevention | 2 | Selection scope (M1), next-tool trap after Protect (M2), Split defaults to a no-op |
| 6 | Recognition over recall | 3 | Numbered steps, io hints, synonyms in search ("pass" finds Protect, Unlock) |
| 7 | Flexibility and efficiency | 3 | Ctrl+K palette with files/tools/settings, `/` search, skip links, favourites, recent |
| 8 | Aesthetic and minimalist | 3 | Calm, coherent in both themes; tool list is a wall of 55 rows |
| 9 | Error recovery | 2 | Broken file card shows "pdf-lib: Failed to parse PDF document (line:99 col:2331 ...)" |
| 10 | Help and documentation | 3 | Inline help under each option is short and plain |
| **Total** | | **27/40** | Solid; good product, rough edges on selection and errors |

## 3. Ranked findings

| # | Level | Screen | Problem | Evidence | Suggested fix |
|---|---|---|---|---|---|
| M1 | must-fix | Files grid + every tool | **Which files will run is unclear.** One screen shows "9 files" (header), "6 of 8 selected" (grid), "5 selected" (tool). Files the tool cannot use (.txt, broken PDF, PDFs in Word to PDF) stay checked with no sign they are skipped. Results of the last run stay selected, so adding a W-9 to Redact gives "Redact 4 PDFs" (2 old results + the new file). For redaction that is an irreversible action on files the user did not mean | live-23, live-16, live-19 | One source of truth: the tool's count. Dim and uncheck ineligible cards with a one-line reason ("Not used by Word to PDF"). When files are added while a tool is open, select only the new files (or ask once: "Use only the new file?"). Grid line reads "4 of 9 files go into Redact" |
| M2 | must-fix | Result card after Protect | "Edit your new files" offers Compress, Merge, Split on a file that was just locked. Clicking Compress lands on a card that is checked but counted "0 of 0 selected", Run disabled, and asks for the password the user typed seconds ago (WCAG 3.3.7 redundant entry) | live-09, live-54 | After Protect, suggest only Unlock / Download-type steps, or keep the password in memory for the session and pass it on. Never show a checked card that is not counted |
| M3 | must-fix | Segmented controls (Orientation, Margin, Split mode, Bookmark level, Protect Basic/Advanced) | Selected segment is white #fff on a #f8f7fc track: **1.06:1**, plus a 6% shadow. Text colour shift is small (#17151f vs #3c3a48). Fails WCAG 1.4.11; at a glance you cannot tell Portrait from Landscape | live-39, live-43, live-44 | Selected segment: `--accent` tint fill + accent text + 600 weight, or a 2px accent underline; aim 3:1 against the track. Same token in dark |
| S1 | should-fix | Tool list, desktop | 55 tools, all 6 groups always expanded. At 1440x900 only Organize and half of Convert fit; Compress, Protect, Redact, OCR need a scroll. Panel scroll jumps to the active tool on each pick | live-01, live-04, live-18 | Collapse groups by default and remember state; add a "Popular" group on top (Merge, Compress, Split, Protect, PDF to Word, Redact). Keep the active tool's group open |
| S2 | should-fix | Home, desktop | Empty desktop home is a drop zone and 550px of nothing. Phone home shows a "Pick a tool" directory, desktop does not. After adding files with no tool, nothing says what to do next | live-01, live-02, live-34 | Under the drop zone, 6 large popular-tool tiles. After files are added with no tool: a one-line hint "Pick a tool on the left, or press Ctrl+K" plus 3 suggestions by file type |
| S3 | should-fix | Split | Default is "Custom, 1 to 585", Run reads "Split into 1 PDF": a no-op that copies the file | live-43 | Default to "Fixed, every 1 page" or empty range with Run disabled ("Type a range"). Bookmarks tab first when the file has bookmarks |
| S4 | should-fix | Options panel, 1280x720 and tools with many files | Files step lists every file in a nested scroller; at 720px height the options are pushed under the Run bar (Compress shows only the top of "Smart clean") | live-38-compress-1280, live-30 | Collapse the Files step to its count row when more than 2 files ("5 selected, change"), as Stirling does. Options get the space |
| S5 | should-fix | Redact | Opens on the first selected file (poi-sample), not the file just added. Matches are now filled red (better) but still no list to review or untick (S11 from 2026-10-18 open). Page drawn at about 525px in a 780px area with no zoom | live-18, live-19 | Open on the newest file. Add the match list (checkbox, page, 40 chars of context). Fit-width by default |
| S6 | should-fix | File card error state | Broken PDF shows "Not a valid PDF" then raw engine text "pdf-lib: Failed to parse PDF document (line:99 col:2331 offset=9)... MuPDF repair: Unrecoverable". .txt is accepted into a PDF session silently. Nothing is announced (no role=alert) | live-23, live-24 | Card: "Can't open this PDF. The file looks damaged or incomplete." + "Try Repair" button. Put engine text behind "Details". Unsupported type: "Not a PDF. Word to PDF or Images to PDF can use some files like this." Announce via the existing live region |
| S7 | should-fix | Result card, phone | Preview fills the first screen; Download is at y=1071 on an 844px screen | live-32 | On phone put title, size line and Download/Undo above the preview, or cap the preview at 40vh |
| S8 | should-fix | File card actions, phone | 6 icon-only 30x30 buttons wrap to two rows; Remove sits next to Move later. "Remove all" sits right under "Select all" (S7 of 2026-10-18 open, worse with the new Undo icon) | live-53 | Phone: tap thumbnail to open, keep Rotate + Undo, move Move/Remove into a "..." menu (40px). Desktop: one row, Remove last with a gap |
| S9 | should-fix | Pages mode | 12 icon-only buttons, all disabled until a page is picked; on phone they wrap to 2 rows. Per-page hover actions stack over the thumbnail and show on every selected tile at once (S8 of 2026-10-18 open) | live-12, live-28, live-48 | Show the page toolbar only when pages are selected ("3 pages selected: Rotate, Delete, More"). One hover action set, outside the thumbnail |
| S10 | should-fix | Undo | Undo restores the previous version with no message; the user has to spot the badge change from v3 to v2 | live-10 | Toast/status: "Undid Protect. Files are back to v2." with Redo |
| S11 | should-fix | Word to PDF / Images to PDF result | "16% smaller" compares DOCX bytes to PDF bytes; "10% smaller" for images. Images to PDF result preview is a grey "PDF" placeholder and the name is generic "images.pdf" | live-17-word2pdf-progress-4, live-41 | Hide the size delta for conversions (show output size only). Render page 1 as preview. Name after the first image (`photo-castle.pdf`) |
| S12 | should-fix | Images to PDF cards | Open and Rotate are disabled on image cards (JPG and HEIC), so orientation cannot be checked or fixed before converting. HEIC thumbnail only decodes after a delay (grey "HEIC" first) | live-39, live-40 | Enable Open (show the image) and Rotate on image cards; decode the HEIC thumbnail on add |
| S13 | should-fix | Add files | Same file added twice is accepted silently; two outputs both named `poi-sample.pdf` | live-16, live-17-word2pdf-progress-4 | "Already added" note with Add anyway; suffix duplicate outputs (`poi-sample (2).pdf`) |
| S14 | should-fix | Running job | Only the Run bar shows progress. Cards do not show which file is being processed; the rest of the UI stays live | live-17-word2pdf-progress-1, live-21 | Mark the active card ("Working...") and dim the options while running |
| S15 | should-fix | Scrolling | Up to 4 scroll areas at once (tool list, workbench, options, options file list) and in Pages/result modes the page itself scrolls too, so the top bar shifts 15px between modes | live-12, live-22, live-38-compress-1280 | Make the shell 100dvh with only inner scrollers, or `scrollbar-gutter: stable` on html |
| N1 | nice | Tool rows, Recent | io hints still use arrows ("PDF → many PDF", N4 open); Recent rows truncate to "PDF → sm..." | live-04, live-06 | "PDF to PDFs"; hide io in Recent |
| N2 | nice | Pages heading | "1 pages" | live-12 | Plural rule |
| N3 | nice | Protect | Password rules drawn as empty circles read like radio choices | live-06 | Neutral dot or dash until met, then tick |
| N4 | nice | Merge options | "Order: Name A to Z / Name Z to A" are one-shot sort actions styled like choices | live-35 | Label "Sort now:" or move into the grid Sort menu |
| N5 | nice | Automate | "Automation" heading twice; step order (Automation, Files, Run) differs from other tools (Files, Options, Run) | live-20 | Drop the inner label; keep Files as step 1 everywhere if possible |
| N6 | nice | File card notice | "Restrictions removed s..." still truncated (N5 of 2026-10-18 open) | live-43 | Wrap to 2 lines |
| N7 | nice | Search | Top-bar search filters the side list; Ctrl+K palette is a second, richer search. Two UIs for one job | live-03, live-51 | Make the top-bar box open the palette |
| N8 | nice | Run line | Long Run text truncates ("cached after th...", "Never larger than the ...") | live-17-word2pdf-progress-1, live-28 | Allow 2 lines |
| N9 | nice | Result stats | Size shown as "1.12 MB > 970.6 KB" with a chevron | live-05 | "1.12 MB to 970.6 KB" |
| N10 | nice | Split progress | "0 / 1 Starting" while making 23 files | live-45 | Count parts |
| N11 | nice | Health check | Shows a Files step ("No file selected") for a tool that uses no files | live-37 | Hide the step |
| N12 | nice | Build | /favicon.ico 404 at the root | console | Add favicon link with base path |

Count: **3 must-fix, 15 should-fix, 12 nice.**

## 4. What works (keep)
- Result card: preview, per-file download, Undo, Back to files, "Done on this device. Nothing was uploaded.", next-tool chips. Better than iLovePDF's redirect (live-05).
- Engine download is now a choice with size, a determinate MB bar and Cancel (live-17-word2pdf-progress-1).
- Automate: built-in chains with visible steps and "File 3 of 4, step 4 of 5: Metadata" progress (live-21, live-22).
- Split by bookmarks: `911-commission-report_02_CONTENTS.pdf` with page range note (live-46).
- Ctrl+K palette with filters and keyboard legend; search knows synonyms (live-03, live-51).
- Reader mode: clean, focus moves into the dialog, Esc closes (live-13).
- Page editor guards: unsaved-edit dot on the Pages tab, Run blocked with "Save them first" (live-48).
- Dark theme coherent; no text contrast failures found by a scan of visible text on Compress in both themes; Remove all now 5.44:1 light, 7.05:1 dark.
- Reduced motion honoured (pulse dot animation drops to 0.00001s; no `transition: all`; motion tokens 150-240ms with ease-out).
- Focus ring visible on every stop tested (2px accent); skip links "Skip to files" and "Skip to options".

## 5. Status of the 2026-10-18 critique

| Item | Status | Evidence |
|---|---|---|
| M1 phone Run bar not reachable | Resolved: sticky bar + Options sheet | live-28, live-30 |
| M2 legacy tools break chaining | Resolved: Protect opens in shell with v2 files | live-06 (new trap after Protect, see M2 above) |
| M3 phone hides trust signal | Resolved: shield icon + "Runs on this device. Nothing is uploaded." under Run | live-28 |
| M4 red link contrast | Resolved: 5.44:1 light | measured |
| S1 tool panel density | Partly: rows are single line now, but all groups still expanded | live-01 |
| S2 long result list | Resolved: scrollable list, count line, per-file download | live-22, live-32 |
| S3 split names | Resolved | live-46 |
| S4 Sort "Choose" | Resolved: "Order added"; Remove all moved right on desktop (still close on phone) | live-02, live-53 |
| S5 55 MB default | Resolved: explicit download button and progress | live-16, live-17-word2pdf-progress-1 |
| S6 HEIC placeholder | Partly: thumbnail decodes later; Open/Rotate still disabled | live-39, live-40 |
| S7 phone card actions | Open, worse (wraps to 2 rows) | live-53 |
| S8 page editor icons | Open | live-12, live-28 |
| S9 focus not obscured | Not re-tested | |
| S10 tablist | Resolved: roving tabindex, arrow keys, tabpanel | tested by keyboard |
| S11 redact match list | Partly: filled highlights; no list | live-19 |
| S12 option card radio crowding | Partly: no overlap, labels wrap ("US / Letter") | live-39 |
| S13 colour field | Not re-tested | |
| N1, N6, N7 | Not re-tested | |
| N2 trust note on result | Resolved | live-05 |
| N3 single-output repeat | Open (summary line repeats the file) | live-41 |
| N4 io arrows | Open | live-04 |
| N5 truncated notice | Open | live-43 |
| "Start over" rename | Resolved: "Remove all files and start over" | live-05 |

## 6. Accessibility notes (WCAG 2.2 AA, live)

| Criterion | Status | Note |
|---|---|---|
| 1.4.3 text contrast | Pass (scan, both themes, Compress screen) | Placeholders and disabled not scanned |
| 1.4.11 non-text | Fail | Segmented selected state 1.06:1 (M3) |
| 1.4.10 reflow | Pass | 390 and 768 no horizontal scroll |
| 2.1.1 keyboard | Pass on flows tried | Palette, tabs, reader, Run reachable via skip link |
| 2.4.7 focus visible | Pass | 2px accent outline on every stop |
| 2.5.8 target size | Pass (30px icons) | Below 44px comfort size on phone (S8) |
| 3.3.1 error identification | Weak | Raw engine text (S6), not announced |
| 3.3.7 redundant entry | Fail | Password asked again after Protect then Compress (M2) |
| 4.1.3 status messages | Partial | Run progress announced; Undo and file errors not |
| Reduced motion | Pass | |

## 7. Design skills used

| Skill | Used / skipped | Part |
|---|---|---|
| design-master | Used | Router, "Review only" row |
| design:design-critique | Used | Framework: first impression, usability, hierarchy, consistency, a11y |
| impeccable critique.md | Used | Heuristics scoring, severity, report shape. Detector and live-server scripts skipped (no approval to run them) |
| design:accessibility-review | Used (quick reference) | WCAG checklist; checks run live: contrast scan, keyboard, reflow, target size |
| review-animations | Skipped | No new motion to review; motion checked live instead (reduced-motion emulation, grep of transitions and tokens) |
| Build-side skills (craft-floor, emil-design-eng, animate, ux-copy) | Skipped | Out of scope for a review-only task |

## 8. Next step
Fix M1-M3 in one batch (selection scope, next-tool list after Protect, segmented selected state), then one confirm pass on the same flows. S1-S4 are the best value of the should-fix list.
