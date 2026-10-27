# Dev notes (gotchas learned the hard way)

## pdf.js
- pdf.js 5.4 `PagesMapper.instance` is a global singleton holding the page count of the last loaded doc; `getPage()` checks against it, so several open docs give "Invalid page request". Set `pdfjsLib.PagesMapper.instance.pagesNumber = doc.numPages` before using a doc (done in `openPdfDocument`).
- Pass a shared `worker: new PDFWorker()` to getDocument, else each doc spawns its own worker thread.
- Without `wasmUrl`, pdf.js 5 renders JPX images blank. JBIG2 (`jbig2_file_header`) still renders blank in pdf.js; MuPDF renders it.
- Never call `getDocument` directly: use `openPdfDocument` inside `serializedPdfOp`. Do not mutate a buffer after handing it to pdfText (cache keyed by buffer identity). Call `releasePdf(bytes)` when a file is removed.
- pdf.js trusts `/Count`, so its page count can be too high when the page tree loops.
- `releasePdf(bytes)` stops queued thumbnail batches for those bytes at once (generation counter) and fires `onPdfReleased`; `PagePreview` drops that file's previews and revokes their object URLs. Only call it when the file is really gone.
- One-off page counts (output self-checks) use `countPdfPages`: shared worker, not cached, so it does not push a user's document out of the open-docs LRU.
- Image ids starting `g_` live in `page.commonObjs`, others in `page.objs`. Waiting on the wrong store burns the full timeout per placement (was the FDIC 5.7 min PDF to Word/Excel: one logo x 44 pages x 8 s).
- In the browser, JPEG (DCTDecode) images come back as `{ bitmap: VideoFrame }`: VideoFrame has `displayWidth/displayHeight`, no `width/height`. Sizing a canvas from `bitmap.width` gives 0 and silently drops every JPEG image (JPEG scans then never reach OCR).
- RTL text: pdf.js reverses each item to logical order but does not mirror brackets and gives items left to right; `layout.js` reorders items per line and swaps `()[]{}<>`.
- `udhr-hebrew.pdf` has no usable ToUnicode: pdf.js text is garbage, so Hebrew order cannot be checked on it.

## Layout (layout.js)
- Pure, no pdf.js / DOM: run it in Node against pdf.js legacy output for quick checks (copy of `pageData` in a scratch script).
- `extractDocument` output stays in PDF user space (redact and forms depend on it); use `page.view` (unrotated CropBox) to place things on output pages.
- Corpus word coverage counts pdf.js fragments ("repre-", "B idirectional") as words, so correct dehyphenation and word joining lower it (BERT 1.00 -> 0.86). The h-* cases use `hCoverage`, which also accepts fragments inside joined words.
- Git Bash `sed -i` drops CRLF line endings on these files: restore with a small Node rewrite, or edit with the Edit tool.

## pdf-lib
- Some owner-encrypted files (xref streams) fail as "Expected instance of PDFDict", not an encryption error: always ask MuPDF about encryption.
- `copyPages` follows page refs in annotations (widget `/P`, link `/Dest`) and drags whole pages in as orphans: pre-fill `PDFObjectCopier.traversedObjects`.
- `PDFDocument.load` overwrites Producer/ModDate unless `updateMetadata:false`.
- All IRS forms share root field `topmostSubform[0]`: merging two collides (merge renames).

## MuPDF
- A plain `saveToBuffer` keeps encryption: pass `encrypt=none`.
- Option string splits on commas: never put user text (passwords) in it unescaped.
- In `page.evaluate`, import mupdf as `/node_modules/mupdf/dist/mupdf.js`.
- Destroy every MuPDF document in `finally`: WASM memory is not garbage collected, an undestroyed doc keeps about its file size.

## qpdf-wasm (rejected)
- Runtime dies after any nonzero exit; strict on broken xref; duplicates form fields on `--pages`.

