# UI status: edit text phase 2

2026-10-28. Plan: `docs/plans/2026-10-28-edit-text-phase2.md`. Files changed: `src/tools/v2/edittext.jsx`, `edittext.css`, `edit.jsx`, `scripts/corpus-test/edittext-ui.mjs`, screenshots in `docs/design/screens/edit-text/`. `g3-canvas.jsx` untouched.

## Round 1 (phase 2 build)

| Item | State |
|---|---|
| P2 #3 tap picks the closest editable line within 22 px (touch or under 768 px) | done, PASS |
| P2 #3 phone editor bar, highlight on page | done, PASS |
| P2 #4 note clamped / flipped inside the visible canvas | done, PASS (clamp); flip above not tested |
| Paragraph editor (triple-click, Shift+Enter, Paragraph button) | done, PASS end to end |
| RTL line and paragraph editors | done, PASS |

## Round 2 (blind test fixes, `docs/reviews/2026-10-28-blind-edit-text-p2.md`)

| Item | Fix | Check in `edittext-ui.mjs` |
|---|---|---|
| P1-6 refused text thrown away | refused edits keep the typed text (drafts); Enter / Ctrl+Enter / Apply reopen the editor with it and the reason; after a click away, opening that text again brings it back; Esc drops it | para: refused text stays (2023 of 2023 chars) PASS |
| P1-7 (UI) triple-click: word editor and note together | a refusal note closes any open editor | rtl: triple-click on a refused line, 0 editors + note PASS |
| P2-4 paragraph editor in italics | look = style covering most letters (plain wins a tie) | screenshot `paragraph-1440.png` |
| P2-6 empty form field click does nothing | widget boxes from pdf.js; click (or Enter on a field value line) shows "This is a form field: use Forms" + Open Forms | fw9: note + Open Forms goes to `#/forms` PASS |
| P2-7 notes cover the change | note placed outside the union of new box, changed box and old box; flips above at the page bottom | trace: note does not cover the edited line PASS |
| P2-8 view scrolls by itself | focus after apply goes back by place with `preventScroll`; bar scrolls only as far as needed | fw9 low word + para apply: scroll unchanged PASS |
| P2-8 banner close shift | not fixable in the tool: needs a Shell change (see below) | - |
| P2-9 counter | counts one per applied edit from the edit list (paragraph = 1) | para: 1, undo 0, redo 1, then word edit 2 PASS (old behaviour not reproduced) |
| P2-10 toolbar shifts | Paragraph button always shown on desktop (disabled until a word or line editor is open); "Applying..." keeps its space | para: Undo stays put PASS |
| P2-11 Apply 2.1 s vs shown 0.2 s | measured in the page: click to Download 60 to 130 ms (dev) and 93 to 103 ms (built app, fw9 and udhr-arabic), shown time matches. The 2.08 s looks like the test tool's own wait. Run now waits while a text edit is still being applied (`textBusy`), so it never saves without it | para: wall 62 ms, shown 0.0 s PASS |
| RTL paragraph check | strict (must apply) | PASS |

Notes on round 2:
- P1-6 is tested on a paragraph only; word and line refusals use the same code path. A brought-back draft puts the caret at the end (not selected).
- P2-8: the likely cause is fixed (focus after apply by index, with scrolling). The new no-scroll checks are green but would also pass on the old code; the W-9 jump itself was not reproduced.
- Run with an editor still open (seen in a scratch run): mouse down on "Apply N edits" commits the edit, Run turns not ready while it applies, so the first click does nothing; the label then reads "Apply 2 edits" and a second click saves both. Nothing is saved without the edit, but the first click is lost. A Shell change could queue the click until the tool is ready.
- Results: `edittext-ui.mjs` 81 PASS, 0 FAIL (1 SKIP: no note after the paragraph edit, so its placement is checked on the trace line note); para re-run after the caret change PASS; `test:quick` 195/0 (`docs/test-results/2026-10-28-p2-ui-fix-quick.md`); build OK.

## Round 3 (Shell changes, now done here)
- Notice ("already in your files") and the undo flash float under the top bar: the page no longer moves when they come or go. Check: shell section, stage top unchanged (236.5 px) PASS.
- One Run click with a text editor open: the edit is applied, then the run starts (click held, button says "Applying your last change…"). A refused edit drops the held click and the editor keeps the text. Checks: shell section, edit in the output PASS; refused paragraph, no run, text kept PASS.
- Done screen: under 100 ms reads "under 0.1 s". Check: para section PASS.
- Results: `edittext-ui.mjs` 85 PASS, 0 FAIL, 1 SKIP; `fix1-shell.mjs` all passed; `test:quick` 195/0 (`2026-10-28-p2-ui-shell-quick`); build OK.

## Old Shell notes (resolved in round 3)
- Queue a Run click that came while the tool was not ready (see above), or keep Run enabled and let the tool wait.
- The "already in your files" notice is in the page flow and auto-dismisses after 8 s: the viewer moves up under the pointer. Overlay it (toast) or keep its space while a canvas tool is open.
- Time on the done screen shows "0.0 s" for runs under 50 ms.

## For the engine
- Round 1 findings (∗ refusal in unchanged words, letter swap reported as overflow/mixed) are listed in the round 1 report; nothing new from the UI side. No P1-7 UI request found in `status-engine.md`.
