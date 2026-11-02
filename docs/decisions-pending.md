# Decisions pending

## Needs Smit
- 2026-11-02: OK to build edit text unit D (multi-line select) as planned in `docs/plans/2026-11-02-edit-text-multiline.md`? 1.5 to 2.5 days, high risk; hyphen inside the range refused in v1.

## Decided
- 2026-10-29 (my call, per the logged rule): review 3 found a P0 in paragraph re-wrap ("Trace-Monkey" printed mid-line) plus 3 paragraph P1s. Paragraph editing is hidden (code kept behind a flag, parked with its findings); word/line edits, RTL, the leak fixes and the UI fixes ship.
- 2026-10-29 (my call, replaces the box-cleanup call below): Redact boxes clean the page only, as before. Guessing terms from box contents renamed a form field and changed the title (review 3 P1-2). The result says to use Search to also clean properties and other places.
- 2026-10-28 (my call, privacy, REVERTED 2026-10-29): Redact with hand-drawn boxes also cleans the boxed words (whole words) from document properties, XMP and other strings, like a search does.
- 2026-10-28 (my call): paragraph re-wrap gets one more round with a "reflow window" (only lines from the first changed line to the first line that ends on an original line end are redrawn; untouched lines are never redrawn). If blind round 3 still finds a P0 in paragraph mode, paragraph entry points are hidden, the rest ships (word/line, RTL, leak fixes), and re-wrap is parked with its findings.
- 2026-10-28 (my call): any text edit on a hybrid form drops the /XFA copy (else the old text stays readable in it); the UI says so.
- 2026-10-28 (my call, reversible): edit-text P2 #4: paragraphs squeeze to 85% before refusing; single line edits keep the 60% floor (85% refused real edits on tracemonkey and the aws invoice). P2 #2: bold text with no bold fallback face gets a light synthetic bold (fill + thin outline) instead of shipping extra bold Noto files.
- 2026-10-28 (Smit): "build this": edit-text phase 2 (paragraph re-wrap, RTL reflow) plus the 6 open P2s. Plan `docs/plans/2026-10-28-edit-text-phase2.md`; deploy on a green gate.
- 2026-10-28 (my call, reversible): phase 2 leaves out vertical text and changing font/size/colour (parked); a paragraph that no longer fits uses free space below, then squeezes to 85%, then refuses; nothing below is pushed down.
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
