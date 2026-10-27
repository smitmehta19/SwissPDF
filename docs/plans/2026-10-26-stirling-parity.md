# Plan: Stirling look, flow and tools in SwissPDF (2026-10-26)

Status: APPROVED 2026-10-26 with changes: layout stays (S2 items 1 and 9 dropped), S4 home page dropped, deploy after S6 passes.
Input: `docs/research/2026-10-26-stirling-site-rea.md` (live teardown) + `docs/research/stirling-pdf.md` (repo research).
Supersedes the order of the remaining units in `2026-10-17-parity.md` (U5-C/U5-D parts not listed here stay parked).

## Goal
SwissPDF works and feels like the Stirling web app (layout, flows, tools, options), but every file stays in the browser. Proven on 3 real files per case, then judged by an independent agent with no context.

## Definition of done
1. Every tool in scope runs on its 3 named real files below; output re-opens in pdf.js and MuPDF; no upload (0 network requests carrying file data).
2. Shell matches the Stirling patterns in section "S2" on desktop (1440) and phone (390).
3. Redact P0s fixed and checked at raw-byte level.
4. `npm run build` passes, Health check green on the built app.
5. Independent no-context review done, its feedback file exists in `docs/reviews/`, every P0/P1 item fixed or answered in that file.

## Out of scope (parked)
AI agent, accounts, guest banner, sign-up gates, Processor mode, API/MCP, connectors, "where to run" chooser, QR mobile upload, folder watching, certificate sign / validate signature / timestamp (need PKI work, timestamp needs a network call), edit existing text, create portfolio, scanner effect. Their name, logo, red, wording, icons: never.

## Steps
| Step | What | Who | Done when |
|---|---|---|---|
| S0 | Base check: build (passed 2026-10-26), quick smoke on 3 files (tracemonkey, aws-invoice, irs-fw9) with the corpus runner `--case`. Then fix the 2 redact P0s (MuPDF `garbage=compact` save, strip XFA) + raw-byte test | me + 1 developer | smoke green, redact raw scan clean |
| S1 | Tool parity: finish and merge worktrees G2 (security), U5-A (layout: n-up, booklet, overlay, scale, single page, stamp, remove blank), U5-B (structure: bookmarks, metadata, attachments, remove annots/images, sanitize, flatten, permissions, info, auto rename). New small tools: unlock forms, extract images, auto rotate (tesseract OSD), adjust colours + invert/replace colour, show JavaScript | 3 developers, one per worktree; then 1 for the small tools | each tool passes its 3 files; reviewer pass |
| S2 | Shell to Stirling pattern (see list below) | 2 developers split by folder (`src/app/Shell*`+ToolPanel, `src/app/Viewer`+PageEditor) | design check at 1440 and 390, reviewer pass |
| S3 | Automate: saved chains + 5 templates (copy step lists, not names), 3-step run stepper, runs locally on N files | 1 developer | Pre-publish template runs on 3 files |
| S4 | Home page sections (only if Smit says yes): hero with real app screenshot, 3 mode cards, privacy block, how it works, footer | 1 developer | renders at 1440 and 390 |
| S5 | Test pass: 3 files per case table below, plus Run-to-result latency per tool, written to `docs/test-results/stirling-parity.md` | me + runner | all rows PASS or listed |
| S6 | Independent review (brief below), feedback to `docs/reviews/2026-10-xx-blind-review.md`, I fix, re-run its failing rows | fresh agent, then me | DoD 5 |

### S2 shell items (from the teardown; 1 and 9 dropped by Smit 2026-10-26, layout stays)
1. Left icon rail: Reader, Editor, Automate, Files, Help, theme. Left **Library** panel (Recent, by type, search, add). Tools list + selected tool options on the **right**.
2. Workbench header: segmented Viewer / Page Editor / Files switch; opening a multi-file tool (merge, convert) jumps to Files.
3. `Ctrl+K` command palette: tools, files, settings, with filter chips.
4. Options as numbered steps (Files, tool step, Settings); Run label states scope: "Compress (this file)" / "Compress (3 files)".
5. After Run: Review card (thumb, size before/after, time), Undo, Download, 4 suggested next tools; version badge v1/v2 on cards and tracks.
6. Page editor toolbar: wrap, zoom, select all, select by numbers, rotate, insert blank, split after, duplicate, download selected, delete, undo/redo, save to all; per-page hover actions.
7. Viewer: search, thumbnails, bookmarks, attachments, rotate; bottom pill with page nav, dual page, dark filter, zoom slider.
8. Reader mode: full-width page, small right rail.
9. Phone: bottom tab bar (Tools, Files, Automate, Viewer, Settings); options as sheet (already built).
10. Privacy line on results: "Processed on this device. Nothing uploaded."

