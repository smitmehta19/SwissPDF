# Blind review: SwissPDF (2026-10-27)

Tester: new user, no prior knowledge, no source code or docs read. Judged only on what the site shows.
Site: http://localhost:4180/SwissPDF/ (Playwright Chromium, 1440x900 and 390x844).
Files: blind-files set (6 PDFs incl. scan, W-9 form, locked PDF; JPG, PNG, HEIC, DOCX, XLSX, PPTX) plus a truncated PDF and a fake .pdf made by me.
Screenshots: `.playwright-mcp/blind/` (paths below are relative to that folder). Session length about 35 minutes of testing.

## Summary

- Counts: **P0: 1, P1: 7, P2: 27**
- All 55 tools were found and run at least once. 55 of 55 produced a result; outputs I checked with pypdf / PyMuPDF / python-docx were correct (merge page count, AES-256 protect, form values, redaction really removes text, DOCX tables, split ZIP, bookmarks).
- Speed is very good: most tools finish in 0.1 to 0.5 s. Slow ones: OCR 18 s for 2 pages, Word to PDF 11 s on first run (engine start), Compress Maximum 6 s, Split 3 to 4 s, Compare 4 s.
- Network: across both page loads, no POST/PUT and no request to any non-localhost host was visible to the page-level capture. The Office engine comes from cdn.zetaoffice.net via a worker, which this capture cannot see (see privacy section).
- Verdict: feature-complete and fast, outputs are trustworthy. The weak spots are the workspace model (tools silently replace inputs, derived files pile up, decrypted copies persist), a few broken layouts (Health check, phone Pages view) and many small wording/clarity issues.

## First impressions

SwissPDF is an in-browser PDF toolkit ("Local only", "Runs on this device. Nothing is uploaded." under every Run button). Layout is a three-pane workbench: tool list on the left (55 tools in Organize / Convert / Optimize / Edit / Security / System, plus Recent and Popular), a file workspace in the middle (Files / Viewer / Pages tabs), and a step panel on the right (1 Files, 2 Options, 3 Run). Every run ends on a "X done" screen with size/pages/time, Download, Undo, Back to files and 4 suggested next tools, which makes chaining easy. Looks clean and modern, light and dark themes. It felt like a serious iLovePDF/Stirling alternative within 1 minute. The thing I did not understand at first: the workspace keeps files between visits and each tool overwrites the selected file with a new version.

## Problems, ranked

### P0 (broken / data loss / privacy)

1. **Unlocked copy of a password-protected PDF is kept in browser storage indefinitely, under the original name.**
   - Tool: card inline Unlock (and Unlock tool). Files: user-pw-TAMReview.pdf.
   - Steps: add the locked PDF, type password on the card, Unlock. Reload the page.
   - What happened: after reload the card still reads "user-pw-TAMReview.pdf, 23 pages ... Password removed so the file can be edited", full thumbnail, no password asked. Direct check of IndexedDB "swisspdf" / store "files": the record for user-pw-TAMReview.pdf holds a 665,973-byte blob starting "%PDF-1.3" with **no /Encrypt dictionary**, i.e. a fully decrypted copy is stored on disk. The password itself is not stored (no password field in the record). The record keeps the original file name. Total storage was 298 MB, `navigator.storage.persisted()` false.
   - The card does say "Password removed so the file can be edited". What is missing is any warning that this unprotected copy is kept on the device after the tab is closed, until "Remove all". The only place that says files are kept is behind the "Local only" badge.
   - Expected: keep unlocked files in memory only, or warn at unlock time ("an unprotected copy is saved in this browser until you remove it"), and mark the name (e.g. "-unlocked") so it is not shared as the original. An auto-clear option for shared computers would help.
   - Screens: 07-unlock-inline.png, 59-local-only.png.

### P1 (major)

