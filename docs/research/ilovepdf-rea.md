# iLovePDF: competitive UX / feature teardown

Date: 2026-10-17. Target: https://www.ilovepdf.com (release `14e1616`). Read-only: no account, no uploads, no API calls.

Tags: **[confirmed]** = seen in captured evidence (REA capture, served HTML/CSS/JS). **[inferred]** = reasoned, not directly observed.

Evidence used:
- REA `capture_browser_scenario` homepage (network + a11y + screenshot): `ev_fea9b5e2...cca34`
- REA `analyze_web_bundle` on /merge_pdf (16 scripts, chunk graph, endpoint candidates): `ev_f7d42d01...3a53`
- REA `capture_web_screenshot` /merge_pdf desktop 1348x804: `ev_d7303a99...c4e8`
- REA `capture_browser_scenario` /split_pdf mobile 390x844: `ev_e6dfce29...27b8`
- Supplement: plain GET of 32 public tool pages, `app.css`, `app.js`, per-tool React bundles; WebFetch of /help/security and /pricing.

Gap: download/result page and live upload/processing screens not observed (they need a real upload, out of scope). Anything about them is from bundle code/CSS, tagged accordingly.

---

## 1. Tool inventory and categories

### Homepage filter chips (exact order) [confirmed]
`All | Workflows | Organize PDF | Optimize PDF | Convert PDF | Edit PDF | PDF Security | PDF Intelligence`

### Homepage cards: 31 tools, grouped by `data-category` [confirmed]

| Category | Tools (card order) |
|---|---|
| organize | Merge PDF, Split PDF, Organize PDF, Scan to PDF |
| optimize | Compress PDF, Repair PDF, OCR PDF |
| convert | PDF to Word, PDF to PowerPoint, PDF to Excel, Word to PDF, PowerPoint to PDF, Excel to PDF, PDF to JPG, JPG to PDF, HTML to PDF, PDF to PDF/A |
| edit | Edit PDF, Watermark, Rotate PDF, Page numbers, Crop PDF, PDF Forms ("New!") |
| security | Sign PDF, Unlock PDF, Protect PDF, Compare PDF, Redact PDF |
| intelligence | AI Summarizer, Translate PDF, PDF to Markdown (all "New!") |
| workflows | "Create a workflow" card (to /user/workflows) |

Card order on page is popularity-based, not grouped (Merge, Split, Compress, PDF to Word...). [confirmed]

### "All PDF tools" mega-menu (different grouping) [confirmed]

| Column | Items |
|---|---|
| Organize PDF | Merge, Split, Remove pages, Extract pages (`/split_pdf#split,extract`), Organize, Scan to PDF |
| Optimize PDF | Compress, Repair, OCR |
| Convert to PDF | JPG, WORD, POWERPOINT, EXCEL, HTML to PDF |
| Convert from PDF | PDF to JPG, WORD, POWERPOINT, EXCEL, PDF/A |
| Edit PDF | Rotate, Add page numbers, Add watermark, Crop, Edit, PDF Forms |
| PDF security | Unlock, Protect, Sign, Redact, Compare |
| PDF Intelligence | AI Summarizer, Translate PDF, PDF to Markdown |

Top nav: Merge PDF, Split PDF, Compress PDF, Convert PDF (dropdown), All PDF tools (dropdown), Login, Sign up, 9-dot app grid (iLoveIMG, iLoveSign, iLoveAPI, Integrations). [confirmed]

Note: "Remove pages" and "Extract pages" are not separate engines; Remove = split tool with `split_mode=remove_pages`, Extract = split tool deep-linked to a tab via URL hash. [confirmed]

---

## 2. Per-tool options and defaults

Universal flow per tool page [confirmed from HTML + CSS; post-upload states inferred from code]:
1. Hero: H1 + subtitle, big red "Select PDF file(s)" button + round Google Drive / Dropbox buttons, "or drop PDF(s) here". Whole page is a drop target.
2. After pick: work area (grey `#f5f5fa`) shows file cards or page thumbnails; right sidebar (440px, 380px on narrower) shows option panel with title, options, and a sticky process button at bottom (`#processTask`, label = tool name, arrow icon). [confirmed: markup in app.js template + CSS]
3. Process: sidebar/workarea hidden (`body.process-run`), upload status ("Uploading file X of Y", "Time left", "Upload speed MB/S"), then "<Verb>ing PDF..." screen. [confirmed strings]
4. "The task has been completed! Going to download page..." then redirect to `/download/...`. [confirmed string; page itself inferred]

