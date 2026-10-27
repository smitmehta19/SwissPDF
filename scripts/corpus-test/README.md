# Corpus test runner

Runs every SwissPDF tool on real third-party files from `test-corpus/` in Chromium, checks every output in Node, and writes a scorecard to `docs/test-results/`.

## Run it

```
npm install
npx playwright install chromium        # once
bash scripts/fetch-test-corpus.sh      # once, fills test-corpus/ (gitignored)
npm run test:corpus                    # full run, writes docs/test-results/<date>-run.md + .json
```

Flags (after `--`):

| Flag | Effect |
|---|---|
| `--quick` | Small subset (about 80 rows, a few minutes) |
| `--tool merge,split` | Only these tools (registry ids; `intake` for the UI intake rows) |
| `--category reports,quirks` | Only cases whose first file is in these corpus folders |
| `--layer ops,ui,flow` | Pick layers (default all three) |
| `--case <regex>` | Only case ids matching the regex, e.g. `--case "^redact-"` |
| `--name <stem>` | Output file name, e.g. `--name 2026-10-17-baseline` |
| `--timeout-scale 2` | Multiply every per-case timeout |
| `--shards 4` | Run on N parallel browser contexts (default 1), one Vite server. Cases are spread by weight (timings from the last `2026-10-17-baseline.json`, else a size guess), longest first; the LibreOffice group stays on one shard so there is never more than one engine per page. Rows are merged back into serial order |
| `--headed` | Show the browser |
| `--light` | Skip inputs over 20 MB (the 57 to 104 MB scans) |

Example: `npm run test:corpus -- --tool redact,crop --name redact-check`.

## Test tiers (do not overload the machine)

Every run starts Chromium plus the PDF engines (1 to 2 GB each). Pick the smallest tier that proves the change.

| Tier | When | Command | Time |
|---|---|---|---|
| 1 Touched | After each change | `npm run test:touched -- --tool <ids>` (or `--case <regex>`), plus the one UI script for that area | 1 to 5 min |
| 2 Quick | Before handing work back / merging | `npm run test:quick` | about 5 min |
| 3 Full | Once per phase, by the orchestrator only | `npm run test:clean` then `npm run test:full` | about 17 min |

Guards built in:
- One run at a time per machine: `startServer()` and `serve-pages-sim.mjs` take a lock in the OS temp folder (`swisspdf-test-run.lock`, covers worktrees). A second run waits and says who holds it. `CORPUS_LOCK=off` skips it (only when you know nothing else runs).
- `--shards` is capped by free memory (about 2 GB per shard) and at 4.
- `serve-pages-sim.mjs` takes `PORT` (0 = any free port) and stops after 10 idle minutes (`IDLE_MIN`).
- `npm run test:clean` closes leftover test browsers and test servers (never your own browser or the Playwright MCP browser); `-- --dry` lists only.
- Wrap long runs in a hard timeout (`timeout 900 node scripts/corpus-test/g1.mjs`) so a hang fails in minutes, not hours. Do not run a dev-server script while your own `serve-pages-sim` is up: both take the lock.
- `CORPUS_OUT=<name>` keeps a run's outputs in its own folder.

## What it does

1. `derive.mjs` builds fixtures from real corpus files into `test-corpus/derived/` (skips existing ones; `node scripts/corpus-test/derive.mjs --force` rebuilds): owner-only restricted copies, a user-password copy, a `/Rotate 90` + offset CropBox report, a moved-origin invoice, page subsets of big scans, two compare versions, and the page-frame set (`c-rot180-origin`, `c-rot270-cropbox`, `c-mixed` mixed sizes and rotations, `c-fw9-rot90` sideways form). `derived/manifest.json` lists them.
2. `server.mjs` starts the app's own Vite dev server on a free port (COOP/COEP from `vite.config.js`). It adds `POST /__corpus/out/<case>/<file>` so the page can hand outputs back; they land in `test-corpus/derived/outputs/<case>/`.
3. Three layers, all in one Chromium:
   - **ops**: `page-harness.js` runs in the app page and calls the real ops from `src/lib/*.js` on files fetched from `/test-corpus/...`.
   - **ui**: every corpus PDF goes through the shell's file input on `#/merge` (`[data-testid=add-files-input]`); the workspace card text is recorded (page count or error). Each batch runs in its own browser context because the workspace persists in IndexedDB.
   - **flow**: merge and compress run in the shell (add files, Run, Download on the result screen); split still drives its legacy page. The real download is saved and checked.
4. `validate.mjs` reopens every output in Node with pdf.js (legacy build, with cmaps and standard fonts) and MuPDF: opens in both, page count, boxes sane, text present/absent, positions on the visible page, form fields, outlines, Office zip contents.
5. `report.mjs` writes `<name>.md` (per-tool summary, audit findings, every row) and `<name>.json` (all checks).