## 3 real files per case (all in `test-corpus/`)
| Case | Tools | Files |
|---|---|---|
| Text PDFs | merge, split, organize, rotate, extract, remove, compress, page numbers, watermark, stamp, n-up, booklet, scale, single page, metadata, info, linearize | `reports/pdfjs-tracemonkey.pdf`, `invoices/aws-invoice.pdf`, `reports/arxiv-1706.03762-attention.pdf` |
| Odd geometry | rotate, crop, stamp, sign, page numbers | `derived/rot90-cropbox-bert.pdf`, `derived/c-rot270-cropbox.pdf`, `derived/origin-shift-aws-invoice.pdf` |
| Scans | OCR, auto rotate, remove blank, compress | `scanned/fax-jean-schmidt-doe.pdf`, `scanned/lincoln-ellsworth-letter-1861.pdf`, `derived/sub-ndl-konoye-p1.pdf` |
| Forms | forms fill, flatten, unlock forms | `forms/irs-fw9.pdf`, `forms/uscis-i-9.pdf`, `forms/xfa-issue14315.pdf` |
| Locked | unlock, protect, permissions | `derived/owner-only-aws-invoice.pdf`, `derived/user-pw-TAMReview.pdf` (pw in manifest), `quirks/pdfjs-saslprep-r6.pdf` |
| Annotations / structure | remove annots, bookmarks, attachments, sanitize, show JS | `quirks/pdfjs-tracemonkey_with_annotations.pdf`, `quirks/pdfjs-outlines_se.pdf`, `quirks/pdfjs-annotation-fileattachment.pdf` |
| Redact | redact | `invoices/aws-invoice.pdf`, `invoices/flipkart-invoice.pdf`, `forms/xfa-imm1344e-filled.pdf` |
| Non-Latin | watermark, page numbers, PDF to Word | `intl/udhr-arabic.pdf`, `intl/udhr-chinese-simplified.pdf`, `intl/udhr-hindi.pdf` |
| Images to PDF | img2pdf, compress | `images/photo-castle-3456x2628.jpg`, `images/heic-nokia-C001.heic`, `images/png-alpha-transparency-demo.png` |
| Office to PDF | word/excel/ppt to PDF | `office/poi-VariousPictures.docx`, `office/poi-Tables.xlsx`, `office/poi-SampleShow.pptx` |
| PDF to Office / image | pdf2word, pdf2excel, pdf2ppt, pdf2img, extract images | `invoices/aws-invoice.pdf`, `reports/fdic-quarterly-banking-profile-2023q4.pdf`, `reports/pdfjs-tracemonkey.pdf` |
| Compare | compare | `derived/compare-tracemonkey-base.pdf` vs `derived/compare-tracemonkey-inserted.pdf`, plus `reports/pdfjs-TAMReview.pdf` vs itself |
| Big file (1 only) | merge, compress, viewer | `reports/arxiv-2307.09288-llama2.pdf` (14 MB) |

## S6 independent review brief (fixed now, given as-is)
Fresh general-purpose agent with Playwright. It gets ONLY: the URL (local build), a folder copy of 12 real files (3 PDFs, 1 scan, 1 form, 1 locked + password, 2 images, 1 HEIC, docx, xlsx, pptx), and this task: "Use this website as a new user. Try every tool you can find on these files. For each: did it work, was it clear what to do, time from clicking the run button to the result showing, any errors in console, anything uploaded to the network. Check desktop 1440 and phone 390. Write a ranked list P0/P1/P2 to docs/reviews/<date>-blind-review.md." No findings, no plan, no gap table.

## Cost estimate
About 7 to 9 developer runs (0.25 to 0.45M tokens each) + 3 reviewer runs + the blind review: roughly 3 to 5M tokens. Max 3 to 4 agents in parallel, disjoint files.