## Build / dev
- `vite preview` serves base '/', not '/SwissPDF/'. Use `scripts/serve-pages-sim.mjs` for Pages paths.
- First `import('/src/lib/selfTest.js')` in dev can trigger a Vite dep re-optimise reload: warm up first.
- Never branch on `constructor.name` of pdf-lib (or any library) classes: the production build minifies them, so checks pass in dev and fail in the build (was the 2 Forms Health failures on the live site). Use `instanceof PDFTextField` etc. Check fixes with `npm run build` + `node scripts/serve-pages-sim.mjs` + `node scripts/corpus-test/health.mjs --url http://localhost:4180/SwissPDF/`.

## Fonts (fontkit + Noto)
- Fonts built with fontTools need `font['glyf'].padding = 4`: fontkit's subsetter copies glyph data as is, odd-length glyphs become invalid outlines (MuPDF "invalid outline").
- Noto Arabic `ccmp` makes dot glyphs with no Unicode mapping: embed with `features: { ccmp: false }`.
- `@pdf-lib/fontkit` needs a global `regeneratorRuntime` for Indic shaping.
- pdf-lib `field.updateAppearances(customFont)` marks the field clean; without it `save()` regenerates in Helvetica and throws "WinAnsi cannot encode".
- Rebuild fonts: `scripts/build-fonts.py` (Python fonttools).
- Rebuild only some fonts: `python scripts/build-fonts.py <cache> NotoSansThai-Regular.ttf ...`; the full rebuild rewrites every file.
- fontkit reverses a run when its first non-Common character is an RTL script (Arabic, Hebrew). `layoutText` returns runs in visual order, so an LTR run drawn with an RTL font (Arabic-Indic digits) is pre-reversed. Check visual order with `scripts/corpus-test/fonts-check.mjs`, not by eye.
- `layoutText` / `fontForText` throw `err.code = 'UNSUPPORTED_CHAR'` naming the character when no bundled font has it (emoji included). Never catch it to draw anyway: that saves boxes.
- Writing `\u2028` through the Write tool or a Bash heredoc puts a real line separator into the file and breaks the regex. Keep non-ASCII in JS source as escapes (convert with a script).

## Geometry
- All placing ops use view space (top-left of the page as rendered) via `src/lib/pageFrame.js`.
- pdf.js drops glyphs outside the CropBox and shifts origins of clipped items: check crop placement against the raw CropBox, not text positions.

## Testing
- Playwright `mouse.click` outside the viewport silently misses on tall pages: use `locator.click({ position })`.
- Tool-written files turn `\uXXXX` escapes into literal characters: write escapes through a script file.

## Corpus runner
- Merging worktrees: they are all uncommitted, so there is no git base. Worktree checkouts of tracked files are CRLF while main has LF for many of them (compare with `--strip-trailing-cr`). Two worktrees that appended to the end of an object (page-harness `OPS`) merge with `git merge-file --union` but can lose the closing `},` of the first block or duplicate a shared entry: run `node --check` on every merged script.
- Several scripts in the repo use CRLF (cases.mjs, page-harness.js, validate.mjs), others LF. Use `diff --strip-trailing-cr` when comparing copies, and keep each file's own line ending when patching.
- `probe()` page info stops at 400 pages and text at `maxTextPages`; for checks deep inside big outputs pass `maxInfoPages` to `checkPdf` or use `textAt(bytes, [pageNums])`.
- pdf.js page counts can be wrong (trusts `/Count` on a looping page tree): known true counts live in `TRUE_PAGES` in cases.mjs.
- In the harness, docs from `openPdfDocument` are cached by the app: never `destroy()` them.
- Intake card notices are in `[data-testid=file-notice]`; the first `.file-meta` is the page count / error line.
- The repo lives in OneDrive: a `writeFileSync` can fail with `UNKNOWN` / `EBUSY` while OneDrive holds the file. The runner's partial write is best effort and report writes retry; an uncaught write error used to close the browser and fail every remaining row.

