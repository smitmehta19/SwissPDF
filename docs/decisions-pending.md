# Decisions pending

## Needs Smit
(none)

## Decided
- 2026-10-27 (Smit): go-ahead to deploy; "everything deployed, full and final" = polish batch plus edit existing text (plan `docs/plans/2026-10-27-edit-existing-text.md` approved).
- 2026-10-27 (polish C, accepted): restricted outputs are re-encrypted AES-256, no open password, random owner password, same /P; a merge of several restricted inputs takes every restriction of any of them; revision-2 originals get forms/accessibility/assemble allowed. Offline precache costs about 21 MB on the first visit.
- 2026-10-27 (polish A, accepted): both Undo buttons confirm; Merge shows size only (no "% smaller"); a no-op run (byte-equal output or `unchanged` flag) makes no new version; the "replaces your files" warning shows on desktop only (phone sees it on the result screen); conversions to PDF keep their source files.
- 2026-10-27 (Smit): Edit PDF must edit text already in the PDF, not only add on top. Un-parked: research now, plan for OK, build after the polish batch.
- 2026-10-27 (my call): restricted (owner-only) PDFs keep their permission flags on output, re-encrypted with a random owner password; result note says so.
- 2026-10-27 (my call): offline made real: service worker caches app shell + engines so a new tab works offline after the first visit.
- 2026-10-27 (Smit): delete the old agent worktrees under `.claude/worktrees/` after the deploy.
- 2026-10-27 (my call, privacy rule): a PDF opened with a user password is decrypted in memory only; the workspace stores the encrypted original, and after reload the password is asked again (blind review P0).
- 2026-10-27 (my call): keep "result replaces its inputs as a new version" (Stirling model) but make it visible: result note names replaced files, Undo dialog lists every file it restores, nothing auto-selected after reload.
- 2026-10-27 (my call): "Edit existing text" stays parked (U5-D), as in the approved plan, although the blind review flags it as a gap.
- 2026-10-27 (my call, reversible): Remove blank pages measures ink against each page's paper tone; default threshold 30 (Stirling 10, different meaning). Caught exactly the 16 real blanks in the Lincoln scan.
- 2026-10-27 (my call, reversible): Sanitize on a dynamic XFA form keeps the form and strips only its scripts; Flatten and Remove form fields refuse with a clear message.
- 2026-10-27 (my call, reversible): Protect defaults to AES-256 (Stirling 128); Auto rotate confidence threshold 2 (Stirling 14, which turned no real fax page).
- 2026-10-26: Layout stays as is (no rail / left library / right tools). Revisit only if the blind review says the layout is bad.
- 2026-10-26: Home page out of scope; app only.
- 2026-10-26: Deploy to GitHub Pages after the blind review passes (commit + push).
- 2026-10-18: G2 lands before U2 sign-off (critique must-fix 2).
- 2026-10-18: phone uses an Options bottom sheet with a sticky Run bar.
- 2026-10-18: Office HiFi stays default, but first use shows "Download engine (about 55 MB)" with a Quick option, never a silent download.
- 2026-10-18: design critique re-runs live (real browser, Playwright) after the fix batch; first pass was static only.
- 2026-10-17: Plan `docs/plans/2026-10-17-parity.md` approved; run units in order, U0 first.
- 2026-10-17: Licence AGPL-3.0 (required by MuPDF on a public repo); LICENSE added.
- 2026-10-17: Look = Stirling-style workbench + iLovePDF option patterns, own name/palette/icons.
- 2026-10-17: AI tools, multi-signer requests, URL fetch, mobile QR pairing out of scope (need servers, break local-only promise).