1. **Tools silently replace the input files in the workspace.**
   - Tool: Merge (same pattern in Extract pages, Remove pages, Rotate, Compress and most others). Files: 6 PDFs.
   - Steps: select 6 PDFs, Merge 6 PDFs, Back to files.
   - What happened: only merged.pdf (badge "v2") is left; the 6 inputs are gone from the list. The card Undo dialog says "merged.pdf goes back to version 1. This version is deleted", which reads like it will turn the merge into one file; it actually restores all 6 inputs and drops the merge.
   - Expected: keep inputs and add the result (as iLovePDF/Stirling do), or say plainly before running "the 6 files will be replaced by merged.pdf (Undo brings them back)".
   - Screens: 08-merge-result.png, 09-after-merge-files.png, 10-after-undo.png, 11-after-undo-done.png.
2. **Health check results layout is broken.**
   - Tool: Health check. Steps: System > Health check > Run health check.
   - What happened: "All 49 checks passed", but the list is squeezed into a ~300 px column (item grid 20px / 224px / 8px) and each check's detail text wraps one character per line; the page grows to 46,655 px tall.
   - Expected: full-width list, detail text on one or two lines.
   - Screen: 44-health.png.
3. **Phone: Pages view scrolls sideways.**
   - Tool: any tool, Pages tab, at 390x844. Steps: open Split on phone, select a file, run, Back to files, tap Pages.
   - What happened: document width 618 px on a 390 px screen, horizontal scrollbar, file name headings run off screen.
   - Expected: page grid fits the screen width, names wrap or truncate.
   - Screen: 57-phone-pages.png.
4. **Forms is hard to use.**
   - Tool: Forms. File: irs-fw9.pdf.
   - Steps: Edit > Forms, select the W-9.
   - What happened: the tool stays on the Files tab with "Fill in a field or draw a new one on the page"; you must discover the Viewer tab yourself. There the page is drawn ~525 px wide inside a ~780 px area with no zoom control, so W-9 fields are tiny. Inputs are announced with internal names like "topmostSubform[0].Page1[0].f1_01[0]" (bad for screen readers). Saving itself works (3 values verified with pypdf, XFA removed with a note).
   - Expected: open the Viewer automatically, page fit to width with zoom, fields labelled with their tooltip/visible label.
   - Screens: 33-forms.png, 34-forms-viewer.png, 35-forms-filled.png.
5. **Edit cannot change existing text.**
   - Tool: Edit. File: aws-invoice.pdf.
   - Steps: Edit > Edit, select file, open Viewer, click on the page with the Text tool.
   - What happened: panel says "Existing text cannot be changed yet"; only overlays (text, shapes, highlight, white-out, image). Tool opens on Files, not Viewer. The delete (x) handle on a new text box overlaps the text.
   - Expected: click existing text to edit it (iLovePDF and Stirling both offer this), open in Viewer directly.
   - Screen: 42-edit-text.png.
6. **Office engine comes from a third-party CDN, unpinned.**
   - Tool: Word/Excel/PowerPoint to PDF (also HTML to PDF "Selectable text").
   - Steps: run Word to PDF, then inspect console and Cache Storage.
   - What happened: console logs "Loading WASM binaries for ZetaJS from: https://cdn.zetaoffice.net/zetaoffice_latest/"; Cache Storage "swisspdf-libreoffice-*" holds soffice.js / .wasm / .data from that host. No document data was seen leaving (no POST), but third-party code runs next to the documents, and "latest" means it can change without a site release. The UI says "Only the engine files are downloaded" without naming the outside domain.
   - Expected: self-host or pin a fixed engine version (with integrity check), and name the source in the copy.
   - Screen: none (console/cache evidence; see Network section).
7. **Workspace auto-selects everything after reload.**
   - Tool: Workspace, then Compress. Steps: reload the page, look at the grid, open Compress.
   - What happened: "25 of 25 selected" on the workspace; Compress immediately showed "Compress 19 PDFs" ready to click, which would overwrite 19 files with new versions in one click.
   - Expected: nothing selected after reload, or only the last result.
   - Screen: 59-local-only.png (shows "25 of 25 selected" behind the dialog).