## App shell (U2a)
- The workspace persists in IndexedDB (`swisspdf` / `files`). Playwright pages in one browser context share it: give each test its own context (the runner does) or click Remove all first.
- `src/styles.css` loads after `src/app/shell.css` (main.jsx imports App first), so a shell rule with the same specificity as an old global rule loses. Scope shell overrides (`.bar .local-chip`).
- Never send a page buffer to the worker as a transfer: `callOp` copies arguments on purpose (pdf.js caches by buffer identity). Results come back transferred.
- The ops worker lazy-imports pdf-lib and MuPDF, which needs `worker.format: 'es'` in vite.config.js; the default iife format fails the build.
- React StrictMode runs `setState` updaters twice: do not mutate refs inside an updater (it broke auto-selecting new files).
- Port 4180 may already be taken by another copy of serve-pages-sim (other worktree): check the page you test is your build.
- Keeping more pdf.js documents open on the shared worker (8 or 12 in a corpus shard) made large JPX scans (crooked-paths 104 MB) render blank, with no error. `MAX_OPEN` stays 4; instead the background lane serves one file for up to 10 thumbnail jobs before switching, so many files rendering at once do not reopen per page.

## LibreOffice engine (zetajs)
- ZetaOffice has no versioned CDN path (only `zetaoffice_latest`). The build is pinned by SHA-256 + size in `ENGINE_BUILD` (`src/lib/libreOffice.js`); when the CDN changes, HiFi fails with a clear message until the hashes are updated (download the 4 files, `sha256sum`, update sizes).
- `Content-Length` on the CDN is the brotli size (about 53 MB total); the files unpack to about 262 MB, which is what Cache Storage holds and what progress counts.
- The engine runs in a hidden same-origin iframe (`public/vendor/lo_frame.html`). Removing the frame kills every engine thread: that is the restart on hang. Never `display:none` it (throttled). State lives on `globalThis.__swisspdfLibreOffice` so two copies of the module still share one engine.
- Engine files are handed in from the page: `Module.instantiateWasm` (wasm bytes), `Module.getPreloadedPackage` (soffice.data), `locateFile` to a blob URL (metadata), `mainScriptUrlOrBlob` = the checked soffice.js Blob (patched into `zetaHelper.js`, marked "SwissPDF:").
- Extra fonts and fontconfig rules go in through `Module.preRun` (before LibreOffice builds its font list): fonts in `/usr/share/fonts/swisspdf/`, rules in `/instdir/share/fontconfig/conf.d/31-swisspdf-aliases.conf`. Writing fonts after boot does nothing.
- The engine already ships Carlito, Caladea, Liberation, DejaVu, Noto Sans/Serif (incl. Devanagari), Arabic, Hebrew. It had no CJK font (boxes) until the Noto SC/JP/KR subsets were added.
- LibreOffice writes no usable ToUnicode for Devanagari conjuncts: pdf.js extracts junk, MuPDF reads it fine (ActualText).
- Writer's HTML import ignores class/descendant CSS for tables. `htmlToPdfHiFi` lays the page out in a sandboxed frame first and writes computed styles back inline plus `border`/`bgcolor`/`cellpadding` attributes.
- `serve-pages-sim.mjs` port 4180 may be taken by another worktree: copy it with another port and an absolute `dist/` URL.

## Edit group (G3)
- MuPDF page space = our view space (top-left of the visible page, rotation and CropBox applied), but `page.getBounds()` can start at a non-zero origin: subtract `bounds[0..1]` before comparing with view points.
- MuPDF `toStructuredText` does not include form widget values: redact searches `page.getWidgets()` values separately and clears/deletes widgets under a box, else a typed value survives in the field `/V`.
- Save redacted files with `garbage=compact`: without it the old content streams (with the removed text) stay in the file as unreferenced objects.
- pdf-lib `doc.getForm()` silently deletes `/AcroForm/XFA` (logs "Removing XFA form data"). Read XFA presence before calling it.
- pdf.js turns any visible letter spacing into spaces (Tc, TJ gaps, per-char Td). Flattened comb fields would read "C O R P U S"; flatten draws them as one centred word instead.
- pdf-lib throws on reading rich text fields: call `disableRichFormatting()` and set the plain `/V` before appearances or flatten.
- Typed-signature fonts live in `public/fonts/script/` (OFL, Latin subset woff2). Only fonts without a Reserved Font Name may be subset (Dancing Script has one, so it is not used).
- Tool canvases: a tool with `Canvas` renders in Viewer mode (shell passes files, options, setOptions, target, onTarget). `setOptions` accepts an updater function.
- `pdf2excel-aws-invoice` can fail once with "Unsupported ZIP Compression method NaN" under `--shards 4` and pass on rerun.
- Shell bash guard: heredocs and URLs containing "git" (raw.githubusercontent) are refused in worktree agents; use the Write tool and PowerShell `Invoke-WebRequest`.