Defaults below come from `ilovepdfConfig.defaultOptions` (API defaults) and `option--active` classes (UI defaults). Where they differ it is noted.

| Tool | Options shown (name: choices) | Defaults |
|---|---|---|
| Merge | No options panel. Hint: drag to reorder. "Order by name" toggle (asc/desc) appears with 2+ files. Add-more button. | output `ilovepdf_merged` [confirmed] |
| Split | Tabs: **Range** / **Pages** / **Size** (Premium). Range mode: Custom (add range rows "from page X to Y", "Add Range") / Fixed ("Split into page ranges of N") / Smart (AI: document category select, split preset select, custom prompt). Checkbox "Merge all ranges in one PDF file". Pages tab: "Extract all pages" / "Select pages" + text field `1,5-8` + "Merge extracted pages into one PDF file". Size tab: max size per file (number + KB/MB toggle), "Allow compression" (on), shows original size and page count. | Range tab, Custom; fixed_range input 2 (API default 1); merge off [confirmed] |
| Remove pages | Click thumbnails to mark; Shift for ranges; field "Pages to remove" `1,5-8`; shows total pages. | split_mode remove_pages, merge_after true [confirmed] |
| Compress | Compression level cards: Extreme (Less quality, high compression) / Recommended (Good quality, good compression) / Less compression (High quality, less compression) | recommended; output `{filename}_compressed` [confirmed] |
| Organize | Page grid of all files; "Reset all"; files list; order by file / by page (asc/desc), mixed mode; per page: rotate, delete, "Add a blank page" (+ between pages); "Add more files". | output `{filename}` [confirmed in code strings] |
| Rotate | Hover a file, click arrows. Sidebar: "Select files to rotate: All / Portrait / Landscape", Rotation buttons Right / Left, "Reset all". | All [confirmed] |
| PDF to Word | No OCR / OCR (Premium). Auto-detects scanned pages and warns "OCR is needed". OCR language list (22 langs). Hidden `convert_to=docx`. | ocr 0 [confirmed] |
| PDF to PowerPoint / Excel | Same pattern as PDF to Word (pptx / xlsx). | ocr 0 [confirmed for pptx; excel inferred] |
| Word / PPT / Excel to PDF | No options. | - [confirmed] |
| PDF to JPG | Mode: Page to JPG / Extract images. Image quality: Normal (Recommended, 150 dpi) / High (300 dpi). Shows "N JPG will be created". | pages, 150 [confirmed] |
| JPG to PDF | Page orientation Portrait/Landscape; Page size Fit (same as image) / A4 / US Letter; Margin No margin(0) / Small(20) / Big(40); "Merge all images in one PDF file". | portrait, A4, 0, merge on [confirmed] |
| Watermark | Tabs: Place text / Place image (image file or "From url"). Text: text field, font (Arial, Impact, Arial Unicode MS, Verdana, Courier, Comic, Times New Roman, Lohit Marathi, Lohit Devanagari), bold/italic/underline [inferred], size slider 0-150 (UI 48), background colour (transparent), font colour, shadow colour, opacity 0-100. Position: 3x3 grid + "Mosaic" checkbox. Transparency select: No/75/50/25%. Rotation: 0/45/90/180/270. Pages from/to (forced all pages if multiple files). Layer: Over / Below content. | Text tab active in UI; API default mode image, bottom-center, rotation 0, layer above, transparency 100 [confirmed] |
| Page numbers | Page mode: Single page / Facing pages (+ "First page is cover page"). Position: 3x3 grid (UI shows 6 usable: top/bottom x left/center/right) [inferred from grid markup]. Margin: Small / Recommended / Big. First number (1). Pages from/to; multi-file: "All pages from the beginning / Start at page 1 / Exclude first 1-5" and "All pages to the end / Exclude last 1-5". Text: `{n}` (recommended) / `Page {n}` / `Page {n} of {p}` / Custom (tokens `{n}` `{p}` `{r}` `{rf}`). Font family, size, colours, opacity same as watermark. | API: top-center, `{n}`, size 14, Arial Unicode MS, #000000; UI marks bottom position active [confirmed both, conflict noted] |
| Crop | Drag a box to keep; Pages: All pages / Current page; "Reset all"; warning "review the result before sending private info". | all-pages [confirmed] |
| OCR | Document languages multi-select, ~120 Tesseract codes (eng, deu, chi_sim, equ "Math / Equation detection"...). | output `{filename}`; tool id `pdfoffice` convert_to pdf [confirmed] |
| Protect | Mode Basic / Advanced. Basic: password + repeat with live checklist (Lowercase & Uppercase, Number, Special char, 8+ chars, match). Advanced: "Restrict access" (open password) + "Advanced permissions" (owner password) + checkboxes: Disable printing, content modification, copy/extraction, comments, form filling, accessibility extraction, document assembly. Note: "Some applications may not apply these restrictions." | simple [confirmed] |
| Unlock | No options ("Just press the unlock button"). Password prompt per file if needed, "Same password for all files". | [confirmed] |
| Repair | No options. Note: may return a different format if detected. | [confirmed] |
| PDF to PDF/A (Premium) | Conformance select: 1b, 1a, 2b, 2u, 2a, 3b, 3u, 3a with a description card per level; "Allow downgrade of PDF/A compliance level" (on). | pdfa-2b, downgrade on [confirmed] |
| HTML to PDF | URL field (also Files: html/css/js/zip, or paste HTML). Live preview screen. Screen size 1920/1440/768/320; Page size A3/A4/A5/Letter; "One long page" (on); Orientation; Margin 0/20/40; Try to block ads; Remove overlay popups; Remove backgrounds. | A4, one long page on, portrait, no margin [confirmed] |
| Scan to PDF | QR code pairing with iLovePDF mobile app (step 1 scan QR, step 2 connected device, "Do not close this tab"); then image-to-PDF options (orientation, A4, margin, merge). | portrait, A4, 0, merge on [confirmed] |
| Compare | Two modes: Semantic Text (change report + search) / Content Overlay (colour diff). Two file slots with page number inputs, scroll sync, pan. | [confirmed] |
| Redact | Search text; quick patterns Text / Credit Card / Phone Number / Email; "Smart redact" (AI) with category checkboxes all on (person names, company names, SSN & ID, DOB, addresses, phones & emails, account & policy numbers, medical record numbers) + free prompt; "Marked for redaction" list, Clear all; redact whole page. Warns if no text layer and links to OCR. RTL not supported. | [confirmed] |
| Edit PDF | Toolbar: edit existing text, add text, images, shapes, freehand, comments, highlights; z-order. | [confirmed strings] |
| Sign | Signer: "Only me" / "Several people" (registered). Signature: type (10 script fonts), draw, upload PNG/JPG/SVG, "Draw from your mobile device"; same for initials; colour. Fields: signature, initials, name, date, text, input, stamp. Requests: signing order, expiry (15 days, 1-130), multiple requests (Premium), notify, reminders (every 1 day), certified digital signature (Premium, eIDAS), notification language, custom email, UUID (on), QR integrity check (on), email branding (Premium). | [confirmed] |
| PDF Forms | Detect fields; fill mode / edit mode; add text fields, checkboxes, radio, lists; fallback "Edit/add manually" when no fields. | [confirmed] |
| Translate (AI) | From (auto list, default English) / To, swap button; Output layout: keep layout / text only; AI tier Standard / Advanced. | layout, standard [confirmed] |
| AI Summarizer | Tone: Formal / Informal / Original / Academic / Sarcastic / Professional; length (short/medium/long) [inferred, API key `summarize_length` medium]; AI tier Standard / Advanced; output in site language. | formal, medium, standard [confirmed] |
| PDF to Markdown (AI) | No options. | [confirmed] |

