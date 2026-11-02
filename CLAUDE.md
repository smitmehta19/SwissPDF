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
- **Phase:** 2026-11-02 edit text units A, B, C, D deployed (e0487ab overflow guard, 34725a5 note polish, c189a99 real spaces on spilled lines, 06a10c1 several lines edited as one); live Health 49/49. `HANDOFF.md` is stale.
- **Done:** edittext rows 126/126, edittext-ui 95/95, quick 202/202, range fuzz 540 edits 0 bad; D review approve (after 1 fix round), blind test no P0
- **Open:** parking lots: D in `docs/plans/2026-11-02-edit-text-multiline.md`, A/B/C in `docs/plans/2026-11-01-edit-text-next.md`; 1 question in `docs/decisions-pending.md` (typed-line re-wrap)
- **Next step:** Smit answers the re-wrap question, or picks the next unit from the parity unit map
- **Updated:** 2026-11-02