With `--shards`, Node-side validation still runs one pdf.js call at a time (pdf.js mixes up concurrent documents in Node), so the gain comes from the browser side.

Per case: default timeout 120 s, large and Office cases 600 s or more. A timeout or renderer crash fails only that case; the page is replaced and the run goes on. JS heap is polled once a second over CDP (`JSHeapUsedSize`, WASM memory not included). Requests leaving the page origin are recorded per case (used by the OCR and LibreOffice privacy checks).

## Reading results

- **PASS**: every hard check passed. **FAIL**: an error or a hard check failed; Detail shows the first one. **SKIP**: could not run (missing engine, no suitable input).
- `warn:` in Detail = a soft check failed. Soft checks never fail a row; they are evidence for an audit finding (feature gaps such as dropped bookmarks, no editable text in PPT).
- The audit table maps checks to findings in `docs/research/swisspdf-audit.md`: CONFIRMED (a linked hard check failed, with evidence), SOFT WARN (only soft checks failed: a known gap or a noisy probe, read the warnings), NOT REPRODUCED (all linked checks passed), NOT TESTED (with reason).
- Raw outputs stay in `test-corpus/derived/outputs/<case id>/` for a manual look. Set `CORPUS_OUT=<name>` to write to `outputs-<name>/` instead, so runs in parallel do not overwrite each other.
- A partial `<name>.partial.json` is written after every row and removed at the end, so a killed run still leaves data.

## Other scripts

| Script | What |
|---|---|
| `node scripts/corpus-test/health.mjs` | Runs the in-app Health check through its button on the dev server. `--url http://localhost:4180/SwissPDF/` checks the built app served by `scripts/serve-pages-sim.mjs` (after `npm run build`) |
| `node scripts/corpus-test/ui-frame.mjs` | UI smoke for the page frame: drags a crop, clicks an edit and a signature on rotated / offset pages with the mouse, checks where they landed |
| `node scripts/corpus-test/chain.mjs` | Shell chain: merge two reports, compress the result, download, reload (files survive, version chain), undo, cancel, page editor, wipe all. `--url` works as for health.mjs |
| `node scripts/corpus-test/shots.mjs` | Shell screenshots at 390 and 1440 px, light and dark, into `docs/design/screens/U2a/`; fails on horizontal scroll or if the ops worker never loads |
| `node scripts/corpus-test/fonts-check.mjs` | Node check of `src/lib/fonts.js`: bidi order of numbers in Arabic/Hebrew lines, per character font coverage (Traditional Chinese, Korean Hanja, Bengali, Tamil, Thai, symbols), clear errors for emoji and for an offline font load |
| `node scripts/corpus-test/thumbs-evict.mjs` | Page preview cache in the browser: a removed file stops rendering and its object URLs are revoked; 6 files render side by side |
| `node scripts/corpus-test/delta.mjs <new.json> <base.json> --write` | Adds a "Delta vs base" section to the new scorecard: FAIL->PASS, PASS->FAIL, still failing by owning unit |

## Adding a case

Cases live in `cases.mjs`. Add one with `add({...})` or a helper (`mergeCase`, `splitCase`, `compressCase`, `redactCase`, ...):

```js
add({
  id: 'watermark-my-file',          // unique, used for the output folder
  tool: 'watermark',                // registry id, used for the summary
  op: 'watermark',                  // key in OPS in page-harness.js
  files: ['reports/my-file.pdf'],   // relative to test-corpus/
  params: { text: 'DRAFT' },        // passed to the op
  timeout: 2 * MIN,
  quick: true,                      // include in --quick
  async validate(ctx) {
    const p = await checkPdf(ctx, 'watermarked.pdf', { pages: 3 })
    ctx.check('mark present', allText(p).includes('DRAFT'))
    ctx.check('nice to have', false, 'detail', { soft: true, audit: 8 })
    ctx.metric('shown in Detail when the row passes')
  },
})
```

A new op goes into `OPS` in `page-harness.js`: it gets `(spec, files)` with the fetched bytes, calls the app op, uploads outputs with `save(spec.id, name, bytes)` and returns `{ outputs, meta }`. `meta` reaches `validate` as `ctx.meta`; a thrown error reaches it as `ctx.error` (set `allowError: true` when an error can be the right answer).

Rules: corpus files are untrusted. Only open them through pdf.js, MuPDF, pdf-lib, JSZip or xlsx; never execute anything from `test-corpus/`. Do not change `src/` to make a case pass: fix the app in its own unit, or fix the harness if the harness is wrong.
