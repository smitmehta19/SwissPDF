# Decision log

## 2026-11-01 - Edit text: long lines spill onto new lines, emptied lines close up
- Decision: a single line edit that would pass its paragraph's edge, be squeezed, or be refused for room is laid out again on that row only, onto new lines below it; later rows of the paragraph move down whole (same glyphs, spacing, justification). An emptied line moves the rows below up. When the spill is not possible (no blank space below, link/highlight/underline on a moved row, RTL, centred, a word wider than the column) the edit runs exactly as before; a 'no-room' refusal then reads "No room below this paragraph...". A "Keep on one line" button redoes the edit the old way.
- Problem that prompted it: Smit: long edits should go onto the next line and the section should grow; a deleted line should not leave a gap.
- Why this was chosen: no existing word is broken again, which is what made paragraph re-wrap fail 3 review rounds; reuses the paragraph engine's exact redraw, blank check and drawing.
- Alternatives rejected: full re-wrap (parked); refusing whenever a spill cannot be done (would refuse edits that apply today).
- What changed in the approach, and how: `spillPlan` + `editPage` decide hook + `editParagraph` spill mode (`spillLayout` in editParagraph.js); paragraphs for a spill keep hyphen breaks (no hyphen lookup); links now count as annotations for the blank check.
- Impact and reversibility: reversible (`editText` option `spill: false`, the UI's Keep on one line).
- Status: built; review round 1 found word mix-ups (whole-paragraph diff), a ligature misprint, a ragged justified line, lost opacity: all fixed in fix round 1 (word map from the edited line only, no re-encode on moved rows, one drawing state per paragraph). Review round 2: copied text merged words after a wide glyph (free-fiber "Euros −B"); fix round 2 draws the spill on a scratch page first and falls back unless the words read back the same.
- Assumptions: moved rows are drawn from their own bytes or by glyph id only. (First build drew ligature words as letters; review found that printed "undefiined" in one font, so that path is off for spills.)
- Open questions / low confidence: moved rows are drawn after the page content when the inline insert fails (copy order).
- Cost impact: none.
- What failed: first layout re-packed the edited line looser than the source (justified gaps), pushing a word down; fixed by using the line's own tightest gap.
- Versions pinned: n/a

## 2026-11-01 - Paragraph re-wrap parked; edit-text phase 2 ships without it
- Decision: hide paragraph editing (flag `PARAGRAPH_EDIT = false` in `edittext.jsx`, model read with `{ paragraphs: false }`); ship word/line edits, RTL line push, leak fixes and UI fixes.
- Problem that prompted it: paragraph re-wrap failed 3 review and blind-test rounds; each fix moved the damage to untouched words (hyphens, ligatures, justify, column merge). Review 3 still had a P0 ("Trace-Monkey" printed mid-line).
- Why this was chosen: logged convergence rule (one more round, then hide); credits and time; the rest of the release closes live leaks (structure tree, XFA copy) and should not wait.
- Alternatives rejected: a 4th paragraph round (not converging); shipping re-wrap with known P0 (changes words the user did not touch).
- What changed in the approach, and how: re-wrap code stays behind the flag with its own corpus rows (harness passes `{ paragraphs: true }`); open findings listed in `docs/team/status-engine.md` "Parked: paragraph re-wrap".
- Impact and reversibility: fully reversible (one constant); triple-click now edits the whole line.
- Status: done, pending deploy.
- Assumptions: word/line paths are unaffected by the paragraph code when the flag is off (row `edittext-word-p3g6-pdfjs-tracemonkey`).
- Open questions / low confidence: whether a PDFium-style text-object rewrite would make re-wrap tractable later.
- Cost impact: n/a (no money).
- What failed: whole-paragraph redraw, then windowed redraw with hyphen heuristics.
- Versions pinned: n/a

## 2026-10-28 - Edit existing text: remove and redraw with MuPDF
- Decision: edit text in place by removing the word's glyphs with MuPDF text-only redaction and redrawing the new text in the original font when the file already draws every needed letter with it, else a standard font (Latin, keeps bold/italic) or Noto (other scripts); the rest of the line moves right.
- Problem that prompted it: Smit: Edit PDF must change text already in the PDF, not only add on top.
- Why this was chosen: prototype on 44 real edits: 0 pixels changed outside the edit, old word gone 44/44, original font kept 27/44, 8 ms to 1 s per edit; reuses redaction code and fonts.js.
- Alternatives rejected: rewriting content-stream strings in place (same result, much more code); PDFium like Stirling (a third PDF engine).
- What changed in the approach, and how: new `src/lib/editTextOps.js` (page text model + editText), worker ops, Edit PDF "Edit text" mode (`edittext.jsx`).
- Impact and reversibility: reversible (new mode, old Add mode kept).
- Status: built, in review.
- Assumptions: a letter counts as present in a subset font only if the file already draws it with that font.
- Open questions / low confidence: paragraph re-wrap, right-to-left reflow and vertical text are phase 2.
- Cost impact: none.
- What failed: two-byte codes in simple fonts drew garbage; MuPDF truncates font names at 31 chars (match full name first); fallback via full pdf-lib reparse was 5.8 s (now a grafted form XObject, 0.9 s).
- Versions pinned: mupdf 1.28.

## 2026-10-26 - Stirling parity: app only, keep layout, deploy at the end
- Decision: copy Stirling's tools, options and flows into the current SwissPDF layout; no rail/left library/right tools, no home page; deploy after the blind review passes.
- Problem that prompted it: Smit asked to replicate stirling.com; live teardown (`docs/research/2026-10-26-stirling-site-rea.md`) showed their web app uploads files to their server.
- Why this was chosen: Smit's call; layout revisited only if the blind review says it is bad.
- Alternatives rejected: full layout switch (S2 items 1, 9), home page (S4).
- What changed in the approach, and how: worktrees G2, U5-A, U5-B reset onto 09146c6 with only owned files restored (backup in session scratchpad), finished in parallel; small new tools assigned to the agent owning that area.
- Impact and reversibility: reversible, nothing committed until deploy.
- Status: building.

## 2026-10-26 - G2: Protect key length, auto rotate threshold, Tesseract self-hosted
- Decision: Protect offers AES 256 (default), AES 128 and RC4 40 like Stirling's keyLength, but defaults to 256 (Stirling: 128). Auto rotate uses Tesseract OSD with a confidence threshold of 2 (Stirling: 14) and turns unclear pages like the confident majority. Tesseract worker, core and language data load only from our origin.
- Problem that prompted it: Stirling parity for options; review finding #9 (OCR code and models from jsDelivr, no integrity check).
- Why this was chosen: AES-256 opens in every current reader and is what SwissPDF promised before. Threshold measured on the 3 real scans turned 0/90/180/270: wrong reads reach 1.0 (Lincoln letters); at 14 neither fax page (2.2 to 5.5) would turn. Fax page 1 reads the right way at only 0.3 to 0.4 and is fixed by "turn unclear pages like the rest"; with that off it stays sideways.
- Alternatives rejected: SHA-pinning the CDN files (still a third-party request with page images nearby); committing the 9 MB worker/core copies (drift from node_modules).
- Impact and reversibility: reversible. Handwritten vertical Japanese (Konoye) is not turned at threshold 2 (OSD 0.4 to 1.2): reported as "too little text to tell".
- Status: built in the G2 worktree, pending merge.

## 2026-10-17 - LibreOffice engine pinned by content hash
- Decision: engine files from `zetaoffice_latest` are hash-checked (SHA-256, build efaf0670b4d0) before running; mismatch = clear error, Quick mode still works.
- Problem that prompted it: CDN has no versioned URL; an upstream change could break conversions or run unreviewed code next to documents.
- Why this was chosen: only way to pin without self-hosting; safe failure.
- Alternatives rejected: unpinned latest (unsafe); self-hosting 162 MB wasm in git (too big).
- What changed in the approach, and how: page fetches + verifies files, caches in Cache Storage, feeds engine via blob URLs; engine runs in a hidden iframe so it can be killed and restarted on hang.
- Impact and reversibility: reversible; HiFi stops when ZetaOffice updates until hashes are bumped.
- Status: built (U4-I), pending merge + review.
- Assumptions: download about 53 MB compressed (old "200 MB" label was wrong).
- Open questions / low confidence: self-host engine from the deploy workflow (parked).
- Cost impact: none.
- What failed: about 30 versioned URL patterns probed, none exist.
- Versions pinned: ZetaOffice 24.2 build efaf0670b4d0 (2025-05-13).

## 2026-10-17 - Page ops: pdf-lib object-level rebuild, qpdf-wasm rejected
- Decision: merge/split/extract/remove keep structure via pdf-lib object copier + own rebuild of outlines, dests, AcroForm, page labels, OCProperties.
- Problem that prompted it: copyPages dropped all bookmarks, forms and link targets.
- Why this was chosen: tested on real files: pdf-lib rebuild kept 69/69 bookmarks, 487/487 links, 549/549 fields; qpdf duplicated fields (819 names over 421 widgets), failed on broken xref, and its wasm runtime dies after any error; MuPDF graft kept nothing.
- Alternatives rejected: qpdf-wasm (neslinesli93), MuPDF graftPage.
- What changed in the approach, and how: src/lib/pdfOps.js only, no new deps.
- Impact and reversibility: reversible (one file).
- Status: built (U1 Dev D), pending merge + review.
- Assumptions: n/a
- Open questions / low confidence: structure tree, attachments, document JS, XFA not kept.
- Cost impact: none.
- What failed: qpdf-wasm as above.
- Versions pinned: n/a

## 2026-10-17 - Real-world corpus becomes the quality gate
- Decision: test every tool on 131 real public files (`test-corpus/`, gitignored, rebuilt by `scripts/fetch-test-corpus.sh`) via a Playwright runner; Health self-test is smoke only.
- Problem that prompted it: tools pass on generated samples but fail on real PDFs (encrypted, rotated, damaged, CJK, scans).
- Why this was chosen: only real files expose the failure classes in the audit and Stirling's issue tracker.
- Alternatives rejected: more generated fixtures (miss real quirks).
- What changed in the approach, and how: each unit's done = its corpus rows green.
- Impact and reversibility: test-only, fully reversible.
- Status: proposed (U0).
- Assumptions: public files are fine for local testing; not redistributed.
- Open questions / low confidence: IPCC report redistribution terms unclear (local use only).
- Cost impact: none.
- What failed: n/a
- Versions pinned: n/a
