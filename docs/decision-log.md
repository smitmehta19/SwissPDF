# Decision log

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
