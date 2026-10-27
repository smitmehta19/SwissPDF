# Redaction leak fix, round 2: independent QA re-review

Date: 2026-10-27. Scope: the current `git diff HEAD` of `src/lib/redactOps.js` (1201 lines), `src/lib/formOps.js`, `src/tools/v2/redact.jsx`, `scripts/corpus-test/validate.mjs` and `scripts/corpus-test/cases.mjs`, in the main tree. Round 1 is in `2026-10-27-redact-fix-review.md`.

## Verdict: reject (2 narrow blockers; the rest is approved)

All 14 round-1 findings are fixed, or documented where that is acceptable (#11, the gap width, is still open as P2). I re-ran every round-1 attack against the current code, and none of them recovers anything. The author's 5 "script bug" claims are correct. Fresh attacks found 2 blockers, both small to fix. (1) A shading painted inside a clip (the normal way gradients and gradient meshes are drawn) survives in full under a box in remove mode. (2) Text hidden by an OCMD is not found by search. Everything else in the round-2 work holds. There are also some P2/P3 items, including one case where pruning loses data on a page that was not hit (Type3 fonts) and large scanned books failing from running out of memory.

P0: 2 · P1: 0 · P2: 4 · P3: 4

## Findings

| # | Sev | Location | Problem | Failure scenario (evidence) | Fix |
|---|---|---|---|---|---|
| 1 | P0 | `src/lib/redactOps.js:535-588` (shapesUnder: no `fillShade`), `:685-690`; checker `validate.mjs` underBoxes | A shading painted with `sh` inside a clip (`re W n ... sh`) survives remove mode in full under a box. MuPDF only cuts the box out of an unclipped `sh`. The fallback check has no shading hook, so the page is not turned into an image, and the corpus checker has no shading hook either. Same class as round-1 #6 (pattern images): content under a box stays intact. | (a) Synthetic `shading-sh`, an axial shading clipped to 200x100 pt with a box over it: with the overlay stripped, 20000 of 25056 px under the box are still painted, the same as the input. (b) A type 4 mesh (2 triangles with red, green, blue and yellow vertices, a small "picture") clipped the same way: 17852 of 17852 coloured px inside the box come back, and with a box over only the middle 4599 of 4599 do. `raster []` every time, and `redactionLeaks(..., { boxes })` returns `[]`. Control: the same mesh unclipped is cut correctly (0 px left). Gradient-mesh artwork (types 6-7) is written exactly this way. | Add `fillShade(shade, ctm)` to the shapesUnder device: if `shade.getBounds(ctm)` overlaps a box, rasterize the page. Add the same hook to `underBoxes`. |
| 2 | P0 | `src/lib/redactOps.js:1141-1147` (showAllLayers), `:229-240` | `showAllLayers` only turns on OCGs. Content behind an OCMD with `/P /AllOff` (or `/AnyOff`, or a `/VE` expression) is hidden when every layer is on, so search never finds it and remove mode leaves it. A manual box over it does remove it, and image mode drops it. | Synthetic `ocmd`: "Draft note SECRETNAME private" under `/OC` -> OCMD `/OCGs Base /P /AllOff`, with Base ON. Search finds 1 match (only the visible line). After remove, the content stream still has the hidden line, and text extraction with OCProperties removed reads it. The corpus `leakCheck` does flag it (`"secretname" in obj 7 stream`), so a row would catch it, but no row has an OCMD. This is the search half of round-1 #7, rated the same way: the matched term stays readable in the file. Plain hidden OCGs are now found and removed (verified); only OCMD policies slip through. | For search and remove, open a copy with `/OCProperties` deleted, or with every `/OC` BDC treated as visible. Simplest: delete `/OCProperties` on the working doc while searching and redacting, and restore it before the picture and the save. |
| 3 | P2 | `src/lib/redactOps.js:861-917` (pruneResources), `:390` (NAME_OPS) | Pruning keeps only names that the page and form streams use. A Type3 font without its own `/Resources` draws its glyphs with the resources of the page that uses it (PDF spec), and those names are never collected. On pages that share resources with a hit page, glyphs that use an XObject or image lose it. This is data loss on a page the user never marked. | Synthetic `t3prune`: one shared Resources dict. Page 1 has the hit text. Page 2 draws Type3 glyphs whose CharProc does `/Dot Do` from the page resources. After the redaction (both methods), page 2 renders 0 dark px instead of 2304, and MuPDF logs "cannot find XObject resource 'Dot'". This is rare in modern files: TeX bitmap Type3 fonts use inline images, and those are unaffected. | When collecting names, also parse the CharProcs of every used Type3 font that has no `/Resources`, or keep every entry that a Type3 font without resources might need. Alternatively, skip pruning for non-hit pages and only drop the hit page's own unused entries. |
| 4 | P2 | `src/lib/redactOps.js:741-785`, `:1177-1184` | Many raster pages in one job exhaust WASM memory. Each page adds an image of up to 25 MP and nothing is flushed. The job then dies with the misleading "Failed to decode JPX image" and produces no output. It fails closed, so there is no leak. Remove mode also falls back to an image on many OCR-scan pages: characters of the neighbouring words still sit inside the padded boxes, and that fallback is correct. | `large/explorations-bible-lands-956pp-62MB.pdf`, search "the" (838 hit pages), remove: throws at the 46th hit page (page 58) after 55 s with rss 2.5 GB. Page 58 alone succeeds (rasterized; leftovers "ofaof...in"). Image mode (all 838 pages rasterized): throws at the 268th hit page (page 293) after 309 s with "malloc (30680958 bytes) failed", rss 2.3 GB. Page 293 alone succeeds. | Save incrementally or in batches (for example write and reopen every N raster pages), compress the image when it is added (JPEG for scans), lower the scale for pages that are already scans, and turn an out-of-memory failure into a clear message ("too many pages to redact at once, split the file"). |
| 5 | P2 | `src/lib/redactOps.js:377-382` (MuPDF `REDACT_TEXT_REMOVE`), copy at `redact.jsx:190` | The remove-mode gap keeps the exact advance width of the removed text, now documented in the code. The remove option's caption does not say so; only the image option hints at it. | `bdc-partial`: `(Signed by)Tj[-7501.0017]TJ (today)Tj`. Helvetica widths: " SECRETNAME " = 7501, an exact match. A same-width candidate ("SECRETNAMX") cannot be told apart, but everything else in a name list is ruled out. | Add a line to the remove caption ("the gap keeps the length of what was removed; use images for names"). Or replace the TJ gap with a fixed width and accept the reflow. |
| 6 | P2 | `src/lib/redactOps.js:993-1056` (scrubStrings); checker `rawScan` | Matches in name objects are never cleaned or checked: keys of the PDF 1.1 catalog `/Dests` dict, named destinations used as names (`/D /Name`), and state names. | Synthetic `namedests`: a catalog `/Dests` dict with the key `/SECRETNAME-chapter`, search SECRETNAME, remove. The name key survives in the output, and `redactionLeaks` returns `[]`. This form is rare (pre-1.2 style). | Rename matching name keys in `/Dests` (and the GoTo `/D` names that point at them) and the matching names in AP state dicts. Make the checker look at name tokens too. |
| 7 | P3 | `src/lib/redactOps.js:437-462` (stripPageMarkedText), `:956-987` | Every ActualText, Alt and E on hit pages is cut, not only the ones that hold or overlap the match, so text extraction and accessibility get worse on those pages. | `us-budget-2024.pdf` p23 after removing "Econ": the running head now extracts as "GROWING THe ... MIDDLe OUT" (small-caps glyph text) instead of "Growing the ... Middle Out". This is safe but lossy. | Strip only property lists whose marked span overlaps a box, or whose text matches. Keep the others. |
| 8 | P3 | `src/lib/redactOps.js:1196` | The output is saved without object streams, so files that used them grow a lot even when only one page is touched. | `us-budget-2024.pdf`, one hit page, remove: 2360 KB -> 10388 KB (4.4x). A plain MuPDF re-save without `objstms` gives the same 10389 KB. | Save with `garbage=compact,compress,objstms,encrypt=none` (as docOps does: i-9 810 KB -> 510 KB). |
| 9 | P3 | `src/lib/redactOps.js:792-833`, `:1031-1055`, `:1117-1128` | Walking every object number, free ones included, makes MuPDF print "format error: cannot find object in xref (N 0 R)" for each free slot. This is console noise in the worker, not a functional problem. | `rot90-cropbox-bert.pdf`, remove: 8 messages, all from inside `redactPdf` (none on open or search). | Skip free slots (check `isNull()` on the reference without resolving), or silence MuPDF warnings around the loops. |
| 10 | P3 | `src/lib/redactOps.js:229-240`, `:1155-1165` | A page tree with a loop and a wrong `/Count` makes both search and redaction throw "cycle in page tree" with no output. It fails closed. When the `/Count` is right, the loop is skipped and the output is clean. | Synthetic: the inherited-resources file with a self-looping `/Pages` node and `/Count` 3 or 4 (loop at the end or in the middle) -> throws. With `/Count 2` and the loop at the end: works, `deep []`, `leakCheck []`. | Catch it and say "This PDF's page list is damaged: run Repair first, then redact." |

## Verified OK (with evidence)

- **Corpus:** `npm run test:corpus -- --case "redact|forms" --name review-redact-2` gave 104 pass, 1 fail. The fail is the known `forms-fill-xfa-imm1344e`, failing since the baseline. 44 of 46 redact rows carry the raw check; the 2 without are the search-only `redact-find-split-*` rows. There are new leak rows for every round-1 finding (objr, replies, inherited, sharedPhoto, bdc, lineArt, pattern, hiddenLayer, carriers, free-fiber shared resources, us-budget ActualText), each in both methods.
- **The author's 5 script-bug claims are all true:**
  - `objr.mjs`: MuPDF `setRect` is in view space (y down). The FreeText bounds read back as `[300,600,500,640]`, so my box at y 142-202 missed it. With the box at y 590-650, both methods return `leaks []`.
  - `more.mjs`: the hits were the visible line "Agreement with SECRETNAME" outside the box. "Draft note" (the hidden line under the box) is gone in both methods.
  - `xfa.mjs`: it copied the old UI rule. `cleaned.xfaMatch` is now true for "Euler", and `redact.jsx:263` produces the output.
  - `under.mjs`: the x loop runs past the 334 pt page width. No round-1 finding rested on this.
  - `budget6.mjs`: the hits are on pages outside `pages:[23]`. Round-1 #4 rested on budget4 and budget5, which were valid then; budget5 is clean now.
- **Every round-1 atk script re-run, both methods** (deep scan: all objects, hex and UTF-16, every Form XObject drawn on a scratch page, OCGs forced on; plus an inflate of the raw bytes):
  - Real files, no hits: aws, flipkart, tracemonkey, rot90-cropbox-bert, pdf20-incremental-save, and the SECRETNAME synthetic.
  - Synthetic leaks, no hits: bdc (literal, hex and partial span, also inside BT), inherited and inherited-both, shared-res, carriers, hidden-ocg (search now finds 2), replies, reply-only, field2 (DV and TU gone), page /AF attachment (`cleaned.attachments 1`), CID shared form, shared photo (no red image left).
  - fw9 form-value row: deep scan `[]`, and the deleted widget is no longer in the file.
  - Pattern image: gone.
  - Line art: the page falls back to an image.
  - us-budget p23 "Econ": the page text no longer contains "Econ".
- **Fresh attacks that hold**, with 0 ink under the stripped overlay and no raster needed:
  - a QR-like single path of modules with the box inside its edge
  - a barcode drawn as one path, box over the middle bars
  - a rectilinear outlined word drawn as one path
  - text used as a clip (`7 Tr`) with a fill through it
  - a stencil image mask
  - Type3 glyph text
- **Pruning on real shared or inherited resources:** `invoices/free-fiber.pdf` shares one Resources dict over 2 pages. A hit on page 1 (VILLEURBANNE) or on page 2 (Juillet), in remove and in image mode, leaves the other page rendering identically (0 changed). `quirks/pdfjs-outline_goto_action.pdf` (both pages inherit resources) with a box on page 1: page 2 is identical, but it is blank, so this is weak evidence.
- **Shared Form XObject between a hit page and a non-hit page** (own resource dicts, the form also draws a logo image): page 1 loses the header name. Page 2 renders identically, mean diff 0.000 in both methods, and keeps its own text.
- **Non-hit pages unchanged** (render diff at 0.75x, annotations shown, threshold mean 0.05 or more than 20 px over 64): tracemonkey p1 and p4 hit (12 others checked, remove and image), us-budget p23 (183 others), rot90-cropbox p2 (15, both methods), fw9 p1 (5, both methods), flipkart. 0 changed pages, and page counts are equal. No sign of the MuPDF 1.28 resolve()/compact data loss.
- **Geometry** is unchanged from round 1: inside the boxes 100% black on rot90-cropbox, rot270-cropbox and rot180-origin, and in remove mode at most 0.003% of pixels outside the boxes differ.
- **formOps:** `stripXfa` is key-only, and `dropLooseObjects` sweeps the XFA streams (round-1 #14 fixed). fw9 23/23 widgets, flatten 23 -> 0; i485 730/730, flatten 730; f1040 199/199, flatten 199. 0 loose objects and 0 XFA streams in every output.
- **Checker:** the extended `redactionLeaks` now catches a CID header form left undrawn (`"secretname" in obj 9 form drawn`) and a widget kept only by OBJR with a hex AP (`obj 1058 /XObject stream`). Its gaps are shadings (#1) and name objects (#6).
- **Loops and size:** looping page trees with a correct `/Count` are skipped, and the output is clean. `911-commission-report.pdf`, "Commission", 295 hit pages, remove: find 4.3 s, redact 5.6 s, 0 raster pages, 2.4 MB -> 2.4 MB.
- **UI copy:** the remove caption now says a page that cannot be cleaned this way becomes an image. The summary warns that a search removes attachments.

## Not verified

- The UI in a browser, the Health check and `npm run build`. The run logic was checked by reading the code and by Node calls only.
- Patch meshes (types 6-7) were not built. Type 4 and axial were, and they behave the same, so 6-7 are expected to as well.
- Browser WASM memory limits for #4. Measured in Node only.
- Whether Acrobat applies pre-existing unapplied `/Redact` annotations differently. `applyRedactions` applies every Redact annotation on a hit page, including ones already in the input. Not tested.
- Real-world prevalence of OCMD-hidden text (#2) and of Type3 fonts that depend on page resources (#3).

## Repro (scratch, not in the repo)

Scripts are in `C:\Users\SMITME~1\AppData\Local\Temp\claude\C--Users-Smit-Mehta-OneDrive---SalesOptimize-Desktop-Data-Code-r-NEwCOde-ClaudeCode-SwissPDF\af85e6f0-a1c0-412d-bfc1-0d9738bfa4dd\scratchpad\atk\`:
- round-1 scripts, re-run as they were
- `objr2.mjs` and `more2.mjs`: corrected probes
- `fresh.mjs`: QR, barcode, outlined text, clip text, shading (#1), image mask, Type3
- `mesh.mjs`, `mesh3.mjs`: #1 mesh variants
- `nonhit2.mjs`: outline_goto
- `fresh2.mjs`: OCMD (#2), name-keyed Dests (#6)
- `shared2.mjs`: shared form between a hit and a non-hit page
- `t3prune.mjs`: #3
- `jpx.mjs`, `jpx2.mjs`, `why2.mjs` (with `redactCopy.mjs`, a scratch copy of redactOps that exposes the fallback reason): #4
- `nonhit.mjs`: non-hit pages unchanged
- `big.mjs`: 911 timing
- `loop.mjs`, `loop2.mjs`: #10
- `checker.mjs`: checker gaps
- `size.mjs`: #8

---

# Round 3 (2026-10-27, about 40 min budget)

Scope: the current `git diff HEAD` of the same 5 files (2027 insertions, 141 deletions), main tree, read-only.

## Verdict: approve

Both round-2 blockers are fixed. Every round-1, round-2 and new attack recovers nothing. The corpus passes apart from the known form row, and pages that were not hit are unchanged. What is left is P3.

P0: 0 · P1: 0 · P2: 0 · P3: 3

## Round-2 findings, re-checked

| R2 # | Status | Evidence |
|---|---|---|
| 1 shading under box (P0) | Fixed | `fresh.mjs` shading-sh: raster [1]. `mesh3.mjs` type 4 clipped, full and partial box: raster [1], 0 coloured px left (was 17852 and 4599). The new type 6 and type 7 Coons/tensor patch meshes, clipped and unclipped, box over the middle: raster [1], 0 px left. The checker now flags the unredacted input: "page 1: shading under a box". |
| 2 OCMD hidden text (P0) | Fixed | `fresh2.mjs` OCMD AllOff: search finds 2 (was 1), and the term is gone in both methods. New probes `ocmd2.mjs` (OCMD AnyOff, `/VE [/Not ocg]`, `/OC` on a Form XObject whose OCG is OFF): found 2 each, and `leakCheck []` in both methods. |
| 3 Type3 prune data loss (P2) | Fixed | `t3prune.mjs`: page 2 still has 2304 dark px in both methods (was 0). |
| 4 large scans out of memory (P2) | Fixed (subset) | `jpx3.mjs`: bible scan, search "the" over pages 1-150 (132 hit pages), remove: completes, all 132 pages turned into JPEG images, 163 s, 76 MB output (round 2 died at the 46th hit page). On scanned lincoln-ellsworth p1, remove gives a 816x1278 DCT image, the box is 100% black, and the page-1 originals (JPX and JBIG2 objects 187-189) are gone. Image mode on the same subset also completes: 132 of 132 pages, 164 s, 76 MB. |
| 5 gap-width caption (P2) | Fixed | The remove caption now says "The gap keeps the length of what was removed: for names, use images." The leak itself stays by design. |
| 6 name keys (P2) | Fixed | `fresh2.mjs` name-keyed `/Dests`: no hit in the output (deep scan, raw bytes). The checker flags the unredacted file ("name key"). |
| 7 page-wide ActualText strip (P3) | Open | us-budget p23 still extracts "GROWING THe ... MIDDLe OUT". |
| 8 no objstms (P3) | Fixed | us-budget one hit page: 2360 KB -> 2393 KB (was 10388 KB). fw9 138 KB -> 79 KB. |
| 9 xref noise (P3) | Fixed | rot90 remove: 0 "cannot find object in xref" lines (was 8). |
| 10 damaged page tree (P3) | Fixed | `loop2.mjs`: every looping variant now throws "This PDF's page list is damaged. Run Repair first, then redact." With a correct `/Count`, it still works and the output is clean. |

## New findings

| # | Sev | Location | Problem | Failure scenario (evidence) | Fix |
|---|---|---|---|---|---|
| R3-1 | P3 | `src/lib/redactOps.js:835-861` (imageCover/isScan), `:1389` | The scan test adds up the area of every image drawn. A born-digital page with a full-page background image (letterhead, certificate, brochure) counts as a scan. In remove mode it skips MuPDF redaction and becomes a 144 dpi JPEG, so all of its text stops being selectable. It is safe, and the result note says the page was turned into an image. | Synthetic page: a full-page 8x8 background image plus 2 text lines, search SECRETNAME, remove: raster [1], and the page text after is "". In the corpus, only real scans trigger it (c-mixed, sub-darwin, sub-fips, udhr-hindi, jbig2/jpx quirks), and none of them has visible text runs. | Treat the page as a scan only when there is also little or no visible text (for example no `fillText` outside render mode 3), or when one image covers the page and the text is invisible. |
| R3-2 | P3 | `src/lib/redactOps.js:830-832` (borrowed), whole job | Resident memory grows about 3 MB per redaction job in one process. The cause is not established: it happens with and without shadings, so it is not clearly the finalizer unhooking. In the app this means a long session of many redactions in one worker. | Node, `--expose-gc`, 25 remove runs: tracemonkey p2 157 -> 229 MB, p11 (81 shadings) 237 -> 323 MB. | Check that every Image and Shade passed through `borrowed()` is destroyed once (or confirm the wrappers own nothing), and recycle the worker after N jobs. |
| R3-3 | P3 | (R2 #7, still open) `src/lib/redactOps.js:441-465` | Every ActualText, Alt and E on hit pages is cut. | See above. | As in R2 #7. |

## Verified OK (round 3)

- **Corpus:** `timeout 1200 npm run test:corpus -- --case "redact|forms" --name review-redact-3` gave 114 pass, 1 fail (the known `forms-fill-xfa-imm1344e`). 54 of 56 redact rows carry the raw check; the 2 without are the search-only find-split rows.
- **Round-1 re-runs, both methods, deep scan plus raw bytes:** `real.mjs`, `synth.mjs` and `bdc2.mjs` are all clean. `objr2.mjs`, `realobjr.mjs` (no deleted widget left), `fw9row.mjs` (deep `[]`), `more2.mjs`, `cid.mjs`, `img.mjs` (line art rasterized, pattern image gone) and `xfa.mjs` (`xfaMatch` true) are clean. `budget5.mjs`: "Econ" is gone from p23.
- **Round-2 fresh attacks:** QR and barcode drawn as one path, outlined rectilinear word, clip text, image mask and Type3 text all still hold. `shared2.mjs`: page 2 (not hit) is unchanged, diff 0.000. `checker.mjs`: the CID form and the OBJR-kept hex AP are still flagged.
- **Shading false positives on a real file:** `reports/fdic-quarterly-banking-profile-2023q4.pdf` has one shading on every page. It is clipped to the top band (y up to 72 pt) and its own bounds are infinite. Body words (noninterest, expense on p2; banking on p1, p3, p4, p5): raster [] on every page. Only the header word QUARTERLY (box at y 28, inside the gradient band) rasterizes p2, which is correct. tracemonkey p11 (81 shadings), body words: raster [].
- **Non-hit pages unchanged** (render diff): tracemonkey (12 pages, both methods), us-budget (183), rot90-cropbox (15, both), fw9 (5, both), free-fiber shared resources (both), fdic (43). 0 changed.
- **Damaged page trees:** every loop variant gives a clear message, and when the tree reads correctly the output is clean.
- **formOps field counts** are unchanged: fw9 23/23 (flatten 23), i485 730/730 (730), f1040 199/199 (199), with 0 loose objects and 0 XFA streams.
- **Code stable:** the diff stats of the 5 files were the same at the start and the end of this round.

## Not verified (round 3)

- The browser UI, Health, `npm run build`, and the full 838-page bible run (the author reports about 21 min and 173 MB; only a page subset was run here).
- Whether `borrowed()` leaks or double-frees in the browser worker over long sessions (R3-2). Measured in Node only.
- The new JPEG scan path at 144 dpi: readability of small print was not judged.