Output filename pattern: `{filename}_<suffix>` for single file, `ilovepdf_<tool>` zip name for batches (`packaged_filename`). [confirmed]

---

## 3. Client-side vs server-side

**Processing model: everything is server-side.** The browser only uploads, previews and collects options. [confirmed]

| Part | Where | Evidence |
|---|---|---|
| Thumbnails / page previews | Client: pdf.js **1.8.378** (2017 build) lazy-loaded from `/js/pdfjs/pdf.min.js`, renders to canvas, handles password-protected files locally | app.js `initPdfJs`, `getDocument({url,password})` [confirmed] |
| Upload | plupload (html5 runtime, chunked `chunk_size`, `max_retries:0`) to a sharded worker host | `/js/plupload/plupload.full.min.js`, `configPlupload` [confirmed] |
| Worker hosts | Config lists ~110 hosts `api1..api113`, regional `api1-c-de`, `-fr`, `-pl`; AI tools use `api2ai..api10ai` | `ilovepdfConfig.servers` [confirmed]; full host is `apiN.ilovepdf.com` [inferred] |
| API shape | `{workerServer}/v1/` + `upload`, `upload/{task}/{file}` (DELETE), `process` (POST form: task, tool, files[i][server_filename/filename/pages/rotate...], options), `task/{id}` (GET), `task/next` (chain tool), `task/reset`, `download/{task}`, `pdfrender/`, `pdfrender/text/`, `run` (one-step), `detect`, `detectfaces`; Bearer JWT from page config | app.js + editor bundles [confirmed]. Same model as public iLoveAPI (start, upload, process, download) [inferred] |
| Workflows | Same pipeline, `PROCESS_URL="workflow"` | [confirmed] |
| Editors (Edit, Sign, Redact, Compare, Crop, Forms) | React bundles per tool (`editpdf.js` 1.3 MB, `sign.js` 1.4 MB, etc.), pdf.js for display, server `pdfrender` for page images/text, final output via `/v1/process` | [confirmed] |
| Libraries | jQuery, Sortable.js (drag reorder), Popper (tooltips), React (editors), Sentry-style error SDK, plupload, pdf.js | [confirmed] |
| Telemetry | GA4, own `evt.ilovepdf.com` events, Google Ad Manager, IAB TCF CMP (153 vendors + 54 ad partners). Bot check: sent `c=hack&a=selenium` event when run under automation | REA network capture [confirmed] |
| Retention | Files auto-deleted within 2 hours; manual delete on download page; signed docs up to 5 years | /help/security [confirmed] |

