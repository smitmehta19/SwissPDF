# SwissPDF handoff (paused 2026-10-29, resume Monday)

Paused on purpose (credits) in the middle of the edit-text phase 2 ship prep. Live site = commit 39c54fc (phase 1 edit text, polish batch, Stirling parity). Everything below is UNCOMMITTED in the main tree (branch `wip-parity`). The tree builds (`npm run build` OK at pause).

## Read first
- Plan: `docs/plans/2026-10-28-edit-text-phase2.md`; decisions: `docs/decisions-pending.md` (top entries 2026-10-28/29)
- Reviews: `docs/reviews/2026-10-28-edit-text-p2-review-3.md` (latest), blind tests `docs/reviews/2026-10-28-blind-edit-text-p2*.md`
- Engine status + parked paragraph list: `docs/team/status-engine.md`; UI status: `docs/team/status-ui.md`; gotchas: `docs/team/dev-notes.md`

## Decision in force
Paragraph re-wrap is NOT shipping (review 3 P0 "Trace-Monkey" + P1s). It stays in the code behind a flag, parked with its findings. Ship: word/line edits, RTL line push, leak fixes (structure tree, XFA drop on static hybrid forms, compact final save), dynamic-XFA refusal, UI fixes.

## State of the 3 stopped tasks
| Task | State at pause | Left to do |
|---|---|---|
| Engine ship prep | DONE: dynamic XFA refusal (`xfa-dynamic`), `pageTextModel(..., { paragraphs = false })`, p3-g6 row, parked list. Tier 1 `^edittext-` 93/93 | none |
| Redact revert of box word cleanup | PARTIAL: `boxedWordTests` removed, box-only note added in `redact.jsx`. Not tested. Unknown: box rows in `cases.mjs` updated? validate.mjs "skipped revisions" (review P2-8) done? | Check rows, run `npm run test:touched -- --tool redact` |
| UI ship prep | PARTIAL: `PARAGRAPH_EDIT` flag started in `edittext.jsx` (4 refs). Not tested | Finish: flag off hides triple-click/Paragraph button/Shift+Enter and passes `{ paragraphs: PARAGRAPH_EDIT }`; edittext-ui skips para sections + checks no Paragraph button; 'decorated' copy (review P2-1); XFA in result note (P2-2); clear `pendingRun` on tool/selection/file change (P2-6); trim fallback font names (N7); WHY 'xfa-dynamic' = docOps `DYNAMIC_XFA_MSG`. Run `edittext-ui.mjs`, `fix1-shell.mjs` |

Third blind test was stopped part-way (no report). Optional on resume.

## Exact next steps (Monday)
1. Finish the UI task and the redact check above (one developer, about 1 hour).
2. `npm run test:clean`, build, `npm run test:full`, all 12 UI scripts (about 75 min, local).
3. Commit (no AI mentions), push `wip-parity:main`, wait for Pages, run `node scripts/corpus-test/health.mjs --url https://smitmehta19.github.io/SwissPDF/` with `CORPUS_LOCK=off`.
4. Update CLAUDE.md Current phase; decision-log entry for "paragraph re-wrap parked".

## Last green numbers (before the pause, same code minus the stopped tasks)
Full corpus 932/0 (`docs/test-results/2026-10-28-p2-final-full.md`), all 12 UI scripts pass, edittext-ui 90/90, redact tier 1 79/79, quick 198/198.
