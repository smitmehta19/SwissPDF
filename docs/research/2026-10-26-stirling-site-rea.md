# Stirling website + web app teardown (2026-10-26)

Method: live capture of www.stirling.com and stirling.com/app as a guest (REA browser scenario + Playwright, Chrome, 1440x900 and 390x844), files from our public corpus (`reports/pdfjs-tracemonkey.pdf`, `invoices/aws-invoice.pdf`). Cookies declined. No account created by us (guest "Skip" makes an anonymous session on their side).
Earlier repo research: `docs/research/stirling-pdf.md` (2026-10-17). Screenshots: `.playwright-mcp/st_*.png` (gitignored, local only).

Source tags: **live** = observed today, **repo** = from the 2026-10-17 repo research, **unverified** = not checked.

## 1. Key findings
| # | Finding | Source |
|---|---|---|
| 1 | Their web app uploads files to their server. Compress POSTed the PDF to `api.stirling.com/api/v1/misc/compress-pdf`: 1.26 s request, about 1.9 s Run-to-result on a 1-page 115 KB file. Their homepage says the editor "runs on your machine". SwissPDF keeps every byte local: this is our main edge, say it plainly in the UI. | live |
| 2 | Product is now 3 modes on a left rail: **Reader** (distraction-free viewer), **Editor** (workbench + 60+ tools), **Processor** (batch/AI pipelines, needs an account). | live |
| 3 | Desktop layout: left icon rail (48 px) + left **PDF Library** panel (Recent / grouped files, search, add) + centre workbench + **tools on the right** (tool list, then the selected tool's options in the same column). | live |
| 4 | Workbench has a 3-way switch: **Viewer / Page Editor / Active Files**, plus `Ctrl+K` "Super search" with filter chips All / Files / Tools / Settings. | live |
| 5 | Tool options are a numbered stepper: 1 Files (count, collapsible), 2 tool step (e.g. Sort Files for merge), 3 Settings. Run button names its scope: "Compress (this file)" in Viewer, "Compress (2 files)" / "Merge (2 files)" in the grid. Opening Merge or Convert switches the workbench to Active Files. | live |
| 6 | After Run: Files and Settings collapse, a **Review** card shows (thumbnail, size, type, time), then **Undo** and **Download**, then "Edit your new file(s)" with 4 suggested next tools (Convert, Sanitize, Split, OCR after Compress). The result replaces the file in place as a new version; cards show **v1 / v2** badges. | live |
| 7 | Files persist across reloads (IndexedDB). Library groups: Recent, Other, "View all N files". | live + repo |
| 8 | Page Editor: one collapsible row ("track") per file with name, rename, version, page count, open in viewer, close. Toolbar: wrap pages, zoom, select all, select by page numbers, rotate L/R, insert blank, split after, duplicate, download selected, delete, undo, redo, save to all files. Per-page hover: view, rotate L/R, duplicate, delete, move left/right; insert-blank gaps between pages. | live |
| 9 | Viewer toolbar: search, pan, ruler/measure, rotate L/R, thumbnails sidebar, bookmarks, attachments, comments, read aloud, annotate, redact, toggle annotations, form editor, add text; share, print, download, close. Bottom pill: first/prev/page box/next/last, dual page, dark filter, zoom slider with %. | live |
| 10 | Reader mode: full-width page, right mini rail (file info, bookmarks, thumbnails, search, rotate, comments, read aloud). | live |
| 11 | Automate: Saved list + "Create New Automation" + 5 suggested templates (Secure PDF Ingestion, Pre-publish Sanitization, Email Preparation, Security Workflow, Process Images). Template run = 3-step stepper; Pre-publish Sanitization = Sanitize, Flatten, Remove Annotations, Change Metadata, Compress. | live |
| 12 | Phone (390 px): bottom tab bar Sign / Tools / Automate / Files / Config; tool options full width. Their guest banner overflows off-screen at 390 px (bug, do not copy). | live |
| 13 | Extras: QR "Upload from Mobile", "Process a folder", favourites star per tool, AI "Stirling Agent" chat with suggested prompts, guest banner, sign-up gate on Processor. | live |
| 14 | Tool list, Editor mode (visible groups): Recommended (PDF Text Editor, Merge, Compare, Compress, Convert, OCR / Cleanup scans, Redact, PDF Multi Tool), Signing (Sign with Certificate, Timestamp PDF, Sign), Document Security (Add Password, Watermark, Stamp, Sanitize, Flatten, Unlock PDF Forms, Change Permissions), Verification (Get ALL Info, Validate Signature), Document Review (Change Metadata, Edit TOC, Read), Page Formatting (Crop, Rotate, Auto Rotate, Split, Reorganize, Scale, Page Numbers, Multi-Page Layout, Booklet, Single Large Page, Attachments, Portfolio), Extraction (Extract Pages, Extract Images). | live |
| 15 | Collapsed groups Removal, Automation, General, Advanced Formatting, Developer Tools: contents per repo research (remove pages/blanks/annotations/images/password/cert, auto rename, adjust colours, replace/invert colour, overlay, scanner effect, show JavaScript). | repo (live not opened) |
| 16 | Option defaults per tool (compress level 1-9 default 5, grayscale, linearize, line art; merge: remove signature, generate TOC, sort by name; etc.). | live for compress/merge/convert, rest repo |
| 17 | Processor mode contents. | unverified (account-gated, we did not sign up) |

## 2. Marketing homepage (www.stirling.com)
Sections in order: sticky top nav (logo, Product, Company, Pricing, Download, Docs, GitHub stars, Log in, Sign up) / hero (download-count pill, 2-line headline, 1-line sub, primary + secondary CTA, large app screenshot with glow) / "used by" line / 3-up product cards (Reader, Editor, Processor) / feature block: private + open source / feature block: batch processing with 3 ticks / "Scale with" bento grid (Assistant, API & MCP, Pipelines, Policies, Connectors) / deployment block with floating tile grid / testimonials / dark footer (Product, Company, Resources, socials, status dot). Framer site, lots of white space, near-black buttons, light grey page.
| Copy for SwissPDF | Skip |
|---|---|
| Section rhythm: hero with real app screenshot, 3-mode cards, privacy block, "how it works", footer | Download counts, Fortune 500 claim, pricing, sign-up, AI, API/MCP, connectors, deployment, testimonials |

## 3. Copy / do not copy
| Copy (behaviour, layout, flow, option names + defaults) | Do not copy |
|---|---|
| Rail + library + workbench + right tools layout, view switch, Ctrl+K search, numbered option steps, scope-named Run button, Review card + Undo + next-tool suggestions, version badges, page-editor tracks and toolbar, Reader mode, Automate templates + stepper, phone bottom tab bar | Name, logo, brand red, their wording, icons, Framer site code, AI agent, accounts/guest banner/sign-up gates, Processor, "where to run" chooser, any server upload, analytics |
"Can use their code": only MIT parts with the notice kept, never `proprietary/`, `saas/`, `engine/`, `desktop/`. Their client calls the server for processing, so it only gives UI patterns, not engines: in practice we reimplement.

## 4. Gap vs SwissPDF today (main, 2026-10-26)
SwissPDF already has a Stirling-style shell (U2a: `src/app/Shell.jsx`, FileGrid, PageEditor, Viewer, ResultScreen, ToolPanel, favourites, recent, IndexedDB store, jobs with cancel).
| Item | SwissPDF now | Delta |
|---|---|---|
| Layout | top bar + left tool panel + workbench + options panel | move to rail + left library + right tools/options (needs Smit's OK) |
| Library panel (Recent, groups, search) | file grid only | add left library list |
| Viewer / Page Editor / Files switch | modes exist | match segmented switch in workbench header |
| Ctrl+K search with filters | tool search box | add command palette: tools, files, settings |
| Numbered option steps + scope Run label | options panel + Run | add stepper and "Run (N files)" / "(this file)" |
| Review card + Undo + next tools | ResultScreen with continue-with | add Undo (version history exists), thumbnail card, 4 suggestions |
| Version badges v1/v2 | version chain in store | show badge on cards and tracks |
| Page editor toolbar | partial | add select by numbers, split after, duplicate, download selected, wrap, save to all |
| Viewer toolbar | basic | add search, thumbnails, bookmarks, dark filter, zoom slider pill, dual page |
| Reader mode | none | add |
| Automate (templates + saved chains) | none (U5-D) | add, client-side only |
| Phone bottom tab bar | drawer + bottom sheet | add tab bar |
| Tools | 20 v2 + 6 legacy on main | merge G2, U5-A, U5-B worktrees (about 25 tools); still missing: edit existing text, cert sign, validate signature, timestamp (needs network: flag), unlock forms, auto rotate, extract images, adjust/replace colours, show JavaScript, portfolio |
| Privacy proof | "never uploaded" line on start area | keep, plus a visible "0 uploads" note on results |

## 5. Latency baseline (theirs, for the final review)
| Action | File | Time |
|---|---|---|
| Compress level 5 | aws-invoice.pdf, 1 page | request 1.26 s, Run-to-result about 1.9 s (server) |
| App cold load to workbench | n/a | about 4 s incl. login/guest step |
