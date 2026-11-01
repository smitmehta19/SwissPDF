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
- **Phase:** 2026-11-01 deployed ce0368a: edit text phase 2 (RTL line reflow, leak fixes, UI fixes); paragraph re-wrap parked behind `PARAGRAPH_EDIT` flag. `HANDOFF.md` is stale.
- **Done:** ship gate full corpus 958/958, 12 UI scripts 0 fails, live Health 49/49
- **Open:** parked paragraph re-wrap (`docs/team/status-engine.md` "Parked"), P2 lists in the edit-text plans, polish carry-overs
- **Next step:** none required; pick a parked item when wanted
- **Updated:** 2026-11-01
