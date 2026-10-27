# Tool contract (shell tools)

A tool that follows this contract runs inside the shell: it works on the shared workspace files, shows its options in the right panel, gets progress, cancel, a result screen, versions and undo for free. Reference tools: `src/tools/v2/merge.jsx`, `compress.jsx`, `watermark.jsx`; canvas tools `sign.jsx`, `redact.jsx`; page tools `extract.jsx`, `organize.jsx`; non-PDF inputs `img2pdf.jsx`, `office2pdf.jsx`; locked inputs and outputs `unlock.jsx`, `protect.jsx`; result views `compare.jsx`, `health.jsx`. Tools without `run` are legacy (they render `component`, their own page); since G2 no registered tool is legacy.

## Shape
```js
export default {
  id: 'compress',              // registry id, also the hash route #/compress
  name: 'Compress',
  io: 'PDF → smaller PDF',     // input/output signature, shown in mono
  description: 'Keep text sharp, or go for the smallest file.',
  category: 'Optimize',        // one of CATEGORIES in registry.js
  icon: 'compress',            // name in src/components/Icon.jsx
  accepts: { min: 1 },         // informational; summary() decides readiness
                               // types: ['.jpg', '.png'] = non-PDF inputs, noun: 'images' for the start area
  keepInputs: false,           // optional: true = inputs stay as they are (conversions out of PDF)
  workbench: 'pages',          // optional: open the Pages view and get `editor` in Options
  Canvas,                      // optional: on-page editor shown in Viewer mode
  defaults: { mode: 'clean' }, // initial options, kept per tool while the app is open
  steps: [{ id: 'options', title: 'Automation' }, { id: 'files' }], // optional: order and titles of the options steps (default Files, Options); Run is always last
  next: ['protect', 'merge'],  // first of the 4 "Edit your new file" suggestions
  Options,                     // React component ({ options, setOptions, files, editor })
  summary(files, options),     // -> { ready, line, runLabel }
  async run(files, options, ctx), // -> outputs, or { outputs, view }
  Result,                      // optional: React view ({ view }) shown on the result screen
}
```
Register it in `src/tools/registry.js`: list it in `TOOLS`, or put it in its group file (`src/tools/v2/group-<name>.js`, an array) that the registry spreads.

## Inputs
`files` are the selected, ready workspace files in workspace order:
`{ id, name, size, pageCount, type, bytes }`. `bytes` is the page's cached copy: never mutate or transfer it (pdf.js caches by buffer identity). `type` is the MIME type; PDFs are `application/pdf`.

### Non-PDF inputs (accepts.types)
- `accepts.types` lists the extensions a tool takes (`['.docx', '.doc']`). The shell then keeps those files in the workspace (no intake, no page count, `pageCount` null) and passes the tool only the selected files that match. A tool without `types` gets PDFs only.
- `accepts.noun` names the inputs on the empty start area ("Add images to start").
- Check `isPdfRecord(rec)` (`fileStore.js`) before anything pdf.js on a workspace record.

### Locked inputs (accepts.locked)
`accepts: { locked: true }` (Unlock) also gets selected files that still need a password: `locked: true`, `bytes` = the encrypted file, `pageCount` null. Every input carries `notices` (intake notes, e.g. a restriction already removed on add).

## Options component
- Gets `options`, `setOptions(next)` and `files`. `setOptions` takes the whole new object or an updater `(prev) => next` (use the updater for frequent updates, such as canvas drags).
- Page tools (`workbench: 'pages'`) also get `editor`, the Pages view state (`usePageEditor` in `src/app/PageEditor.jsx`): `tilesOf(file)`, `sel` (Set of `fileId|tileKey`), `dirty`, `actions` (toggle, selectRange, rotate, remove, move, arrange, undo, redo, reset...). Since S2 it also has `splitsOf(file)` (tile keys marked "split after"), `canRedo`, and per-tile actions (rotateOne, duplicateOne, removeOne, splitAfter, downloadSelected); `tilesOf` is unchanged, split marks are kept apart from the tiles. `summary()` and `run()` only see options, so mirror the selection or plan into options with an effect.
- Use the shared controls in `src/app/controls.jsx`: `OptionCards` (captioned cards, one choice), `Segmented`, `PositionGrid` (3x3), `Field` (label + control + help), `ProgressBar`, `Dialog`.
- No Run button and no file picker inside the tool: the shell owns both.

## Canvas (optional)
`Canvas({ files, options, setOptions, target, onTarget })` replaces the viewer while the tool is open (the shell opens the tool in Viewer mode). `target` is `{ id, page }` of the file and page shown; call `onTarget` to move. Keep placements in `options` in view space (`src/lib/pageFrame.js`), so `summary()` and `run()` see them. Shared page frame, file/page picker and zoom: `src/tools/v2/g3-canvas.jsx`.

## summary(files, options)
Returns the live line under the options and the Run label, every render:
- `ready`: false disables Run.
- `line`: what will happen ("2 watermarked PDFs will be created.") or what is missing ("Select one more PDF to merge.").
- `runLabel`: the action ("Merge 2 PDFs"), never "Submit". Put the count in it when you can. When a ready label has no digit, the shell adds the scope itself: "Repair (1 file)" (`scopedRunLabel` in `src/app/nextTools.js`).

