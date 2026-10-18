# SwissPDF design critique, 2026-10-18

Reviewer: fresh UX pass (did not build it). Scope: U2 shell steps 10-13 (copy, accessibility, real browser, critique).

## 0. Limits of this review (read first)
- **Step 12 was NOT done live.** This agent session had no shell, no Playwright, no Lighthouse. No dev server was started, no keyboard-only run, no measured rendered contrast, no reduced-motion capture, no Lighthouse score.
- Evidence used instead: the existing screenshots in `docs/design/screens/{U2a,G1,G3,G4}/` (viewed), `src/app/shell.css`, `Shell.jsx`, `ResultScreen.jsx`, `FileGrid.jsx`, `controls.jsx`, `registry.js`, and hand-computed WCAG ratios from token hex values.
- `docs/design/screens/critique/` was not created (no new screenshots could be taken). Every finding below cites an existing screenshot or a source line. Findings marked **[confirm live]** need one real-browser check before the fix.
- Corpus walks: the real tasks were reviewed through existing screens, not run. Redact: only `quality-hosting.pdf` shot exists (G3), not an IRS form. DOCX: the G4 shot shows images.pdf selected, not a real .docx. Merge then compress then protect: not run end to end; protect is a legacy page (see M2). Split of the 911 report (G1) and HEIC (G4) have real shots.

## 1. Must-fix

### M1. Phone: the Run button is not reachable while you work **[confirm live]**
- Screen: any tool, 390px. Evidence: `shell.css` 1647-1696 (`.options{position:static}`, `.options-foot{position:sticky;bottom:0}`), `Shell.jsx` 502-571 (options render after `<main>`), `docs/design/screens/U2a/options-390-light.png`, `page-editor-390-dark.png` (Run is about 2000px down).
- Problem: a sticky element cannot leave its parent. The foot is inside `.options`, which starts below the whole file grid or page grid. Until the user scrolls past all tiles the Run bar is not on screen, so the DESIGN.md promise "Run bar sticky at the bottom of the screen" is not met. Options also sit below the tiles, so a phone user (merge, split, compress: the main phone jobs) must scroll to find any setting.
- Fix (CSS, no new component): at max-width 759px make `.shell` the containing block of the foot so it sticks for the whole page:
  - `.options{display:contents}` and `.options-foot{position:sticky;bottom:0}` (parent is now `.shell`, full height).
  - `.main{padding-bottom:calc(var(--run-bar-h,132px) + env(safe-area-inset-bottom))}` and `html{scroll-padding-bottom:calc(var(--run-bar-h,132px) + var(--s-4))}` so focus is not hidden (WCAG 2.4.11).
  - Reduce the bar to one line plus button on phone: live line 1 line with ellipsis, button 48px.
  - Add an "Options" button in the bar that scrolls to or opens the options as a bottom sheet, so settings are one tap away. Copy: `Options`.

### M2. Merge then compress then protect breaks: Protect (and Unlock, OCR, Repair, Compare) is a separate page with its own picker
- Screen: result "Continue with another tool" chips and tool panel. Evidence: `registry.js` lines 31-71 (`component:` legacy for repair, ocr, compare, protect, unlock, health), `Shell.jsx` 111 ("This tool still uses its own file picker. Files added here do not join your workspace yet.").
- Problem: the plan's done-when ("chain merge -> compress -> protect without re-adding files") fails today. The user finishes compress, taps Protect, and is asked to add the file again. Also fails WCAG 3.3.7 Redundant Entry (information already supplied must not be asked again). Protect is the third most common PDF job after merge and compress (iLovePDF research, section 1).
- Fix: finish G2 migration before U2 sign-off. Until then: remove legacy tools from every `next` list, and in the tool panel label them with a plain badge `Own page` (not colour only), and change the legacy note to `Opens on its own page. Add your file again there.` Do not offer Protect as a chip on the result screen if it cannot take the result.

