# S3 Automate review (2026-10-27)

Scope: `src/tools/v2/automate.jsx`, `src/tools/v2/automate.css`, `src/lib/automate.js`, registry entry, `scripts/corpus-test/{cases-automate.mjs,page-harness-automate.js,automate-ui.mjs}`. Uncommitted work on `wip-parity`. Reviewer did not edit src/ or scripts/; scratch rigs lived in a temp folder.

## Verdict

**Approve with fixes.** P0: 0. P1: 1. P2: 5. P3: 7 (plus 1 fixed during review).

The author's claims hold up when re-run. Chaining, skip and stop rules, cancel, password stripping and zero uploads all work on real files. The P1 is data loss when two tabs are open. The main P2s are storage robustness (corrupt data white-screens the app, a version bump wipes the list), readiness that does not match the run after a page-count change, keyboard focus loss, and a "links kept" gate that passes without testing anything.

## Findings

| # | Sev | File:line | Problem | Failure scenario with evidence | Fix |
|---|---|---|---|---|---|
| 1 | P1 | `src/tools/v2/automate.jsx:386` (`mine: loadSaved()` once at import), `:140-146` (save on change), `src/lib/automate.js:158-162` (whole-list write) | Two tabs overwrite each other's automations. There is no `storage` listener and no merge before a write. | Rig, one browser context, two tabs on `#/automate`. Tab A creates "From tab A": storage holds `[From tab A]`. Tab B creates "From tab B": storage holds `[From tab B]`. Reload A: its own rows are `['From tab BNo steps yet']`, so A's automation is gone. A deleted automation comes back the same way. | Before each write, re-read storage and merge by id (keep tombstones for deletes). Listen to `window` `storage` events for `swiss-automations` and refresh `o.mine`. Or store one key per automation. |
| 2 | P2 | `src/lib/automate.js:153` (options taken as-is), `src/tools/v2/automate.jsx:75` and `:394` (step `summary()` called during Shell render) | Saved step options are not validated. One bad value crashes the whole app (white screen, no error boundary). | Seed `swiss-automations` with a watermark step `{text:null}`, add aws-invoice.pdf, pick it. The page throws `Cannot read properties of null (reading 'trim')` and the body is empty: picker, files and Run are all gone. Other bad values don't crash but pass as ready: `nup {perSheet:'abc'}` enables Run, and `options: [1,2]` is accepted. Recovery exists but is hidden: the crash also fires when a file is added while the bad automation is picked. After a reload the default pick is safe again, but picking the bad one with a file selected crashes again. To delete it, the user has to reload, choose Select none, pick it, then delete (verified). | In `loadSaved`, keep only keys that exist in `tool.defaults` with the same type or array-ness. Wrap the per-step `summary()` in try/catch and show "This step's settings are damaged. Remove it or reset it." |
| 3 | P2 | `src/lib/automate.js:145`, `:152` | Schema migration loses data. Any `v !== 1` gives `[]`, and the next save overwrites the stored list. Steps with an unknown tool id are dropped silently, and the next save persists the loss. That also makes the "This tool is not available as a step" branch (`automate.jsx:62`) unreachable for saved data. | Code path. A future v2 build that is rolled back, or a step tool renamed or removed, wipes the user's automations or quietly shortens them on the next keystroke anywhere in the editor. | On a version mismatch, do not write (or back up the raw value under a second key first). Keep unknown steps in the list, flagged with the existing problem line, so the user decides. |
| 4 | P2 | `src/tools/v2/automate.jsx:74-77` (readiness from the original files), `src/lib/automate.js:260-261` | Readiness is checked against the original files, but the run checks against the current file. A chain that the panel calls ready stops at run time, with a message the user cannot act on. | Custom chain on pdfjs-tracemonkey.pdf (14 pages): N-up 4 per sheet, then Stamp with pages `3-8`. Summary says `ready: true, "2 steps on each of 1 PDF: N-up, Stamp."`. The run fails: `pdfjs-tracemonkey.pdf: step 2 of 2, Stamp: Fix the page ranges first.`. The ranges look fine in the editor, because they are checked against 14 pages. | Name the cause at run time ("pages 3-8 do not fit the 4 pages this file has after step 1"). In the editor, check range options only for steps before any page-count-changing step (nup, booklet, removeblank, singlepage), or add a note that ranges apply to the file as it is at that step. |
| 5 | P2 | `src/tools/v2/automate.jsx:241-246` | Keyboard reorder loses focus, and moves are not announced. | Focus "Move up" on step 2 and press Enter: the step moves to the top, its Up button becomes disabled, and `document.activeElement` is `BODY`. A keyboard or screen-reader user is thrown back to the top of the page. The only `aria-live` region holds the shell line. | When the moved button becomes disabled, move focus to the other arrow (or to the step toggle). Announce "Compress moved to step 1 of 3" in a polite live region. |
| 6 | P2 | `scripts/corpus-test/cases-automate.mjs:115`, `:122-124` | The "links kept" check is vacuous. Every row it runs on has no links. | `docs/test-results/review-automate.json`: the "links kept" detail is `0 -> 0 links` on tracemonkey, aws-invoice, irs-fw9 and tracemonkey_with_annotations. The claim itself is true: my rig ran Clean copy on `reports/arxiv-1706.03762-attention.pdf`, and MuPDF found 113 links -> 113, 18 external -> 18, 0 unresolved, 0 target differences page by page. The gate just doesn't cover it. | Add the attention paper as a tpl-share row. Compare link targets (URI and resolved page) in and out, not only the count. |
| 7 | P3 | `scripts/corpus-test/cases-automate.mjs:241-245`, `scripts/corpus-test/automate-ui.mjs:173-181` | Both cancel tests fire during step 1 (Auto rotate), never inside OCR. "Stopped soon after Cancel" measures total run time, not time from cancel. | Corpus row: 4004 ms total with cancel at 4000 ms, while Auto rotate takes about 17 s on that file. Separately verified in my rig: with Cancel 3 s into "step 1 of 2: OCR" on lincoln, the job rejected as cancelled about 9 ms later. | Add a row that waits for the `OCR` label, then cancels and times from cancel. |
| 8 | P3 | `scripts/corpus-test/cases-automate.mjs:150-155` | 1 of 3 scan rows never runs OCR (fax-jean-schmidt-doe: `skipped: Every page already has a text layer`). "OCR added words" is soft. | Rows can pass with OCR never running. That happens here on 1 of 3 files. | Swap in a scan with no text layer, or make "OCR done" hard on at least 2 rows. |
| 9 | P3 | `src/lib/automate.js:153` | Duplicate step uids from storage are kept. Editing, opening and removing work by uid, so two steps act as one. | Seeded two steps with uid `d` (Compress, Repair): accepted, Run enabled. Changing one step's options writes both (code path in `setStepOptions`). | Re-uid duplicates in `loadSaved`. |
| 10 | P3 | `src/tools/v2/automate.jsx:241-247` | Arrow and remove buttons for two steps with the same tool get identical names. | Chain Repair, Compress, Compress: Up labels are `['Move Repair up','Move Compress up','Move Compress up']`. | Include the position: "Move step 3, Compress, up". |
| 11 | P3 | `src/lib/automate.js:282`, `:308` | A step that changed nothing is reported as done, and the note says "All 5 steps done". | xref_command_missing.pdf through Clean copy: Flatten says "Nothing to flatten, the file is unchanged.", Remove annotations says "Nothing to remove", Compress says "kept the original". All are `status: done`, and the file note reads "All 5 steps done." | Count output bytes equal to the input, or a tool's "unchanged" note, as "no change". |
| 12 | Fixed during review | `src/tools/v2/automate.jsx:378-409` vs `docs/design/tool-contract.md:71`, plan S3 "3-step run stepper" | The contract says Automate shows 1 Automation, 2 Files, 3 Run, but the tool sets no `steps`, so the shell shows Files first. | `automate.jsx` changed while this review was running: it now sets `steps` (line 387), and the panel shows "1 Automation, 2 Files, Run" (UI rig). Line numbers above may have shifted by about 1. | Add `steps: [{ id: 'options', title: 'Automation' }, { id: 'files' }]`. |
| 13 | P3 | `src/lib/ocrOps.js:242` (HAS_TEXT 30) inside chains | OCR after Page numbers or Stamp reads the stamped text again, so the text layer gets the words twice. | Chain Page numbers, Stamp "APPROVED {date}", OCR (skip) on sub-ndl-konoye-p1: OCR read 30 words vs 20 alone, and the output has 3 hits for `APPROVED|Page` on a 1-page file. | Show a hint when OCR follows a text-adding step ("put OCR first"), or warn in the step problem line. |
| 14 | P3 | `src/lib/automate.js:38-42` | Permissions and Protect are both last-only, so a chain cannot have both. | Design limitation. Protect's Advanced mode covers the use case. | Mention it in the Permissions step help, or allow Permissions before Protect. |