---

## 4. UI / UX patterns and design tokens

### Layout [confirmed from CSS + screenshots]
- Header 60px, white, logo left, uppercase nav items, Login text link + red "Sign up" pill, 9-dot grid.
- Tool page before upload: centred H1 42px/52px weight 600 `#33333b`, subtitle ~22px grey, big CTA.
- After upload: two-column flex. Work area `flex:1`, bg `#f5f5fa`, padding 24px. Sidebar `flex-basis:440px` (380px on smaller desktop), white, `border-left:1px solid rgba(0,0,0,.2)`, left shadow `-15px 0 20px rgba(22,22,22,.1)`, scrolls, 120px bottom padding for the sticky button.
- Sidebar title: 28px/30px weight 600, centred, 21px padding, bottom border.

### Upload CTA [confirmed]
- `.uploader__btn`: min 330x80px, padding 24px 48px, 24px weight 500, bg `#e5322d`, white text, radius ~12px (screenshot), shadow. Mobile: full width, 22px.
- Side buttons: round red Drive + Dropbox icons (40px circle). After files added, a round red "+" (Add more files) with badge count, plus Drive/Dropbox mini buttons. [confirmed markup; badge inferred]

### File cards / thumbnails [confirmed CSS + code]
- `.file` card height 284px (220px compact), canvas thumbnail with `box-shadow:0 3px 6px rgba(50,50,50,.3)` (looks like paper), filename 12px below, page count.
- Hover reveals action buttons top-right (`top:8px;right:8px`): rotate, remove (and zoom in organize). Hidden while dragging.
- Drag-and-drop reorder via Sortable.js, `cursor: move`. Merge has "order by name" A-Z / Z-A toggle.
- Organize: per-page cards, "+" insert blank page between pages, Shift-click ranges in Remove pages.