### M3. Phone hides the only trust signal
- Screen: every phone screen. Evidence: `shell.css` 1662-1670 (`.bar .local-chip{display:none}`, brand `font-size:0`), `U2a/file-grid-390-light.png` (bar shows menu, mark, search, theme only).
- Problem: "files never leave your device" is the product's reason to exist and the main edge over iLovePDF (research section 6). Once files are added on a phone, the claim appears nowhere on screen. The mark alone also loses the brand name.
- Fix: keep the chip on phone as a 32px icon-only shield with visible text in the Run bar. Add to `.live-line` area one fixed line under the Run button: `Runs on this device. Nothing is uploaded.` (`--t-sm`, `--muted`). Give the icon chip `aria-label="Local only: files stay on this device"` and make it a button that opens a short dialog (a `title` tooltip is not reachable by touch or keyboard).

### M4. Red link text fails AA on the paper background
- Screen: file grid toolbar `Remove all` (every tool, light theme). Evidence: `U2a/file-grid-1440-light.png`, token `--err:#d63a45` on `--paper:#f4f3f7`. Computed 4.18:1 (needs 4.5). DESIGN.md quotes 4.61 only against white.
- Same colour is used by `.link-danger` (result "Start over", on white: 4.62, passes) and `.icon-btn-danger` (non-text, 3:1 needed, passes).
- Fix: add `--err-text:#b92d38` (5.44 on paper, 6.0 on white) in the light theme, keep `#ff6b72` in dark, and use it for `.link-danger`. One token, one line of CSS.

## 2. Should-fix (ranked)

### S1. Tool panel pushes Compress, Protect, Redact below the fold
- Screen: left panel, desktop 1440x960. Evidence: `U2a/home-1440-light.png` (only Organize and Convert visible; Optimize, Edit, Security need scrolling; every row is two lines, 47px).
- Also the home page lists all tools twice (left panel and the "Pick a tool" directory right under the drop area).
- Fix: rows 32px, single line (`--t-base`); show `io` only on hover/focus and as `title`/`aria-describedby`. Collapse categories (disclosure, remembered), open the current one. On home hide the duplicate "Pick a tool" directory when the panel is visible, or keep it and drop the panel to Favourites + Recent. Target: Compress and Protect visible without scrolling at 960px. Raise `.tool-row-io` from 11px to `--t-xs` 12px (`shell.css` 340; also 675 badge).

### S2. Phone result: preview shows only the first of many outputs; long list is clipped mid-row on desktop
- Screen: split result. Evidence: `G1/split-result-1440-light.png` (23 parts, list cut off in the middle of "List of Illustrations and Tables", no scrollbar or fade); `U2a/result-390-light.png`.
- Fix: `.result-list{max-height:min(40vh,320px);overflow:auto;mask-image:linear-gradient(#000 calc(100% - 24px),transparent)}` plus a count line `Showing 23 files` and `tabindex=0` with `aria-label="Output files"` so keyboard users can scroll. Add per-file download (icon button, 36px, `aria-label="Download <name>"`) so a user who needs part 4 does not unzip 23 files.

### S3. Split part names do not carry the bookmark title
- Screen: split by bookmarks, 911 report. Evidence: `G1/split-result-1440-light.png`: `911-commission-report_1-4.pdf` with the real title only in a grey note ("Before the first bookmark", "CONTENTS").
- Fix: default name `911-commission-report_01_Contents.pdf` (zero-padded index, sanitised title, 60 chars max). Anything on disk sorts correctly and reads without opening. Keep page range in the note.

### S4. Sort control shows "Choose"
- Screen: file grid toolbar, all tools. Evidence: `FileGrid.jsx` 264 (`<option value="">Choose</option>`), every grid screenshot.
- Fix: label `Sort by` with first option `Order added`, then `Name`, `Size`, `Date`. Pair `Select none` / `Select all` as one toggle link. Move `Remove all` away from selection controls (it sits beside `Select none`; the confirm dialog helps, but the adjacency invites a mis-tap): put it in a `...` menu or at the far end with 16px gap on phone.

### S5. Word to PDF default silently costs 55 MB
- Screen: Word to PDF options. Evidence: `G4/word2pdf-options-1440-dark.png` ("High fidelity ... downloads the Office engine (about 55 MB, cached after)").
- Problems: default is the expensive choice; on a phone or metered line that is a surprise. "Quick" is offered as an equal option but makes text into pictures, a bad result for a docx.
- Fix: keep High fidelity default but put the size in the Run bar line (`First run downloads 55 MB, then works offline. Needs about 20 seconds on broadband.`), show a determinate progress for the download with Cancel, and rename Quick to `Quick (text becomes images)`. If `navigator.connection.saveData` or type is cellular, preselect nothing and ask.

