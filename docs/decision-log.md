# Decision log

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