## Verified OK (with evidence)

- **19/19 corpus rows**: `npm run test:corpus -- --tool automate --name review-automate` gave 19 pass, 0 fail, 1.7 min. Report: `docs/test-results/review-automate.md`.
- **`node scripts/corpus-test/automate-ui.mjs --no-shots`**: all checks PASS, including 390 with no horizontal scroll, blocked storage, delete, reload, no off-origin requests, and only GET/HEAD with no bodies (3161 requests). Medians: share 3.1 s, mail 1.5 s, scan 18.8 s, draft 2.0 s, archive 2.0 s.
- **Each step gets the previous output; page counts follow**:
  - N-up 4 then Page numbers on tracemonkey (14 pages) gives 4 pages, "Page 1 of 4" through "Page 4 of 4".
  - Metadata "set" Title after two skipped steps: Title set, Producer kept.
- **Skip vs stop**:
  - No blank pages, and no landscape pages to rotate: both logged `skipped` and the chain goes on.
  - All steps skipped: status `unchanged`, `outputs: []`.
  - XFA form stops at step 2, Flatten, and the other 2 files come through (corpus and UI).
- **OCR skip**: a 32-character watermark before OCR does not make OCR skip the page (24 words read).
- **Protect, Permissions and Fast web view forced last**: in the UI (`Step 3, Protect: Move it to the end`) and in `runAutomation` via `stepProblem`.
- **Passwords never stored**: after a tpl-mail copy plus a run with password `Zq-Residue-9931`, the password was in none of localStorage, sessionStorage, `history.state` or any IndexedDB store. The stored protect step holds only `mode, deny, keyLength`.
- **Cancel**:
  - UI: Cancel during Auto rotate stops in 124 ms and the file stays at v1.
  - Rig: Cancel inside OCR rejects as cancelled about 9 ms after the call.