## Convert tools (G4)
- The workspace holds non-PDF files too (`type` = MIME, no page count, no intake). Use `isPdfRecord(rec)` before anything pdf.js; the shell only passes a tool the files matching its `accepts.types` (PDFs when it has none).
- `imagesToPdf` default `dpi` is 72 (one pixel per point) so compress / Office quick keep their old page sizes; Images to PDF passes 150.
- JPEG EXIF orientation is applied by the page transform (`orientMatrix`), not by re-encoding: a frame's `width`/`height` are the stored pixels.
- pdfExtract `extractDocument` reports no `images` for DCT (JPEG) images, so a JPEG-only scan never gets OCR in PDF to Word/Excel. PNG scans work.
- pdf.js renders some JBIG2 pages blank: `renderPageForExport` checks ink plus the operator list and redraws with MuPDF.

## G1 Organize tools
- `fileStore.addVersions` used to give every output the parent's `order`; ties fell back to `addedAt`, so split parts and later versions of one part came out of order (merge joined part 2 before part 1). Outputs now take fractional slots in the parent's place and the leaves are renumbered 1..N.
- `PageEditor` Shift-click read `anchor.current` inside the `setSel` updater, which runs after the anchor moved: Shift-click selected one page. Read the anchor before calling `setSel`.
- Tools with `workbench: 'pages'` (extract, remove, organize) open the Pages view and get `editor` in Options; they mirror the editor selection / plan into their options with an effect, because `summary()` and `run()` only see options.
- `splitByRanges` parses the source on every call: split many ranges per call (split.jsx chunks into about 10 calls), never one call per part. Split by size measures candidate lengths a few per call for the same reason.
- Memory probe for a Playwright run: `browser.newBrowserCDPSession()` + `SystemInfo.getProcessInfo` gives this browser's pids; summing every `chrome.exe` picks up other agents' browsers. `measureUserAgentSpecificMemory` is not available (isolation comes from the service worker).
- PowerShell from the Bash tool: heredocs and `$(...)` in one command with `cd` get refused by the worktree guard; write the script with the Write tool and run it plainly.