### Option controls [confirmed]
- Image-cards (`.option__image__item`): grey `#f5f5fa` tiles, radius 8px, 18px 28px padding, two per row, title + caption; active = check badge and darker border/bg.
- Tabs with icons (Split: Range/Pages/Size), "Premium" crown badge on locked items, "AI" badge on AI options.
- 3x3 position grid picker for watermark / page numbers.
- Inline live math text ("This PDF will be split into files of 2 pages. 3 PDFs will be created.").
- Process button `.btn--process` full width red at sidebar bottom with arrow icon; AI tools use `.btn--ai` (purple `#7253e2`). Button gets a "pulse" nudge after options change (`checkProcessPulse`). [confirmed method name; visual inferred]

### Colour tokens (by frequency in app.css) [confirmed]

| Role | Hex |
|---|---|
| Brand red / primary CTA | `#e5322d` (hover darker `#bd060a`) |
| Text darkest | `#161616`, headings `#33333b`, body `#47474f` |
| Muted text | `#707078`, `#85858e`, `#9999a2`, `#adadb6` |
| Surface grey (workarea, tiles) | `#f5f5fa`, active/hover `#ebebf4`, borders `#d6d6df` |
| Success green | `#4acd86`, dark `#1d9d58` |
| Warning / premium | `#ffb400`, `#ffc233` |
| Error | `#fb7876`, light `#fde4df` |
| AI purple | `#7253e2` |
| Link blue | `#008ee9`, info bg `#def2ff` |

Per-category icon colours (screenshot): organize red/orange, optimize green, convert-from-Word blue, PowerPoint orange. [confirmed visually]

### Typography [confirmed]
- Font: **Graphik** (Regular, Medium, Semibold, Bold, RegularItalic, self-hosted woff2), with script variants Graphik AR/TH/LC/LG for other scripts.
- Body line-height 1.3. Home H1 ~42px bold, card titles ~22px, card text 14px grey.

### Radii and shadow [confirmed]
- Radius: 8px dominant (58 uses), then 4px, 12px, pills 9999px, circles 50%.
- Home tool cards: white, 1px light border, radius ~12px, ~24px padding, icon 40px top-left (screenshot).
- Shadows: `0 3px 6px rgba(0,0,0,.14)`, soft `0 1px 15px 1px rgba(69,65,78,.08)`.

### Motion [confirmed / inferred]
- Short linear transitions (`.1s linear`) on buttons; jQuery fadeIn/fadeOut for process button. [confirmed]
- Ring pulse `box-shadow:0 0 0 60px rgba(255,106,88,.1)` keyframe on CTA. [confirmed CSS, use inferred]
- Progress screen: percentage + bar during upload, then spinner + "Merging PDFs..." text. [inferred from strings]

### Mobile [confirmed from 390px REA screenshot + CSS]
- Hamburger left, logo centre, 9-dot right. CTA full width; Drive/Dropbox go below CTA, right-aligned.
- Sidebar becomes a toggled panel (`#settingsToogle` toggles `.tool--toggle`) over the workarea. [confirmed code; visual inferred]
- Breakpoints seen: 360, 440/450, 480, 500, 640, 720/740, 768, 780, 860, 950, 992, 36em, 60em, 62em, 75em, 90em.

### Other UX [confirmed]
- Consent banner bottom-left on first visit (big, covers work area on mobile).
- Ads: leaderboard slot on tool pages (970x90 to 320x50), with overlay to prevent accidental clicks near the download area.
- Error copy for: wrong extension, empty file, damaged file, size exceeded, task limit, password required, connection problems ("disable extensions or use incognito").
- "Welcome back" message if user returns mid-upload: files were dropped for security.

---

## 5. Limits (free anonymous vs registered vs premium) [confirmed from `allFileLimits`]