- **Links**: attention paper, 113 links with identical targets after Clean copy (finding 6 is about the test, not the tool).
- **Broken and locked inputs**:
  - Fuzzed poppler files are rejected at intake ("Not a valid PDF").
  - xref_command_missing.pdf runs through Clean copy and Long-term copy.
  - Password files stop at intake.
  - `filesForRun` without `accepts.locked` skips locked workspace files (code).
- **Memory, main thread**: 19th-century-young-man-57MB.pdf (57.4 MB) through Clean copy. Backing store went from 65 MB to 122 MB while holding the 57.4 MB output, with a sampled peak of about 247 MB, so intermediates are freed. Same pattern on llama2 (13.7 MB) through Clean copy. Backing store went from 21 MB to 34 MB after the run while holding the 13.2 MB output, so intermediates are freed. The sampled peak was about 85 MB. `countPdfPages` destroys its pdf.js task, so step checks do not pin copies.
- **XSS**: automation name `<img src=x onerror=...><script>...` renders as text: `window.__x` and `__y` stay undefined, with 0 `img` in the picker. The output name is slugged.
- **No unlisted "nothing to do" throws**: a sweep of `throw new Error` in every step tool's run() and in its lib ops found only the 3 messages in `NOTHING` (OCR, Remove blank pages, Rotate), plus Fast web view's "would grow", which is a real stop. The other tools return unchanged bytes with a note (see finding 11).
- **Network**: 0 external requests in every rig run.

## Not verified

- Worker memory (ops worker, pdf.js worker, Tesseract), and the 104 MB file.
- Real quota-exceeded behaviour. Only the injected throw from the UI script was tested.
- Firefox and Safari, real touch devices, screen-reader output.
- Visual design critique.
- Note: the `docs/design/screens/S3/*.png` files have a 03:28 timestamp. My UI run used `--no-shots`, so another process wrote them.

## Round 2 (re-check of the fixes, 2026-10-27)

**Verdict: approve.** P0: 0. P1: 0. The P1 and all five P2s are fixed and I re-ran their repros. Three P3s are new, none blocking.

### Repro reruns