## Redaction leaks (integ-1 fix)
- pdf-lib `removePage` only unlinks: the old Page object, its content and fonts stay in the saved file, and bookmarks, links or the structure tree may still point at it (so even a GC keeps it). Redact rewrites the page in place instead (new /Contents + /Resources on the same page object) and saves through MuPDF with `garbage=compact`.
- pdf-lib also writes objects that were already loose in the source (old revisions): `annotation-text-widget.pdf` carries 3 orphan XFA streams. `formOps.dropLooseObjects` sweeps what the trailer does not reach before save.
- `stripXfa` must run before `doc.getForm()` (getForm deletes the /XFA key itself, so the removal would go unreported). The XFA streams are dropped by `dropLooseObjects` before save, only when nothing else points at them.
- MuPDF `getAnnotations()` skips Link and Popup; a Popup whose /Parent comment was deleted keeps that comment (and its /Contents) reachable. `page.toStructuredText()` does not include annotation text: FreeText and stamp text needs `annot.toDisplayList().toStructuredText()`.
- `Pixmap.getPixels()` is a view on WASM memory: write to it with no MuPDF calls in between (memory growth detaches it).
- Raw leak check for any output: `redactionLeaks(bytes, terms)` / `rawScan` in validate.mjs (detached pages, loose objects, XFA, term in any decoded stream or string). The synthetic `derived/redact-secretname.pdf` is built by cases.mjs on load.
- `sed -i` on cases.mjs strips CRLF (seen again): restore with a Node rewrite.
- mupdf.js 1.28: calling `.resolve()` on objects of a document MuPDF has just redacted (new image streams from REDACT_IMAGE_PIXELS) drops those streams' data on save ("object is not a stream", blank images). Use the indirect ref itself: `get`, `forEach`, `isDictionary` resolve safely.
- `doc.setLayerVisible(i, true)` changes what stext, rendering and `applyRedactions` see (hidden layer text gets found and removed) but is not saved. Redact shows all layers while working and hides them again for page pictures.
- Text option `ignore-actualtext` exists: comparing `toStructuredText()` with and without it shows whether marked-content ActualText still changes what is read.
- MuPDF annotation `setRect`/`getBounds` are in page space (y down), not PDF user space.
- In a MuPDF Device callback, `fillImage` ctm maps the unit square with (0,0) at the image's first pixel row (y down): pixel row = v * height, not (1 - v) * height.
- A page can keep a redacted image or form alive without drawing it: resources inherited from /Pages or one dict shared by several pages. Redact moves resources down and prunes each affected page to the names its content uses (`pruneResources`).
- MuPDF caches the layer setup when the file opens: deleting `/OCProperties` later changes nothing. An OCMD (`/P /AllOff`, `/AnyOff`, `/VE`) is evaluated live, so setting its `/P` to `/AnyOn` (and dropping `/VE`) shows its content; put the old values back before rendering pictures and saving.
- `applyRedactions` leaves a shading (`sh`) whole, clipped or not. Redact turns a page into an image when a shading reaches into a box (sample points against the shading bounds and every clip path).
- A Type3 font without `/Resources` draws its glyphs with the page resources: keep what its CharProcs name when pruning.
- Long scanned books: rasterized scan pages go in as JPEG (asJPEG) at 144 dpi and `mupdf.emptyStore()` runs after each picture; flat RGB pictures ran the 2 GB WASM heap out after a few hundred pages.
- Save with `objstms` (with `garbage=compact`): without it a one-page redaction of us-budget grew 4.4x.
- Walk objects from the trailer, not 1..countObjects: free slots make MuPDF log "cannot find object in xref" for each one.
- mupdf.js 1.28 Device callbacks `fillImage`, `fillImageMask`, `clipImageMask` and `fillShade` wrap the image/shade without taking a reference, yet the JS object frees it when collected: a double free that later shows as "memory access out of bounds" (it broke a whole corpus shard). Implement those callbacks only with `mupdf.Image._finalizer?.unregister(image)` (or `Shade`) first, and use the object only inside the callback. Defining the callback at all creates the wrapper, even if it ignores the argument.
- Remove mode sends scanned pages (images cover half the page or more) straight to a JPEG picture: MuPDF stores a pixel-redacted scan as a full-size flat image, and the 956-page bible ran the WASM heap out at page 67.

## U5-A layout + colour tools
- pdf-lib `page.node.wrapContentStreams(start, end)` only works when `/Contents` is already an array and silently returns false otherwise: call `page.node.normalize()` first.
- Blend modes (Difference, Multiply...) blend against the page's backdrop, which is transparent where nothing is painted: a white Difference rectangle on a text page did nothing until the page got an opaque white rectangle under its content. `colorOps.applyBlendSteps` does both.
- Each blend step is rounded to 8 bits by the renderer: 2 to 6 stacked steps stay within mean 1, p99 2 of the exact map in pdf.js and MuPDF.
- Saturation above 100 has no blend-mode form (no "add" blend), so only that setting rasterizes pages.
- `scripts/corpus-test/lin-check.mjs` checks a linearized file from its bytes (Annex F). Real linearized files in the corpus (`quirks/pdfjs-rotation.pdf`, `scanned/fips-...`, `scanned/lincoln-...`) pass it; their `/H` length includes padding up to the next object. Files with xref streams are not supported by the checker.
- `test-corpus/` in a worktree is the main checkout's folder: `node ../scripts/...` from inside it runs main's scripts, not the worktree's. Use absolute paths.
- Corpus ops for a unit can live in `page-harness-<unit>.js` (op name `<unit>:<op>`) and cases in `cases-<unit>.mjs` (registered from cases.mjs).
- Linearize without object streams made tagged files up to 4.5x bigger (us-budget). Now parts 7-9 stay plain only where the hint tables need them (pages and what they use); everything only the catalog reaches goes into object streams, both xref sections are xref streams. Acrobat's convention for `/T` with xref streams: the white space before the main xref stream object.
- A signature field's `/V` can lead to `/Reference /Data` = the catalog, so a page walk reached the whole structure tree (25 850 objects counted as page 1 of us-budget). Page walks stop at Catalog, StructTreeRoot, StructElem, Outlines.
- pdf.js reading by ranges loads the whole main xref before page 1: a PNG Up predictor on the xref stream rows shrinks it a lot. `OCProperties` is read before drawing page 1, so it sits in the first-page part.
- Blank scanned pages are never pure white (paper tone 210-236, specks, show-through): blank detection measures ink against the page's median brightness and ignores dark covers. Real blanks of `lincoln-ellsworth-letter-1861.pdf`: 4, 7, 8, 9, 12, 16, 20, 22, 25 to 32.
- Imposition (N-up, booklet, single page) draws each visible annotation's `/AP /N` into the page before embedding (BBox through Matrix, fitted to Rect); Page size keeps the page objects and moves annotations and destinations with the content matrix instead.
- Ops in the worker cannot take callbacks (`check`, `onPage`): cancel there terminates the worker.

