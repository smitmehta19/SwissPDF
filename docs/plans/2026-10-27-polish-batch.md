# Plan: polish batch after the Stirling parity deploy (2026-10-27)

Source: "Fix list" in `docs/plans/2026-10-26-stirling-parity.md`, blind review P2s (`docs/reviews/2026-10-27-blind-review.md`, numbers below), reviewer P3s. Started on Smit's request ("start the fix list polish items").

## Definition of done
Each item fixed or written off with a reason in the agent's report; independent reviewer per group; `npm run test:full` 829+ rows green; build; deploy only on Smit's OK.

## Out of scope (parked)
Edit existing text, certificate sign / timestamp, PDF/A, i18n, the S2 parked viewer extras.

## Decisions (my calls, logged in `docs/decisions-pending.md`)
- Restricted (owner-only) inputs: outputs keep the same permission flags, re-encrypted with a random owner password; the result note says so.
- Offline: make it real. Service worker caches the app shell and engines (hashed assets cache-first, navigation network-first with cache fallback), so a new tab works offline after the first visit.

## Groups (disjoint files, run in parallel, tests queue on the machine lock)
| Group | Owns | Items |
|---|---|---|
| A Shell + flow | `src/app/*`, `src/components/*`, `src/tools/v2/automate.*`, `src/lib/automate.js` | Blind 2 (no-op runs: no new version), 6 (name growth), 7 (phone split names), 8 (derived files pile up: group or filter by type), 9 (same-name outputs), 10 (result says selected but is not), 13 (consistent auto view switch), 14 (undo confirm consistent), 15 (search synonyms), 22, 23 (phone), 24 (unknown route), 25 label half + hover-only tile actions, 26 (grid reflow, card x wrap, Popular alignment, password placeholder, favicon), re-check: warn in Run panel when a tool replaces inputs; Merge % smaller rule; conversions consistent (Word to PDF vs PDF to Word keep inputs). S2 P3 #10 (search across text items), #14 (no edits during Save). Automate P3s. Integ-1 #5 (persist atomicity), #11 (memory LRU). Cold start: warm worker + MuPDF when a tool opens. |
| B Tools | `src/tools/v2/*` except automate, `src/lib/{docOps,layoutOps,colorOps,ocrOps,compareOps,cryptoOps,redactOps,mupdfOps,pdfExtract}.js` | Blind 4 (remove annots count vs form fields), 11 (split placeholders), 12 (duplicate inputs/Save buttons in Extract/Organize), 16 (booklet copy), 17 (OCR quality: check preprocessing/dpi), 18 (bookmark headings), 19 (Markdown banner headings), 20 (sign default size), 21 (info Fonts twice, field count), 27 (console noise: MuPDF xref, tesseract dpi). Office panel wording (fingerprint). Forms phone: start zoom readable on narrow screens. G2 P3s (invisible-char password message, Compare speed regression, `ocrPdf` default). Redact P3s (background-image pages, memory growth). |
| C Security + platform | `src/lib/{htmlOps,imageOps,libreOffice,cellValues,intake,fileTypes}.js`, `src/tools/v2/{html2pdf,office2pdf,img2pdf,convertShared}.*`, `public/coi-serviceworker.js`, `vite.config.js`, `src/main.jsx` | Integ-1 #6 (HTML sanitizer network bypasses: CSP meta in srcdoc), #8 (Office cancel), #10 (EXIF strip, check), #12 (cell values), #9 already done. Intake: keep owner-only restrictions on outputs (decision above), and restriction-only Protect outputs in Merge/Watermark. Offline (decision above). |

## Carried over after the developer round
- Blind 12 (two page inputs / two Save buttons in Extract and Organize): needs `toolOwnsRun` prop from Shell to PageEditor (Group B's exact proposal in its report); keep `pe-range` / `pe-apply` when no tool is open.
- Redact memory: move redact into the ops worker and recycle the worker every N jobs (growth is inside MuPDF `applyRedactions`).
- Restrictions: quick rotate and Pages editor save bypass `keepRestrictions`.
- OCR cutoff 20 adds some junk to the hidden text layer (search still works).
- Later: `intake.js` `automateSteps` copies `currentOf` from automate.jsx; export one shared resolver from `src/lib/automate.js`. An old open tab cannot load new chunks after a deploy (same as before this batch).

## Order
Groups A, B, C in parallel (developers), each then an independent reviewer, fixes, then one orchestrator `test:clean` + `test:full`, then a short blind re-check of the phone + flow items, then ask Smit to deploy.

## Cost
3 developer runs + 3 reviewer runs + blind re-check: roughly 2 to 2.5M tokens.