### S6. HEIC and TIFF cards show a grey "HEIC" placeholder, not the photo
- Screen: Images to PDF. Evidence: `G4/img2pdf-options-390-light.png` (JPG shows a real thumbnail; HEIC and TIFF show a blank tile with a label; viewer and rotate disabled).
- Problem: the user cannot check orientation or order for the very format (iPhone HEIC) that needs it; iLovePDF shows a thumbnail. The converter already decodes HEIC for the output.
- Fix: decode a 240px thumbnail through the same worker and cache it; keep the label as a corner badge (`HEIC`), enable rotate, make `Open` show the decoded image.

### S7. File card actions, phone
- Screen: file grid. Evidence: `U2a/file-grid-390-light.png`: five 36px icon buttons in a row (eye, rotate, left, right, x); danger X next to move-right.
- 36px passes 2.5.8 (24px) but a 2-col phone grid leaves 8px gaps and the delete is easy to hit. No visible labels; icons only.
- Fix: on phone, move `Open` into tapping the thumbnail, keep Rotate, move earlier/later and Remove in a `...` menu (menu button 40px). On desktop keep the row.

### S8. Page editor, phone: eight icon-only buttons, tiles show blank pages **[confirm live]**
- Screen: Pages mode. Evidence: `U2a/page-editor-390-dark.png` (toolbar of 8 unlabeled icons plus "Apply changes"; pages 6+ render as white boxes with a number only).
- Fix: label the three common actions (`Rotate`, `Delete`, `Undo`) with text at 390px; put the rest in a `More` menu. If the blank tiles are only a full-page screenshot artifact, ignore that half; if real, render visible tiles first and show the skeleton state from DESIGN.md.

### S9. Run bar covers the focused field (WCAG 2.4.11 Focus Not Obscured) **[confirm live]**
- Screen: any tool on phone after M1; also desktop sticky top bar. Evidence: `shell.css` 1691-1696 (sticky bar, no `scroll-padding`).
- Fix: `html{scroll-padding-top:calc(var(--bar-h) + var(--s-3));scroll-padding-bottom:calc(var(--run-bar-h) + var(--s-3))}`.

### S10. Mode tabs use `role="tablist"` without tab behaviour
- Screen: Files / Viewer / Pages. Evidence: `Shell.jsx` 370-391 (role=tab, no arrow-key movement, no `aria-controls`, no `tabpanel`, each tab is its own Tab stop).
- Fix: either implement the tab pattern (roving `tabindex`, Left/Right/Home/End, `aria-controls`, `role="tabpanel"` on the workbench) or switch to a `radiogroup`-style `Segmented` like in `controls.jsx` with `aria-pressed` buttons. Fewer moving parts: use buttons with `aria-pressed`.

### S11. Redact: matches are only outlines on the page
- Screen: Redact. Evidence: `G3/redact-1440-light.png` (`9 matches in this file`, outline on page, no list; one box drawn by hand; options say "1 box, 0 whole pages").
- Gap vs iLovePDF (research row Redact): a "Marked for redaction" list with Clear all. For a legal/financial task (name on an IRS form) the user needs to see each match, jump to it and untick false positives (for example "Smith" inside "Blacksmith").
- Fix: a list under "Find text": `<n> matches` with per-match checkbox + page jump + 40 chars of context; default all checked. Run line: `Will remove 9 matches and 1 box. Original text is deleted, not covered.` Add a final confirm line in the result: `Check the result before you share it.` (iLovePDF behaviour 12).

### S12. Option card radios crowd the label
- Screen: Images to PDF, Page size cards at 390. Evidence: `G4/img2pdf-options-390-light.png` ("Fit image" touches the radio circle).
- Fix: `.option-card{padding-right:calc(var(--s-4) + 28px)}` or stack the radio top-right with 8px offset; at 390 use a 3-up grid with `min-width:0` and 14px labels.

### S13. Colour field label floats away from its control
- Screen: Watermark options. Evidence: `U2a/options-1440-dark.png`, `options-390-light.png` ("Colour" label sits at the right edge, level with the previous row, "Size 48 pt" on the left row).
- Fix: put Size and Colour in one `Field` row each: label above, control below, same grid (`grid-template-columns:1fr auto; align-items:end`). Colour swatch needs a visible name or `aria-label="Text colour"`; saturated red swatch is the default and looks like an error colour in the iris UI, use ink grey at 25% opacity as the default stamp.