## run(files, options, ctx)
- `ctx.progress(done, total, label)`: drives the progress bar. Call it per file and per page for page loops.
- `ctx.signal` / `ctx.check()`: cancel. Call `ctx.check()` inside every page loop; it throws once the user pressed Cancel.
- `ctx.call(op, ...args)`: runs a pure op from `src/app/ops.js` in the Web Worker. Cancelling terminates the worker, so long WASM calls stop too. Add new pure bytes-in/bytes-out ops to `ops.js` (no DOM, no pdf.js rendering, no app state). Work that needs canvas or pdf.js rendering stays on the page (see the compress Maximum mode).
- Return `[{ name, bytes, parentIds, type?, before?, note? }]`:
  - `type` (optional): MIME type of a non-PDF output (`image/png`, DOCX, Markdown). Outputs with a `type` skip the PDF check and show their extension and size instead of a page count.
  - `parentIds`: the input ids the output was made from. Every input listed as a parent is replaced in the workspace (it becomes an older version); merge lists all inputs, per-file tools list one. With `keepInputs: true` the inputs stay current and selected next to the outputs.
  - `before` (optional): input size, shown as "N% smaller" on the result screen.
  - `note` (optional): one short line shown under the output.
  - `locked` + `pageCount` (optional): the output needs a password to open (Protect). The shell skips the PDF check (the tool must verify it) and stores it locked, like a locked file added by the user; no preview. Since S2, typing the password on that card adds the decrypted copy as a new version (name without "-protected", parent = the encrypted file), so undo brings the encrypted file back; a locked file the user added is still opened in place.
- Or return `{ outputs, view }`: `view` is passed to the tool's `Result` component, shown under the result (compare). With no outputs (health) the result screen shows only the view, nothing is stored and there is no undo.
- Throw an `Error` with a message that names the problem; the shell shows "<Tool> failed: <message>" and keeps the inputs.

## Where a tool opens (S2)
Tools with a `Canvas` open in Viewer, tools with `workbench` open their view, and tools that take several files (`accepts.min >= 2`, or category Convert) open on Files. The options panel shows numbered steps: 1 Files (the files the tool gets), 2 the tool's `Options`, 3 Run. A tool can change the order and titles of the first two with `steps` (ids `files` and `options`; a missing one is added after, unknown ids are ignored), e.g. Automate shows 1 Automation, 2 Files, 3 Run.

## Run scope (S2 review fixes)
- The Files grid counts only what the open tool takes: "2 of 5 files go into Compress". Files it cannot use (other types, locked files for tools without `accepts.locked`) are dimmed with a reason and never shown as selected; `selected` passed to `summary()`/`run()` is unchanged.
- When the user adds files while a tool is open, results of earlier runs leave the selection (they do not join the next run unless selected again); files the user added stay selected, so adding a second file to Compare or Merge works. Run outputs are still selected for the next tool.
- After a run whose output is locked (Protect), the next-tool suggestions are only tools with `accepts.locked` (Unlock), and the card says the file is locked.
- Two current files never share a name: `addVersions` adds " (2)" to an output whose name is taken.
- Card undo: an input comes back only when no other current change replaced it (records carry `consumedParents`; a keepInputs output such as PDF to images never counts); if another part from the same step was changed, the undo is refused with a reason (`undoProblem`). Remove on a file another current file was made from hides it instead of doing nothing.

## Decrypted files stay in memory (blind review P0)
- A file opened with its user password (on its card or through a tool) is decrypted in memory only. IndexedDB keeps the encrypted original (`stored()` in fileStore.js writes `encryptedBlob` as a locked record); after a reload the card is locked and asks again.
- Outputs made from decrypted content (`memoryOnly`, set by `addVersions` when a parent is locked, decrypted or memory only, unless the output is itself locked) are never written to IndexedDB. After a reload they are gone and their encrypted source is current again.
- Files kept from an earlier visit are not selected after a reload; files the user adds and run outputs are.

## What the shell does after run
1. Checks every PDF output with `assertValidOutput` (opens, has pages).
2. Stores outputs as new versions (`fileStore.addVersions`): `parentIds`, `version + 1`, `toolHistory` appended, inputs stop being leaves (unless `keepInputs`). Outputs take the parent's place in the file order, in output order (split parts 1, 2, 3).
3. Selects the outputs and shows the review card: first-page preview, size before and after (the output's `before` when there is one output, else the total of the inputs that are parents of the stored outputs, so a file that failed in a batch is not counted), pages, time from Run to result, download (one file, or a streamed ZIP), undo (reverses the whole change), 4 suggested next tools (the tool's `next` first, then common ones for its category, `src/app/nextTools.js`), start over.

## Workspace API (src/app/fileStore.js)
`useWorkspace()` -> `{ files, persistent, storageNote }`; `addFiles(fileList, { keepOther })`; `isPdfRecord(rec)`; `getBytes(id)`; `addVersions(outputs, { tool, consumedIds })` -> change; `undoChange(change)`; `revertVersion(id)` (since S2, parts made from one file in one change, such as split parts, step back together: records carry a `changeId`, see `siblingsOf(id)`); `historyOf(id)`; `remove(id)`; `reorder(from, to)`; `sortBy(key, dir)`; `wipeAll()`. IndexedDB database `swisspdf`, store `files`, Blobs stored by reference; falls back to memory when storage is unavailable or full.