## Fix list (cross-cutting, before deploy)
- Intake: owner-only (restricted) PDFs lose encryption and permissions after any tool (U5-A review P2). Decide: keep restrictions on output, or say plainly they are removed.
- Integ-1 review P1/P2 still open after S1: #4 wipe vs running job, #5 persist atomicity, #6 HTML sanitizer bypasses, #8 office cancel, #10 EXIF, #11 memory, #12 cell values, #13 a11y (check which the partial fix batch already did).
- Cold start: warm the jobs worker + MuPDF when a tool opens (about 1.5 s of first-run latency, U5-B).
- Offline: the service worker caches nothing, so a new tab or reload while offline does not load the app (G2 review). Either cache the app shell + engines or stop claiming offline.
- Restriction-only Protect outputs lose restrictions in Merge/Watermark (G2 review P2, same root as the intake item above).

- Automate P3s (review round 2): damaged saved value silently falls back to default with no notice; concurrent same-name typing in two tabs garbles; "no change" note match skips the step's own output check (`automate.js:377-380`).

- Redact P3s (review round 3, approved): born-digital pages with a full-page background image are treated as scans and become JPEGs in remove mode (safe, noted in result); about 3 MB memory growth per job in one process (check `borrowed()`, recycle worker); all ActualText on hit pages is stripped.

- G2 P3s (review round 2, approved): password error quotes an invisible char (soft hyphen, combining accent): show its name/code; Compare on two large unrelated docs 54 s (was 28 s); `ocrPdf` lib default 'all' would double text if a future caller omits `textPages` (today only ocr.jsx and selfTest on a text-less scan call it).

- S2 R4 (P3, accepted): workspace records saved before `consumedParents` treat every PDF output as consuming its parents, so undo can hide inputs of keep-input PDF tools (Compare report). Only affects local test workspaces from 2026-10-27; the store was never deployed.
- S2 P3s (review round 2): Viewer search misses phrases split across text items (#10); per-tile actions, drag and shortcuts still edit while Save runs (#14).

- Blind review leftovers (P2, after re-check, `docs/reviews/2026-10-27-blind-review.md`): Run panel gives no warning before a tool replaces its inputs; W-9 has no field tooltips so labels read "f1_01" and several checkboxes share "c1_1"; Office tool panels still say only "Only the engine files are downloaded"; Merge shows "% smaller"; conversions differ (Word to PDF replaces the DOCX, PDF to Word keeps the PDF); Forms on phone at fit width has ~7 px fields (zoom works); remaining original P2s 2, 4, 6-9, 11-21, 23, 24, 26, 27 and label half of 25. Fixed by me before deploy: session-only results now say so on the result screen.

## Agent working rules (from 2026-10-27)
- Every brief has a time budget (60 to 90 min); at 75% the agent stops testing and reports, unchecked items under "Not verified".
- Long commands wrapped in a hard timeout (`timeout 900 ...`); agents run only their own rows (`--tool` / `--case`), one quick run at the end.
- Reviewers write each finding to the review file as soon as it is confirmed.
- Orchestrator checks running agents every 30 min; quiet past budget = status message.
- Done 2026-10-27: `CORPUS_OUT` per-run output folder; machine-wide run lock (`scripts/corpus-test/runlock.mjs`) in `startServer()` and `serve-pages-sim.mjs`; shards capped by free RAM; `--light`; `npm run test:{touched,quick,full,clean}`; pages-sim `PORT` + idle stop. Global rule added to `~/.claude/CLAUDE.md` ("Testing without overloading the machine").

## Parking lot
- From S2 (parked 2026-10-27, my call): Pages wrap + zoom controls; Viewer attachments panel, dual page view, dark filter. Not built; the live critique did not miss them.
- From the live design critique (parked 2026-10-27 after the S2 fix batch): redact match list (S5), phone card menu (S8), contextual Pages toolbar (S9), image Open/Rotate (S12), busy card (S14), scroll areas (S15), remaining nice-to-haves; S11 conversions show output size only. Revisit if the blind review flags them.
- Rows removed on purpose: `u5a-blank-lincoln-scan-inserted` (replaced by real-blank Lincoln rows), `u5b-sanitize-owner-only-aws` (intake strips owner-only encryption, row tested a path the app never takes).
- Certificate sign, validate signature, timestamp (PKI; timestamp needs network).
- Edit existing text (U5-D).
- Create portfolio, scanner effect, PDF/A.
- Stirling has 40+ languages: i18n later.