| Round 1 finding | Re-check | Result |
|---|---|---|
| 1 Two tabs wipe each other (P1) | Same scratch repro: tab A creates "From tab A", tab B creates "From tab B". | Fixed. Storage holds both, A shows both straight away (storage event) and after a reload. |
| 2 Corrupt options crash the app (P2) | Seeded watermark `{text:null}`, a file selected, picked it. | Fixed. Panel stays, 0 page errors. The bad value falls back to the default (see R2-1). |
| 3 Version and unknown tools (P2) | Seeded `{oops` (not JSON), `v:2`, and an unknown tool plus duplicate uid. | Fixed. Not JSON: backed up to `swiss-automations-unreadable`, then a fresh list. `v:2`: never written, with the message "saved by a newer SwissPDF... Changes made here are not saved". Unknown tool: kept, and Run is blocked with "Step 1, zzz: This tool is not available as a step here...". Duplicate uid: re-issued. |
| 4 Ranges after a page-count change (P2) | N-up 4 then Stamp `3-8` on tracemonkey. | Fixed as specified. It still stops at run time, but now says why: "...Fix the page ranges first. After the earlier steps pdfjs-tracemonkey.pdf has 4 pages, not 14." |
| 5 Keyboard focus (P2) | Enter on "Move up" until the step is at the top. | Fixed. Focus moves to "Move step 1, Repair, down" (not BODY), and the live region says "Compress moved to step 2 of 3.". |
| 6 Links row vacuous (P2) | Corpus row `s3-share-arxiv-1706-03762-attenti`. | Fixed. "113 -> 113 links", same targets. |
| 7-10, 11, 14 (P3) | Corpus and UI. | Fixed. Cancel inside OCR is its own row (0 ms after Cancel). konoye and Lincoln OCR is now a hard check. Labels are "Move step 2, Compress, up". "No change" status shows. |

### Commands

- `timeout 900 npm run test:corpus -- --tool automate --name review-automate-2`: **21 pass, 0 fail**, 3.9 min (adds the attention links row and the OCR cancel row).
- `timeout 900 node scripts/corpus-test/automate-ui.mjs --no-shots`: see the UI line at the end of this section.
- XSS re-check: name with `<img onerror>` and `<script>` still renders as text.

### New edge cases on merge-by-id (scratch rig, two tabs, one context)

- **Delete in A while B has the same automation open**: the delete reaches B through the storage event. B's list drops it and B falls back to the first built-in. Storage and both tabs agree.
- **Race, delete in A and an edit in B at the same moment**: delete wins in storage and in both tabs. B's edit is lost, which is fine because B was editing a deleted item.
- **B has a password typed in a Protect step, A renames the same automation**: B gets the new name and keeps the typed password (Run stays enabled). The password is not in storage.
- **Concurrent rename, both tabs typing into the same name field**: see R2-2.

### New findings

| # | Sev | File:line | Problem | Failure scenario with evidence | Fix |
|---|---|---|---|---|---|
| R2-1 | P3 | `src/lib/automate.js:141-157` (`cleanOptions`) | Bad saved values are dropped silently and replaced by the tool's default, and the step shows as ready. | Seeded watermark `{text:null}`: live line "1 step on each of 1 PDF: Watermark." The run would stamp the default "CONFIDENTIAL" with no word to the user. The new "Reset this step" only shows when the user opens the step. | When `cleanOptions` drops a key, flag the step ("Some settings could not be read and were reset: text"), at least as a hint line. |
| R2-2 | P3 | `src/tools/v2/automate.jsx:215-241` | Two tabs typing into the same automation's name interleave letters. Every keystroke saves, and the other tab adopts it mid-typing. | A types "enamed by A" and B types "eworked by B" at the same time into "R". Both tabs and storage end with `eworkRde db yb A B`. Consistent, but garbled. One user is very unlikely to do this. | Save the name on blur or debounce (300 ms), or skip adopting a remote change for the field that has focus. |
| R2-3 | P3 | `src/lib/automate.js:377-380` | A step whose note matches `NO_CHANGE`, but whose bytes differ, is passed on without `assertValid`. The regex on note text is also fragile: a future note like "3 fields flattened, 2 left unchanged" would be logged as "No change". | Code path. Sanitize "Nothing found to remove." can return re-saved bytes, which go to the next step unchecked. A broken file would be caught by the shell's final check, but blamed on the wrong step. | Run `assertValid` whenever the bytes differ. Let tools return an explicit `unchanged: true` instead of matching note text. |

### Not verified in round 2

- Storage events while the Automate panel is closed (on another tool). From the code, `refresh()` on mount re-merges.
- The quota-full path with real storage.

UI line: `automate-ui.mjs --no-shots` gave **46 PASS, 0 FAIL**, exit 0, with no request carrying file data (3683 requests checked). It includes the new two-tab, damaged-automation and focus checks. Run-to-result medians were about 2-3x round 1 (share 8.7 s, scan 46 s), because my rigs ran on the same machine at the same time. They are not a regression signal; re-time on an idle machine if needed.
