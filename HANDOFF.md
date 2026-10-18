# SwissPDF handoff (paused 2026-10-18)

Paused on purpose (credits). Nothing committed, nothing deployed: live site is still the old `32e0044` build. All new work is UNCOMMITTED in the main tree plus 3 agent worktrees.

## Read first
- `CLAUDE.md` (Current phase), `docs/plans/2026-10-17-parity.md` (unit map), `docs/plans/parity-checklist.md` (definition of done)
- Latest green scorecard: `docs/test-results/integ-1.md` (573/577 real-file rows, 0 regressions)
- Open reviews: `docs/reviews/2026-10-18-integ1-review.md` (25 findings, 2 P0), `docs/reviews/2026-10-18-design-critique.md` (4 must-fix, static only)
- Gotchas: `docs/team/dev-notes.md`; decisions: `docs/decision-log.md`, `docs/decisions-pending.md`

## State of the main tree
| Part | State |
|---|---|
| U0 corpus runner + 131 real files | done (`npm run test:corpus`, `--shards 4`, README in scripts/corpus-test) |
| U1 engine core + review fixes | done, merged, tested |
| U2a shell (workbench, file store, jobs, result screen) | done, merged |
| U4 conversions (PDF to Office, Office/HTML to PDF engine) | done, merged |
| G1 organize, G3 edit canvas, G4 convert (24 tools on new shell + U3 fixes) | done, merged (integ-1) |
| **Fix batch for integ-1 review + design critique** | **STOPPED MID-WAY, UNTESTED** (see below) |

### Partial fix-batch edits (untested, build passes)
The fix agent was stopped while working. It had edited these files in main since integ-1:
`src/app/{FileGrid,fileStore,ResultScreen,Shell,ToolPanel}.jsx/js`, `src/lib/{htmlOps,imageOps,libreOffice}.js`, `src/tools/v2/{convertShared.js,html2pdf,img2pdf,office2pdf}.jsx`, `scripts/corpus-test/validate.mjs` (was adding the raw byte scan for redaction).
NOT yet fixed: the 2 P0s in `src/lib/redactOps.js` (orphan original pages survive in image-mode output; XFA values survive redaction). **Redact must not ship until fixed.**
Snapshot of the whole code tree at pause: `.claude/snapshots/2026-10-18-pause/` (gitignored).
Before continuing: run `npm run build` + `npm run test:corpus -- --quick --shards 4 --name resume-check` and compare with `docs/test-results/integ-1.json`; if the partial edits break anything, re-do them from the review file.

## Agent worktrees with unfinished work (uncommitted, kept)
Under `.claude/worktrees/` (gitignored). Each synced from main, then built its own files. All stopped mid-work, none fully verified.
| Worktree | Unit | Owned files to merge later | Where it stopped |
|---|---|---|---|
| `agent-a10aa934553b9b1be` | G2 optimize + security (repair, ocr, protect, unlock, compare, health) | `src/tools/v2/{repair,ocr,protect,unlock,compare,health}.jsx`, `g2.css`, `group-security.js`, `src/lib/{cryptoOps,ocrOps,compareOps,mupdfOps,selfTest}.js`, `public/tessdata/` | adding raw-scan redact check to selfTest |
| `agent-a29ce0a796c2d9627` | U5-A page layout (n-up, booklet, overlay, scale, single page, stamp, remove blank, linearize) | `src/lib/layoutOps.js`, `src/tools/v2/{nup,booklet,overlay,scale,singlepage,stamp,removeblank,linearize?}.jsx`, `layoutShared.jsx`, `group-layout.js` | writing the linearizer |
| `agent-ab080842fd06fd185` | U5-B structure + cleanup (bookmarks, metadata, attachments, remove annots/images, sanitize, flatten, permissions, info, auto rename) | `src/lib/docOps.js`, `src/tools/v2/{bookmarks,metadata,attachments,removeannots,removeimages,sanitize,flatten,permissions,info,autorename}.jsx`, `structure-shared.jsx`, `structure.css`, `group-structure.js` | adding generic case loaders to the runner |
Copy ONLY owned files into main; their copies of other files are stale. Shared files (registry.js, Shell.jsx, cases.mjs, page-harness.js) need a hand merge.

## Next steps, in order
1. Resume check (build + quick corpus) on main.
2. Finish the fix batch: redact P0s first (MuPDF `garbage=compact` save, strip XFA), raw-byte redaction tests, then the rest of the integ-1 review P1/P2 and design must-fixes. Full corpus run.
3. Finish G2 in its worktree (or restart it from main), merge. Then U5-A and U5-B: finish, merge.
4. U5-C (extra converts, colour, camera scan, PDF/A) and U5-D (edit existing text, certificate sign, Automate): scope in `docs/plans/2026-10-18-U5-new-tools.md`.
5. Re-review (code) + live design critique (real browser, Playwright; the first critique could not run a browser).
6. U6: full parity checklist on corpus, then ask Smit to commit + push (deploys to GitHub Pages).

## Ways of working that worked
- Parallel developer agents in git worktrees, each owning a disjoint file set; orchestrator merges shared files by hand; sync helper script copied main's uncommitted state into each worktree (recreate it: copy `git status` files from main + junction `test-corpus`; mklink fails in git bash, use PowerShell `New-Item -ItemType Junction`).
- Every unit: corpus delta must show 0 PASS->FAIL; separate reviewer agent after each merge.
- Cost: roughly 0.25 to 0.45M tokens per developer agent run.