### P2 (minor)

1. Count mismatches: "9 files, saved on this device" vs "8 of 8 selected"; "6 files" vs "5 of 5 selected"; "21 files" vs "0 of 19". Locked/broken files show a ticked-looking checkbox but are not counted. Screens: 01-home.png, 05-uploaded.png, 48-broken-files.png.
2. No-op runs still create a renamed new version: Auto rotate ("Every page was already upright" -> "-rotated.pdf"), Unlock forms ("file is unchanged" -> "-unlocked"), Remove annotations ("Nothing to remove" -> "-clean"), Compress Maximum ("kept the original" -> "-compressed").
3. Neutral outcomes shown as red failures: "Remove blank pages failed: No blank pages found." (26-removeblank.png), "OCR failed: Every page already has a text layer".
4. Remove annotations on the W-9: panel says "23 annotations in the selected files", default "All annotations", result "Nothing to remove". The 23 are form fields, only removed with an extra checkbox.
5. Result metric "X% smaller" shown where it makes no sense: Split "11% smaller", Compare "17% smaller", PDF info "97% smaller" (a JSON report), Show JavaScript "96% smaller".
6. File names grow without limit across a chain: "pdfjs-tracemonkey-compressed-protected-unlocked-watermarked-numbered.pdf".
7. On phone, split results are cut to "pdfjs-tracemonkey-compressed-pr..." so all 7 rows look identical (the "_1-2" suffix is hidden). 56-phone-split-result.png
8. Derived files (DOCX, XLSX, MD, ZIP, JPG, JS, JSON) pile up in the same grid as PDFs; after ~10 steps the grid had 18-27 cards. Brand-new files are badged "v2"/"v3".
9. PDF to PowerPoint output is named "poi-SampleShow.pptx", same as the uploaded original still in the workspace (two cards, same name).
10. Result screen says "The result stays in your files, selected and ready" but a converted DOCX is not selected.
11. Split range boxes show "1" and "15" as grey placeholders that look like values; Run stays disabled until you type them. 20-split.png
12. Extract pages has two page inputs (toolbar "Pages, e.g. 1,3,5-8" and panel "Pages to extract"); Organize has two Save buttons (toolbar Save and "Save 1 PDF"). 23-extract-typed.png, 60-pages-edit.png
13. Some tools switch to the right view automatically (Extract -> Pages, Sign -> Viewer), others do not (Forms, Edit, Redact). Redact gives no preview of matches before running.
14. Undo on the result screen runs immediately; Undo on a card asks for confirmation. Inconsistent.
15. Search misses everyday words: "shrink", "reduce size", "join", "delete page", "esign", "convert jpg" all return "No tool matches". 45-search.png
16. Booklet help text vs checkbox is confusing ("flip on the short edge... tick only if your printer can flip on the long edge alone" vs "My printer only flips on the long edge (turns the backs)").
17. OCR (fax scan, "Read every page"): 18.4 s for 2 pages, "404 words recognised". Text layer reads fine line by line in PyMuPDF, but some words are missing ("Congress of the States" without "United", "The Samuel W. Bodman" without "Honorable", gaps on page 2). Default mode answers in red "OCR failed: Every page already has a text layer" for a scan that has an old OCR layer; the fix (choose "Read every page") is named in the message. 31-ocr-running.png
18. Bookmarks "Find headings" turned 3 author lines of the paper into bookmarks.
19. PDF to Markdown turned the arXiv licence banner into two "##" headings split mid-sentence.
20. Sign: default signature is large and overlaps text above the signature line. 37-sign-placed.png
21. PDF info summary shows the "Fonts" label twice; says "23 fields" while pypdf counts 27 (parents vs widgets, unclear).
22. Phone empty state says "Pick a tool on the left, or press Ctrl+K" (no left pane, no keyboard). Phone tool screen shows no tool name until you open Options. Run bar text truncated ("7 PDFs will be cr..."). 51-phone-top.png, 53-phone-split.png
23. Phone Viewer: floating page/zoom bar covers the lower part of the page. 58-phone-viewer.png
24. Unknown route (#/extract-pages) silently shows the workspace, no "tool not found".
25. Accessibility: Watermark text input and form field inputs lack human labels; result heading "Merge done" gets a focus box that looks like an input; page tile actions are hover-only (could not click "Delete page 2" without hovering; toolbar works).
26. Visual polish: grid reflows 5 -> 4 columns when a tool opens; card remove (x) wraps to its own line; Popular tool card titles not aligned; inline password placeholder truncated to "Passworc"; favicon.ico 404 (requested at site root, outside /SwissPDF/).
27. Console noise at ERROR level: MuPDF "format error: cannot find object in xref" (up to ~190 errors after Automate/Sanitize/Show JS on the signed W-9), LibreOffice/Qt "QObject::connect ... invalid nullptr", tesseract "Invalid resolution 0 dpi". Nothing user-visible broke.

## Tools tried

Clarity: 5 = obvious without help, 1 = could not figure out. Time = click on Run to result screen, measured in page with performance.now() (0.1 s resolution).

| Tool | File(s) | Worked | Clarity | Time | Notes |
|---|---|---|---|---|---|
| Merge | 6 PDFs, 61 pages | Yes | 4 | 1.97 s | Output 61 pages verified. Inputs removed from workspace (P1). |
| Split (ranges) | arxiv 15 pp | Yes | 3 | 4.3 s | Placeholder-looking values; ZIP ok. |
| Split (fixed N, phone) | tracemonkey 14 pp | Yes | 4 | 0.7 s | 7 files, names cut on phone. |
| Split (bookmarks) | arxiv 6-15 | Yes | 4 | 3.0 s | 4 files named by section. |
| Extract pages | tracemonkey | Yes | 3 | 0.3 s | Two page inputs. |
| Remove pages | irs-fw9 | Yes | 4 | 0.35 s | 27 form fields kept. |
| Organize (Reverse; delete page in Pages view) | irs-fw9 | Yes | 4 | 0.2 s / 0.47 s | "2 was 3" labels are nice; two Save buttons. |
| Rotate | aws-invoice | Yes | 5 | 0.15 s | |
| Auto rotate | fax scan | Yes | 4 | 2.15 s | No-op still new version. |
| N-up | tracemonkey | Yes | 5 | 0.23 s | |
| Booklet | tracemonkey | Yes | 3 | 0.3 s | Confusing duplex wording. |
| Page size | aws | Yes | 5 | 0.1 s | |
| Single large page | irs-fw9 | Yes | 5 | 0.36 s | |
| Remove blank pages | tracemonkey; aws + inserted blank | Yes | 4 | 0.2 s / 0.6 s | "failed" wording when none found; removed the blank correctly. |
| Bookmarks | tracemonkey | Yes | 4 | 0.2 s (+3 s find) | 17 bookmarks, author lines included. |
| Attachments | aws + xlsx | Yes | 4 | 0.1 s | |
| Auto rename | aws | Yes | 5 | 0.15 s | Preview of new name, nice. |
| Images to PDF | JPG + PNG + HEIC | Yes | 5 | 1.1 s | HEIC converted. |
| PDF to images | aws | Yes | 5 | 0.2 s | |
| Word to PDF | poi-sample.docx; aws-invoice.docx (Quick) | Yes | 4 | 11.2 s first run; Quick 5.1 s after a reload | First run includes engine start. |
| Excel to PDF | poi-Tables.xlsx | Yes | 4 | 1.7 s | 15 pages. |
| PowerPoint to PDF | poi-SampleShow.pptx | Yes | 5 | 1.2 s | |
| PDF to Word | aws | Yes | 5 | 0.35 s | 3 tables + image, text correct. |
| PDF to Excel | aws | Yes | 5 | 0.2 s | 3 tables, 73 cells. |
| PDF to PowerPoint | poi-SampleShow.pdf | Yes | 4 | 0.3 s | Same name as original pptx. |
| PDF to Markdown | arxiv 1-5 | Yes | 4 | 0.4 s | Banner turned into headings. |
| HTML to PDF | built-in example | Yes | 4 | 0.67 s | No HTML test file; used example. |
| Extract images | arxiv 1-5 | Yes | 5 | 0.3 s | ZIP, 3 images. |
| Compress (Smart) | tracemonkey | Yes | 5 | 1.0 s | -17%. |
| Compress (Maximum) | 2 arxiv parts | Yes | 4 | 6.2 s | Kept originals, still new versions. |
| Repair | aws | Yes | 4 | 0.1 s | Cannot target unreadable files. |
| OCR | fax scan | Yes | 3 | 18.4 s | Default mode says "failed" (old text layer); some words missed. |
| Automate | aws + fw9, "Clean copy to share" | Yes | 4 | 0.9 s | Per-step report. |
| Compare | arxiv 1-5 vs 6-15 | Yes | 5 | 4.1 s | Side by side, overlay, change list. Best tool. |
| Fast web view | irs-fw9 | Yes | 5 | 0.46 s | |
| Remove images | aws | Yes | 5 | 0.26 s | |
| PDF info | irs-fw9 | Yes | 4 | 0.3 s | Good summary; "Fonts" twice. |
| Edit | aws | Partly | 3 | 0.25 s | Overlay text only, no real text edit. |
| Forms | irs-fw9 | Yes | 2 | 0.4 s | Hidden in Viewer tab, tiny fields. |
| Watermark | tracemonkey | Yes | 5 | 0.5 s | |
| Page numbers | tracemonkey | Yes | 5 | 0.36 s | |
| Crop | aws (top 10%) | Yes | 4 | 0.3 s | |
| Overlay PDFs | aws + poi-sample.pdf | Yes | 4 | 0.3 s | |
| Stamp | aws | Yes | 5 | 0.24 s | |
| Adjust colours | aws (saturation 0) | Yes | 4 | 0.3 s | |
| Replace colours | aws (high contrast) | Yes | 5 | 0.4 s | |
| Metadata | aws (title) | Yes | 5 | 0.1 s | |
| Remove annotations | irs-fw9 | No-op | 2 | 0.15 s | Says 23 annotations, then "nothing to remove". |
| Flatten | irs-fw9 | Yes | 5 | 0.4 s | 23 fields flattened. |
| Redact | aws (2 phrases) | Yes | 4 | 0.36 s | Text truly removed (verified). No match preview. |
| Sign | filled W-9 | Yes | 4 | 0.5 s | Typed signature, click to place. |
| Protect | tracemonkey | Yes | 5 | 0.99 s | AES-256 verified. |
| Unlock | protected file; locked TAMReview inline | Yes | 5 | 0.3 s | Wrong password message clear. |
| Unlock forms | irs-fw9 | No-op | 4 | 0.46 s | New version though unchanged. |
| Sanitize | signed W-9 | Yes | 5 | 0.4 s | Removed 6 scripts. |
| Change permissions | aws | Yes | 4 | 0.4 s | Honest advisory note. |
| Show JavaScript | irs-fw9 | Yes | 5 | 0.2 s | 3 scripts listed. |
| Health check | none | Yes | 3 | not measured (< 4.5 min) | 49/49 passed, broken layout. |

Chains tried: Compress -> Protect -> Unlock (via result chips); Forms -> Sign; Watermark -> Page numbers; Organize (insert blank) -> Remove blank pages; Split -> Extract/Compare on the split parts.

Other UI: sidebar search, Ctrl+K palette (tools, files, theme), dark theme, reload persistence (27 files kept, page load 0.34 s), broken-file handling (clear "Can't open this PDF. The file looks damaged or incomplete." + Details).

## Network / privacy check

- Two page loads were captured with `browser_network_requests` (static included):
  - Load 1 (start to the reload, about 50 of 55 tools): 258 requests, all GET; 127 to `http://localhost:4180`, the rest `blob:`/`data:`. Saved as `network-all.txt`.
  - Load 2 (after reload: Organize, Split by bookmarks, Word to PDF Quick, Remove blank pages): 59 requests, all GET; 29 to `http://localhost:4180`, 30 `blob:`. Saved as `network-after-reload.txt`.
  - **No POST/PUT/PATCH and no request to any other host was visible in either load.**
- Resource timing in the page and in the LibreOffice iframe: no non-localhost entries.
- Limitation: requests made by web workers and the service worker are not visible to this page-level capture. The console logged "Loading WASM binaries for ZetaJS from: https://cdn.zetaoffice.net/zetaoffice_latest/" during this session, and Cache Storage `swisspdf-libreoffice-*` holds `soffice.{js,wasm,data,data.js.metadata}` from that host. I cannot tell whether those came from cache or the network this time. It is engine code, not document data, but it is an outside domain and an unpinned "latest" build (P1-6). A clean-profile run with a proxy or HAR at context level would settle what a worker sends.
- OCR language data, fonts, MuPDF, pdf.js and tesseract all came from the same origin.
- Documents are stored in IndexedDB ("swisspdf", store "files", 47 records for 27 visible files, so earlier versions are kept too) until "Remove all". The unlocked TAMReview blob has no /Encrypt (decrypted copy on disk); the password is not stored (P0-1). Storage reached 298 MB in this session with no warning.
- The "Local only" badge opens a clear explanation. "Runs on this device. Nothing is uploaded." under every Run button matched what I observed.

## Phone (390x844) vs desktop (1440x900)

- Desktop: three-pane layout works well, panels readable, result screens clean. Issues: grid reflow when a tool opens, Forms/Edit viewer has no zoom, Health check layout broken.
- Phone: hamburger "Tools" drawer, 2-column file grid, sticky bottom bar with "Options" (bottom sheet) and the Run button. Split end to end worked on phone (0.7 s).
- Phone problems: Pages view horizontal scroll (P1); tool name not shown until Options is opened; copy refers to "the left" and Ctrl+K; card action icons wrap to 2 rows; long file names cut so split parts look identical; run-bar text truncated; viewer control bar covers part of the page.
- Phone viewer itself is good: zoom slider, Fit width, search, Reader mode.

## Not tried

- Every one of the 55 tools was run at least once. Not tried in depth:
- Drag and drop of files and drag-reorder of cards/pages (could only click/tap in this setup).
- Automate: creating and saving a custom automation (only the built-in "Clean copy to share").
- Watermark/Stamp image mode, Sign draw/upload mode, Split by size, Images to PDF options (margins, one PDF per image), Compare overlay mode, OCR with non-English languages.
- A first-ever visit with an empty browser cache (the Office engine was already cached, so first-download time and size were not measured).
- Keyboard-only walkthrough and screen-reader pass.
- Very large files (100+ MB) and memory limits.

## Appendix: running notes (raw, in test order)

- Start: browser profile already had 9 files from earlier sessions (incl. "truncated-report.pdf", "notes.txt"). Header said "9 files, saved on this device" but grid said "8 of 8 selected". Used "Remove all" (good confirm dialog) to get a clean first-run view. 01-home.png, 02-home-later.png, 03-remove-all.png, 04-empty.png
- Thumbnails first render as grey "PDF" placeholders, fill in ~1 s later.
- Upload 6 PDFs via "Choose PDF files": fine. Locked PDF shows "Password needed to open this file" with inline password box + Unlock. 05-uploaded.png, 06-merge.png
- Inline unlock: instant, shows "Password removed so th..." (truncated). 07-unlock-inline.png
- Merge 6 files: 1.97 s, downloaded merged.pdf = 61 pages. 08-merge-result.png. Inputs gone afterwards, undo restores all 6. 09, 10, 11.
- Compress Smart: 1.0 s, -17%. 12-compress.png, 13-compress-result.png
- Protect: 0.99 s, AES-256 V5 R6 verified, wrong password rejected. 14-protect.png, 15-protect-result.png
- Unlock wrong password: clear inline error. 16-unlock.png, 17-unlock-typed.png, 18-unlock-wrong.png. Right password 0.3 s. 19-unlock-result.png
- Split ranges: 4.3 s, ZIP ok. 20-split.png, 21-split-result.png
- Extract pages: 0.3 s. 22-extract.png, 23-extract-typed.png
- Rotate 0.15 s (24-rotate-result.png). Booklet 0.3 s (25-booklet-result.png). Remove blank "failed" wording (26-removeblank.png).
- PDF to Word 0.35 s (27-pdf2word-result.png). Mixed files added (28-added-mixed.png). Images to PDF render (29-img2pdf.png). PPT to PDF (30-ppt2pdf-result.png). OCR (31-ocr-running.png). Compare (32-compare-result.png).
- Forms (33-forms.png, 34-forms-viewer.png, 35-forms-filled.png). Sign (36-sign.png, 37-sign-placed.png). Redact (38-redact.png, 39-redact-output.png).
- Watermark + numbers (40-watermark-numbers-viewer.png). Adjust colours (41-adjustcolors.png). Edit (42-edit-text.png). HTML to PDF (43-html2pdf.png). Health (44-health.png).
- Search (45-search.png), palette (46-palette.png), dark (47-dark.png), broken files (48-broken-files.png).
- Phone: 50-phone-home.png, 51-phone-top.png, 52-phone-menu.png, 53-phone-split.png, 54-phone-split-options.png, 55-phone-split-fixed.png, 56-phone-split-result.png, 57-phone-pages.png, 58-phone-viewer.png
- Local only dialog (59-local-only.png), Pages view edit (60-pages-edit.png).
- Network dump: network-all.txt.

## Re-check after fixes (2026-10-27, fresh build)

Same rules: judged only from the site. Started from a cleared workspace, desktop 1440x900 and phone 390x844. Screenshots `.playwright-mcp/blind/recheck-*.png`. Network for this run: 128 requests, all GET (86 to localhost:4180, 42 blob:), no POST, no other host visible (`recheck-network.txt`; worker traffic still not visible to this capture).

| Item | Status | Evidence |
|---|---|---|
| P0 decrypted copy kept after unlock | **Fixed** | Inline unlock still works; card now says "Unlocked for this session only. After a reload it asks for the password again". IndexedDB record for user-pw-TAMReview.pdf holds the original 673,715-byte file **with /Encrypt**, status "locked". After reload the card asks for the password again. A result made from the unlocked file (Compress -> user-pw-TAMReview-compressed.pdf) was **not** written to IndexedDB either and was gone after reload. recheck-02-unlocked.png, recheck-03-after-reload.png, recheck-04-compress-locked-derivative.png |
| P1 tools replace inputs | **Partly fixed** | Behaviour unchanged (Merge 3 files leaves only merged.pdf), but the result screen now says "Replaced 3 files with merged.pdf. Undo brings them back." Same line on Compress, Split, Word to PDF. Before running, the panel still only says "1 PDF will be created from 3 files", no warning that inputs will be replaced. Acceptable now that it is stated and undoable; I would rate the rest P2. recheck-05-merge-result.png |
| P1 Undo wording | **Fixed** | Card Undo dialog: "Undo deletes merged.pdf and brings back pdfjs-tracemonkey.pdf, aws-invoice.pdf, irs-fw9.pdf." Undo restored all 3. recheck-06-undo-dialog.png |
| P1 selection after reload | **Fixed** | After reload: "0 of 25 selected" (and "0 of 3 selected" in the clean run); tools open with nothing pre-selected. recheck-01-load.png, recheck-03-after-reload.png |
| P1 Health check layout | **Fixed** | 49/49 passed in 18.4 s; list is full width (rows 914 px, name and detail columns), page 2,618 px tall instead of 46,655 px. recheck-07-health.png |
| P1 phone Pages sideways scroll | **Fixed** | 390x844, Pages view with 1 file and with 3 files incl. a long name ("pdfjs-tracemonkey-watermarked-numbered-compressed.pdf"): document width 375 px, no element past the right edge, name truncated with ellipsis, 3-column page grid. recheck-12-phone-pages.png, recheck-13-phone-pages-long-names.png |
| P1 Forms: opens where | **Fixed** | Opening Forms from the sidebar with the W-9 selected lands on the Viewer tab. Edit and Redact also open on Viewer now. recheck-09-forms-desktop.png |
| P1 Forms: zoom and field size | **Fixed (desktop), OK (phone)** | Desktop: page 739 px wide at 91 %, zoom out / slider / zoom in / Fit width bar; text fields 625x17 px. Phone: Fit width = 40 %, fields only ~7 px tall and checkboxes ~2 px, but Zoom in works (80 %: fields 552x15, page pans inside the viewer, no page-level sideways scroll). recheck-10-forms-phone.png, recheck-11-forms-phone-zoomed.png |
| P1 Forms: field labels | **Partly** | Fields are now announced by their short name ("f1_01", "c1_1") instead of "topmostSubform[0].Page1[0].f1_01[0]". The W-9 has no tooltips (/TU) in the file, so nothing better is available from field data; using the printed label next to the field would be the next step. Several checkboxes share the same label "c1_1". Rate P2. |
| P1 Office engine wording | **Partly fixed** | The "Local only" dialog now says the engine "is downloaded once from cdn.zetaoffice.net. It is checked against a fixed fingerprint before it runs, and no document data is sent." The Word/Excel/PowerPoint/HTML tool panels still say only "Only the engine files are downloaded" without the domain. Cache keys still use the `zetaoffice_latest` path; I cannot verify the fingerprint check from the page. Word to PDF still works (11.5 s first run). recheck-08-local-only.png |
| P1 Edit cannot change existing text | **Unchanged (by design)** | Panel still says "Existing text cannot be changed yet...". Now opens on the Viewer. |
| P2 red "failed" for neutral results | **Fixed** | Remove blank pages: "Nothing to do: No blank pages found." OCR default on the fax: "Nothing to do: Every page already has a text layer. Choose "Read every page" to OCR them anyway." Both green status notices (class notice-ok, role=status). recheck-14-removeblank-neutral.png |
| P2 "% smaller" where meaningless | **Mostly fixed** | PDF info: size only (4.0 KB), no %. Split: size only (97.8 KB), no %. Merge still shows "1.25 MB to 1.11 MB, 11% smaller" (debatable; merge does write a new file). |

### New findings from the re-check

- P2: work done on an unlocked file vanishes on reload without a warning. The Compress result screen for user-pw-TAMReview-compressed.pdf says "The result is in your files" but does not say it is session-only; after reload only the locked original is left. Privacy-correct, but a user can lose edits. A line like "Session only: download it before you close the tab" would fix it. recheck-04-compress-locked-derivative.png
- P2: conversions are inconsistent. Word to PDF now replaces the DOCX ("Replaced poi-sample.docx with poi-sample.pdf"), while PDF to Word keeps the PDF ("The PDF stays as it is").
- Nothing that the fixes broke: Merge, Compress, Split, Watermark, Page numbers, Organize, PDF info, PDF to Word, Word to PDF, OCR, Remove blank pages, Health check (49/49) all ran normally.

### Re-check verdict

No P0 left. The only P1 still open is "Edit cannot change existing text", which is unchanged on purpose (a known gap against competitors). The 3 "partly" items are now P2 level: no warning before a run that inputs will be replaced, form field labels, and Office engine wording in the tool panels. The two new findings are P2.