| Tool | Free (MB / files) | Premium (MB / files) |
|---|---|---|
| Merge | 100 / 25 | 4000 / 500 |
| Split | 100 / 1 | 4000 / 1 |
| Compress | 200 / 2 | 4000 / 10 |
| Office to PDF | 15 / 1 | 4000 / 10 |
| PDF to Office | 15 / 1 (Excel 500 pages) | 4000 / 10 (1000 pages) |
| OCR | 15 / 1, 50 pages | 4000 / 10, 1000 pages |
| PDF to JPG | 25 / 2 | 4000 / 10 |
| Image to PDF | 40 / 20 | 4000 / 80 |
| Page numbers, Watermark, Unlock | 100 / 2 | 4000 / 10 |
| Protect | 100 / 2 | 4000 / 80 |
| Rotate | 100 / 20 | 4000 / 80 |
| Organize | 100 / 5 | 4000 / 20 |
| PDF/A, Repair | 100 / 1 | 4000 / 10 |
| Edit | 100 / 1 | 100 / 1 |
| Sign | 50 / 3 | 50 / 5 |
| Redact, Compare | 400 / 1-2 | same |
| Crop | 100 / 1 | 4000 / 1 |
| Forms | 15 / 1 | 100 / 1 |
| Translate, Markdown | 15 / 1, 30 pages | 200 / 1, 500 pages |
| Summarizer | 50 MB, 25k words, 1 task | 100k words |

- A `temp_limits` tier also exists (higher, e.g. merge 1000 MB / 80 files): likely a time-limited trial. [inferred]
- Premium gates in UI: Split by size, PDF-to-Office OCR, PDF to PDF/A, Smart split/redact beyond quotas, Sign: multiple requests, certified signature, branding. [confirmed]
- Pricing: Free; Premium EUR 5/mo billed yearly (EUR 60) or EUR 9 monthly, includes 2,000 AI credits, regional processing, no ads; Business custom. Free education year. [confirmed]

---

## 6. Behaviours worth copying (no branding)

1. **One page per tool, same skeleton everywhere**: hero CTA, then workarea + right options sidebar + sticky process button. Users learn it once. [confirmed]
2. **Options as big image-cards with one-line captions** ("Less quality, high compression") instead of dropdowns. [confirmed]
3. **Live result preview text** in the sidebar ("3 PDFs will be created", "files no larger than 1 MB"). Cheap and builds trust. [confirmed]
4. **Split variants as tabs of one tool**, and Remove / Extract pages exposed as menu entries that deep-link to the same tool (`#split,extract`). More entry points, one engine. [confirmed]
5. **Order by name toggle** on merge, hover actions (rotate, remove) on cards, drag reorder, "+ add more files" with count. [confirmed]
6. **Blank page insert** between pages in Organize; Shift-click ranges in Remove pages. [confirmed]
7. **3x3 position grid** for watermark/page numbers; text template tokens `{n}`, `{p}` with presets; first-page-is-cover and facing pages. [confirmed]
8. **Scanned-PDF detection** that warns "OCR needed" before converting; redact warns no text layer and links to OCR. [confirmed]
9. **Password-strength checklist** live under the password field; "same password for all files" on unlock. [confirmed]
10. **Chaining**: after a result, "continue with another tool" using the same file (their `task/next`). For us: pass the output Blob to the next tool in memory, no re-upload. [confirmed API, UI inferred]
11. **Sensible filename suffixes** `{filename}_compressed`, `_watermark`, `_pagenumber`; zip name for batches. [confirmed]
12. **Per-page "review before sharing" warnings** on Crop/Redact (visual crop does not remove content). [confirmed]
13. Clear error taxonomy with friendly copy (damaged, empty, wrong type, too big, password). [confirmed]

### Where SwissPDF can beat them
- They upload everything to ~110 servers, keep files up to 2h, run 150+ ad vendors, and fingerprint automation. We process locally: say it on the CTA ("files never leave your device") and show no upload progress bar. [confirmed contrast]
- Their free caps (2 files compress, 15 MB office, 1 file split) are server-cost driven; local processing lets us drop most caps. [inferred]
- Their preview engine is pdf.js 1.8 (2017); a current pdf.js gives sharper, faster thumbnails. [confirmed version]
- Instant processing: no "Uploading / Time left / Upload speed" phase. Keep only a short local progress state. [inferred]
