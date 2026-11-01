# SwissPDF

Privacy-first PDF toolkit that runs fully in the browser: files never leave the device. Goal: match iLovePDF and Stirling PDF feature for feature, proven on real-world PDFs. Live at https://smitmehta19.github.io/SwissPDF/ (repo https://github.com/smitmehta19/SwissPDF, public, AGPL-3.0).

## How to run it
- Setup: `npm install`, then `bash scripts/fetch-test-corpus.sh` for the real test files
- Run: `npm run dev` (port 5173, sets COOP/COEP for the LibreOffice engine)
- Test / check: `npm run test:corpus` (real files, the quality gate), in-app Health check (smoke only), `npm run build`
- Test tiers (see `scripts/corpus-test/README.md`): `test:touched -- --tool <ids>` after each change, `test:quick` before handing back, `test:clean` + `test:full` once per phase by the orchestrator. One run at a time per machine (lock built in).
- Deploy: push to `main`, GitHub Actions builds to Pages

## Folder map
| Path | What it is |
|---|---|
| `src/tools/` | One component per tool, registered in `registry.js` (hash routes `#/<id>`) |
| `src/lib/` | Pure ops shared by UI and tests (pdf-lib, pdf.js, MuPDF, tesseract, LibreOffice WASM) |
| `src/components/` | Shared UI (file groups, inspector, page canvas, icons) |
| `public/vendor/` | Vendored zetajs + LibreOffice worker glue |
| `scripts/corpus-test/` | Playwright runner over the real corpus |
| `test-corpus/` | 131 real public files (gitignored), manifest in `docs/research/test-corpus.md` |
| `docs/plans/` | Plans; `2026-10-17-parity.md` = unit map, `parity-checklist.md` = definition of done |
| `docs/research/` | iLovePDF, Stirling, audit, corpus research |
| `docs/test-results/` | Corpus scorecards per unit |
| `docs/decision-log.md` | Decisions, newest first |

## Rules for this project
- No document data ever leaves the browser. No server processing, no analytics on file content.
- No Co-Authored-By trailers or AI mentions in commits; author is "Smit" from git config.
- Copy behaviour and options from iLovePDF/Stirling, never their branding, code from Stirling's proprietary folders, or copy text.
- A tool is done only when its corpus rows pass; generated samples are not enough.
- Never run two LibreOffice engine instances (deadlock). pdf.js renders need `intent:'print'` in background tabs.

## Way of working
Understand → Plan → Build → Review → Report (see global CLAUDE.md). One unit per sprint from the unit map; new ideas go to the plan's Parking lot.

## Current phase / Next step
- **Phase:** 2026-11-01 deployed 008df3e: edit text spill (long line edits continue on new lines, emptied lines close up; unsafe cases keep the old edit). Plan `docs/plans/2026-11-01-edit-text-spill.md`. `HANDOFF.md` is stale.
- **Done:** full corpus 978/978, 12 of 13 UI scripts green, live Health 49/49; 2 review rounds + blind test, no P0/P1 open on spill
- **Open:** `chain-g2.mjs` stops at the compare step (`compare-swap` click timeout, not edit text); spill parking lot (multi-line select = next unit candidate, blind P1s on existing overflow/centred behaviour, baseline 0.1 pt offset)
- **Next step:** look at the chain-g2 compare timeout, then pick a parked item
- **Updated:** 2026-11-01
