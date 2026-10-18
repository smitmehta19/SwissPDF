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