## 3. Nice-to-have
- N1. Password prompt per file: add `Same password for all files` (iLovePDF behaviour 9).
- N2. Result: rename field above Download (`Name` text field, default `<name>_compressed`), a one-line trust note `Nothing was uploaded.`, and a quiet "Saved to Downloads" status (`role="status"`) after download starts.
- N3. Single-output result repeats the file in the summary line and the list; show only the list.
- N4. `io` text: `PDF -> many PDF` should be `PDF to PDFs` in reading order (screen readers read the arrow glyph); keep the mono look.
- N5. File card notice `Restrictions removed s...` truncated (`G1/split-bookmarks-1440-light.png`): wrap to two lines, use `--ok-text`, not mono.
- N6. Search box shows focus by border colour + `box-shadow` only (`shell.css` 76-79, `outline:none` at 86). In Windows forced-colors mode the shadow vanishes; add `outline:2px solid transparent` on `.bar-search:focus-within`.
- N7. Brand `font-size:0` on phone (`shell.css` 1662): text still reads to screen readers, but a zoomed or reduced-style user sees only the mark; use `.sr-only` text instead.
- N8. Speed-to-value vs iLovePDF: they show one tool per page with one big button (3 steps: select, option, run). SwissPDF home asks "Add PDFs" then "pick a tool", 4 steps, but wins on chaining and no upload wait. After adding files on home, promote 3 suggested tools by file type (`2 PDFs: Merge, Compress, Organize`) above the directory.

## 4. What works (keep)
- Result screen: real first-page preview, mono figures, Download / Undo / Back, then `Continue with another tool`. Better than iLovePDF's download redirect.
- Live line + verb Run label ("Split into 23 PDFs", "Merge 2 PDFs") matches the iLovePDF "N PDFs will be created" pattern and is clearer than "Submit".
- Disabled Run states the reason ("Select at least 1 file (.docx ...)").
- Move earlier/later buttons give the 2.5.7 drag alternative.
- Remove-all dialog copy is plain and honest: "Every file and every earlier version is deleted from this browser. This cannot be undone."
- Focus indicators exist (`:focus-visible` 2px, offset) on inputs and tool rows; `prefers-reduced-motion` block present (fades only, press scale removed). Not tested live.

## 5. Accessibility table (WCAG 2.2 AA, partly static)
| Criterion | Status | Note |
|---|---|---|
| 1.4.3 text contrast | Fail (M4) | `--err` on paper 4.18. Others computed from DESIGN.md pass |
| 1.4.11 non-text | Pass (static) | `--edge` 3.17 / 3.58 per DESIGN.md |
| 1.4.4 / 1.4.10 reflow | Not tested live | 320px claim in DESIGN.md; confirm |
| 2.1.1 keyboard | Not tested live; tablist pattern incomplete (S10) | |
| 2.4.11 focus not obscured | At risk (S9) | sticky bars, no scroll-padding |
| 2.5.7 dragging | Pass | move buttons exist |
| 2.5.8 target size | Pass on 36px icon buttons; 11px text and tight rows on phone (S7) | |
| 3.3.7 redundant entry | Fail for legacy tools (M2) | |
| 3.3.8 accessible authentication | Not applicable to the shell; check Protect/Unlock paste in password fields | |
| 4.1.3 status messages | Pass (live line `aria-live`, run error `role=alert`) | result summary has no role; focus moves to the heading, acceptable |

## 6. Copy review summary (step 10)
Plain and short overall. Fix: "Choose" (S4), "Quick" mode label (S5), `Start over with new files` (opens a delete dialog: rename `Remove all files and start over`), `io` strings (N4), legacy note (M2). No em dashes, no jargon found in the strings read.

## 7. Open questions
1. Is G2 (protect, unlock, ocr, repair, compare in shell) landing before U2 sign-off? M2 depends on it.
2. Accept the phone Options-as-sheet change (M1), or keep a single scrolling column with a sticky bar only?
3. Is the Office engine download allowed to be a default on first run (S5)?