## U5-B structure tools (docOps.js)
- MuPDF `asNumber()` goes through a 32-bit float: flag words above 2^24 lose bit 1 (fw9 comb fields, `Ff 25165825` reads as 25165824). Read integers with `parseInt(obj.toString(), 10)` (`intOf` in docOps).
- MuPDF `isStream()` / `readStream()` / `writeStream()` need the indirect reference: on `newIndirect(i).resolve()` they say "not a stream".
- MuPDF `getNumberOfComponents()` of a pixmap includes the alpha channel; a soft mask pixmap can be n=1 alpha=1.
- pdf.js `getFieldObjects()` has no `readOnly`: a read-only field shows as `editable: false`.
- Tagged PDFs keep removed annotations alive through the structure tree (`OBJR /Obj`): cut those links, else `garbage=compact` keeps the annotation (tracemonkey stamp, fw9 widgets).
- MuPDF's redaction image filter does not reach images in patterns or some forms: removeImages turns leftover image XObjects into 1x1 empty masks.
- pdf-lib `save()` keeps objects nothing points to: docOps runs every pdf-lib output through a MuPDF save (`saveMu`).
- MuPDF 1.28 save bugs, both silent or confusing: (1) after `newIndirect(i).resolve()` on every object, `garbage=compact` (or deduplicate, 4) drops content (attention p13 figure text 863 -> 409 chars in pdf.js and MuPDF); (2) `objstms` without compact throws "cannot find object in xref (N 0 R)" when the xref has a gap (pdf-lib output after `ctx.delete`). `saveMu` saves the edited doc with plain `garbage,compress`, reopens that and saves `garbage=compact,compress,objstms`. Never do the object walk and `garbage=compact` on the same document instance (redactOps does compact, without a walk).
- A MuPDF `Buffer.asUint8Array()` is a view into WASM memory; the next allocation can detach it ("detached ArrayBuffer" with 2 x 8 MB attachments). Copy with `takeBytes(buf)` at once.
- Some writers mark XFA packet streams `/Type /EmbeddedFile` (imm1344e, fw9): never treat those as attachments.
- XFA: Adobe writes `</script\n>`; `<script .../>` is empty and has no end tag. Use `/<script\b[^>]*(?<!\/)>[\s\S]*?<\/script\s*>/g` and skip the `config` packet (its `<script>` holds settings).
- Dynamic XFA forms may carry one AcroForm signature field (imm1344e): "no AcroForm fields besides signatures, or NeedsRendering" means the form exists only as XFA (`dynamicXfa`). Dropping its XFA leaves the "Please wait" page.
- Associated files (`/AF` on the catalog or a page, Factur-X / ZUGFeRD) are attachments too: list them, cut every `/AF` link and empty the file stream on remove.
- XFA keeps saved field state (including `access="readOnly"`) in the `form` packet, not only in `template`.
- A dynamic XFA form (xfa-issue14315) has no AcroForm fields: flatten refuses it instead of dropping the XFA.
- Shell `keepInputs` may be a function of the options (Attachments: extract keeps the PDF, add/remove replaces it).
- Runner: ops named `<unit>:<op>` load from `harness-<unit>.js`, and `cases-<unit>.mjs` files register their cases, so a unit's cases stay out of the shared files. The U5-B "tool" op runs the tool's real `run()` through `runJob` (worker, `doc` op). `scripts/corpus-test/u5b-ui.mjs` drives the shell for the Run-to-result table.

