# Tool contract (shell tools)

A tool that follows this contract runs inside the shell: it works on the shared workspace files, shows its options in the right panel, gets progress, cancel, a result screen, versions and undo for free. Reference tools: `src/tools/v2/merge.jsx`, `compress.jsx`, `watermark.jsx`; canvas tools `sign.jsx`, `redact.jsx`; page tools `extract.jsx`, `organize.jsx`; non-PDF inputs `img2pdf.jsx`, `office2pdf.jsx`. Tools without `run` are legacy (they render `component`, their own page) until G2 moves repair, ocr, protect, unlock, compare and health.

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
  next: ['protect', 'merge'],  // "Continue with another tool" suggestions
  Options,                     // React component ({ options, setOptions, files, editor })
  summary(files, options),     // -> { ready, line, runLabel }
  async run(files, options, ctx), // -> outputs
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

## Options component
- Gets `options`, `setOptions(next)` and `files`. `setOptions` takes the whole new object or an updater `(prev) => next` (use the updater for frequent updates, such as canvas drags).
- Page tools (`workbench: 'pages'`) also get `editor`, the Pages view state (`usePageEditor` in `src/app/PageEditor.jsx`): `tilesOf(file)`, `sel` (Set of `fileId|tileKey`), `dirty`, `actions` (toggle, selectRange, rotate, remove, move, arrange, undo, reset...). `summary()` and `run()` only see options, so mirror the selection or plan into options with an effect.
- Use the shared controls in `src/app/controls.jsx`: `OptionCards` (captioned cards, one choice), `Segmented`, `PositionGrid` (3x3), `Field` (label + control + help), `ProgressBar`, `Dialog`.
- No Run button and no file picker inside the tool: the shell owns both.

## Canvas (optional)
`Canvas({ files, options, setOptions, target, onTarget })` replaces the viewer while the tool is open (the shell opens the tool in Viewer mode). `target` is `{ id, page }` of the file and page shown; call `onTarget` to move. Keep placements in `options` in view space (`src/lib/pageFrame.js`), so `summary()` and `run()` see them. Shared page frame, file/page picker and zoom: `src/tools/v2/g3-canvas.jsx`.

## summary(files, options)
Returns the live line under the options and the Run label, every render:
- `ready`: false disables Run.
- `line`: what will happen ("2 watermarked PDFs will be created.") or what is missing ("Select one more PDF to merge.").
- `runLabel`: the action ("Merge 2 PDFs"), never "Submit".

## run(files, options, ctx)
- `ctx.progress(done, total, label)`: drives the progress bar. Call it per file and per page for page loops.
- `ctx.signal` / `ctx.check()`: cancel. Call `ctx.check()` inside every page loop; it throws once the user pressed Cancel.
- `ctx.call(op, ...args)`: runs a pure op from `src/app/ops.js` in the Web Worker. Cancelling terminates the worker, so long WASM calls stop too. Add new pure bytes-in/bytes-out ops to `ops.js` (no DOM, no pdf.js rendering, no app state). Work that needs canvas or pdf.js rendering stays on the page (see the compress Maximum mode).
- Return `[{ name, bytes, parentIds, type?, before?, note? }]`:
  - `type` (optional): MIME type of a non-PDF output (`image/png`, DOCX, Markdown). Outputs with a `type` skip the PDF check and show their extension and size instead of a page count.
  - `parentIds`: the input ids the output was made from. Every input listed as a parent is replaced in the workspace (it becomes an older version); merge lists all inputs, per-file tools list one. With `keepInputs: true` the inputs stay current and selected next to the outputs.
  - `before` (optional): input size, shown as "N% smaller" on the result screen.
  - `note` (optional): one short line shown under the output.
- Throw an `Error` with a message that names the problem; the shell shows "<Tool> failed: <message>" and keeps the inputs.

## What the shell does after run
1. Checks every PDF output with `assertValidOutput` (opens, has pages).
2. Stores outputs as new versions (`fileStore.addVersions`): `parentIds`, `version + 1`, `toolHistory` appended, inputs stop being leaves (unless `keepInputs`). Outputs take the parent's place in the file order, in output order (split parts 1, 2, 3).
3. Selects the outputs and shows the result screen: preview, download (one file, or a streamed ZIP), undo (reverses the whole change), continue with another tool, start over.

## Workspace API (src/app/fileStore.js)
`useWorkspace()` -> `{ files, persistent, storageNote }`; `addFiles(fileList, { keepOther })`; `isPdfRecord(rec)`; `getBytes(id)`; `addVersions(outputs, { tool, consumedIds })` -> change; `undoChange(change)`; `revertVersion(id)`; `historyOf(id)`; `remove(id)`; `reorder(from, to)`; `sortBy(key, dir)`; `wipeAll()`. IndexedDB database `swisspdf`, store `files`, Blobs stored by reference; falls back to memory when storage is unavailable or full.