## G2 tools (OCR, auto rotate, protect, unlock, repair, compare, health)
- Tesseract worker + cores are copied from node_modules to `public/tesseract/` by `vite.config.js` (like pdfjs); language data is committed in `public/tessdata/` (LSTM-only `*.traineddata.gz`, plus `osd` for orientation, which needs the legacy engine: `legacyCore: true`). `corePath` must end in `js` or the worker treats it as a folder (we pass a blob URL + `#core.js`).
- Tesseract OSD `orientation_degrees` = how far to turn the image as shown clockwise to make it upright, so the fix is `/Rotate += degrees`. Confidence on real scans: wrong reads up to 1.0 (Lincoln letters); right reads from 0.3 (fax page 1, fixed only by the infer option) to 30 (typed Lincoln pages); handwritten vertical Japanese (Konoye) reads the right way at only 0.4 to 1.2. Default threshold 2.
- `ocrPdf` defaults to `textPages: 'force'` (old behaviour, the corpus `ocr` op relies on it); the OCR tool passes `'skip'`. The fax and most Lincoln pages already carry an old OCR layer, so in skip mode they are skipped.
- `fileStore.addVersions` returns null for an empty output list, and the shell bails before the result screen: a tool with no outputs (health) must return `{ outputs: [], view }`, which the shell shows without storing anything.
- A Protect output with an open password is stored `status: 'locked'` (bytes in the `locked` map); typing the password on its card runs intake, which stores the decrypted copy in the workspace. The downloaded file from the result screen is the encrypted one.
- MuPDF `rc4-40` writes revision 2, which has only the print / edit / copy / annotate bits; the protect self-check only verifies those four for 40-bit.
- `diffPixels` (compareOps) is the overlay diff used by the Compare view; the corpus runs it per page pair (`compare2` with `overlay: true`).
- Some old OCR layers are drawn as normal text under a full-page scan image (the fax), not with render mode 3. Detecting hidden text needs the operator order plus the image's area.
- MuPDF `applyRedactions(false, IMAGE_NONE, LINE_ART_NONE, TEXT_REMOVE)` over a page-sized rect removes only the text and keeps the scan.
- MuPDF `outlineIterator`: after `insert` the iterator sits past the new item. To add children: `prev()`, `down()`, insert, `up()`, `next()`.
## S2 shell (view switch, palette, steps, review card, Pages, Viewer, Reader)
- UI scripts and corpus flows lean on shell markup: `.modes [role=tab]:has-text("Pages")` (g2-ui), `next-<toolId>` chips from the tool's own `next` list (chain, g1, g4, cases), exact `[aria-label=Delete]` / `"Rotate right"` / `Undo` in the Pages toolbar (chain, g1), `.run-local` text (fix1), `.result-list li`, `.result-note`, `[data-testid=status]` (runner flow). Per-page buttons carry the page in their name ("Delete page 3") so the exact toolbar labels stay unique.
- `suggestNext` (src/app/nextTools.js) puts the tool's `next` first and pads to 4 from its category; never sort or replace the tool's own list.
- Viewer and Reader read pdf.js through `src/app/viewerData.js` (serializedPdfOp + openPdfDocument, never destroy). Search reads one page per queued call, so page renders cut in on big files (llama2, 77 pages: about 10 s).
- Text highlight boxes: `Util.transform(viewport.transform, item.transform)`, height = hypot(tx[2], tx[3]), width = item.width at scale 1. A match inside an item is placed by character share, so it is close, not exact, on proportional fonts.
- Pages split marks live next to the tiles (`splitsOf`), not in them: organize, extract and remove mirror `tilesOf` into their options, so tile objects must keep their shape.
- Playwright: per-page actions fade in (opacity 150 ms); read computed opacity after a short wait. The search hit button reads "Page 8" + count; read the page from `.vs-hit-page`, not the whole text ("Page 81").
- Phone: the viewer bottom bar is sticky above the fixed Run bar (`--run-bar-h`); a plain flow bar ends up under it.

## S3 Automate
- `automate.jsx` imports its step tools directly, never `registry.js`: the registry imports automate, and a tool module reading `TOOLS` at import time would hit the circular import (the harness imports automate.jsx first).
- A step gets a fresh record per step (`<id>~<n>`, `notices: []`, page count from `assertValidOutput` on the step output), so `pageCount`-based tools (compress raster, page numbers ranges, OCR progress) see the current file and a broken output is blamed on the step that made it.
- Options keyed by workspace file id do not survive as a saved step: metadata (`edits[id]`), rotate (`perFile`), remove blank (`found`, `keep`). `toolOptions()` in `src/lib/automate.js` rebuilds them per file.
- Passwords (protect, permissions) and picked images (watermark logo, stamp image) are stripped before `localStorage`; a saved chain with Protect asks for the password again each session.
- "Nothing to do" throws (OCR on pages that already have text, no blank pages, no portrait pages to rotate) skip the step instead of stopping the file. They are matched by message text in `NOTHING`: change those tool messages and the match goes with them.
- MuPDF in Node: `obj.get(key)` on a null object throws (`_fromPDFObjectKeep`). Guard with `isNull()` first (`at()` in cases-automate.mjs).
- Shell result facts: "Size" before = all inputs, so a batch where one file stopped shows the stopped file in the before size.
- Unlocking a tool output on its card (Protect, `parentIds` set) now goes through `addVersions` (decrypted child, "-protected" dropped from the name); a user-added locked file (no parents) is still replaced in place. The older G2 note above about storing the decrypted copy in place is about user-added files only.
- Outputs of one `addVersions` call share a `changeId`. `revertVersion` takes back siblings with the same parents together (split parts), not other files of the same run (compress on 3 files).
- Saved automations: a tab writes only what it changed (`saveChanges(prev, next)`), merged by id onto what is stored, and reloads on the `storage` event; a whole-list write lets two tabs wipe each other. A store written by a newer version is never touched; an unreadable one is copied to `swiss-automations-unreadable` before the first write. Unknown step tools stay in the list (they block Run with a reason).
- Patching files with `String.replace(a, b)`: `$$` in `b` becomes `$` (`page.$$eval` turned into `page.$eval`). Use a replacer function or split/join.
- Tool groups in the side panel start folded (only Popular and the current tool's group show). Scripts that click `[data-testid=tool-<id>]` unfold first: `page.$$eval('[data-testid^=fold-][aria-expanded=false]', (els) => els.forEach((el) => el.click()))` (g4-ui, u5a-ui, u5b-ui).
- Pages edits are keyed on workspace files, not on the selection: deselecting a file keeps its unsaved edits (store `getRecord(id)?.isLeaf` decides when they go).
- Bash `node -e "..."` with template literals inside double quotes gets mangled by the shell (backticks run as commands). Write the edit script to a file and run that, or use the Edit tool. `sed -i` also drops CRLF here (seen again on FileGrid.jsx).
- IndexedDB writes go through `stored(rec)` in fileStore.js: never `s.put(rec)` directly, or a decrypted copy can reach disk (blind review P0).
- Nothing is selected after a reload: UI scripts that reload and then Run must click "Select all" first (s2-ui `selectAllFiles`). Card undo selects the files it brings back.

## Forms zoom (blind review fix)
- shell.css `.viewer-stage img` clamps max-height and wins over g3.css at equal specificity, because the g3 chunk loads first. Any explicit-width canvas needs a stronger image rule (as in `.g3-stage-wrap .g3-stage.is-zoom > img`), or the image shrinks and percent overlays drift. This clamp is why the W-9 was drawn about 525px wide in the blind review.
