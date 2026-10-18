# SwissPDF design (U2a app shell)

Status: U2a direction + shell. Extends the existing tokens in `src/styles.css` (iris palette, system font stack, mono for measurements). Shell styles live in `src/app/shell.css`. Legacy tool styles stay in `src/styles.css` until U2b.

## 0. Context (what is fixed, what is free)
| Fixed | Free |
|---|---|
| Name SwissPDF, iris signal `#5b4be6` light / `#8f82ff` dark, both themes via `data-theme` | Layout of the whole shell |
| System font stack (COEP blocks webfonts), mono for sizes, pages, counts | Type scale, spacing, layout, z-index and motion tokens |
| Hash routes `#/<toolId>`, Back returns home, theme toggle cycles system/light/dark | Tool panel, workbench modes, result screen |
| Files never leave the device | Copy (plain, short, no marketing) |
| Never copy iLovePDF / Stirling logos, colours, copy or code | Layout patterns and behaviour may follow them |

## 1. Design Read
SwissPDF is a working tool for people who handle PDFs at work (office staff, students, developers). Primary job: get a file through one or more operations fast and be sure nothing was uploaded. Mode: **Operate**. Used at a desk for minutes at a time, often several tools in a row, sometimes on a phone to do one quick job.

## 2. Direction
"A precision instrument on a desk." Calm surfaces, one signal colour that only means "act here / selected", numbers in mono because they are measurements.

| Role | Light | Dark |
|---|---|---|
| Paper (app background, workbench) | `#f4f3f7` | `#0d0c12` |
| Surface (panels, cards) | `#ffffff` | `#15141d` |
| Ink (text) | `#17151f` | `#f1f0f6` |
| Muted text | `#6b6878` | `#928fa2` |
| Signal (primary action, selection, focus) | `#5b4be6` | `#8f82ff` |
| Signal wash (selected rows, active mode) | `#ece9fd` | `#272348` |

Dials: variance 3/10 (strict, predictable), motion 2/10 (state changes only), density 7/10 (tool UI, not a landing page).

Signature moment: the **result screen**. After a run the workbench turns into a calm receipt: a real page preview, the file's name, page count and size in mono, a before/after size line where it matters, then three clear next steps (Download, Continue with another tool, Undo). One short rise-in, nothing else moves.

Principles
1. The workspace is the product: files stay on the bench between tools, each run adds a version, nothing is re-added.
2. One signal colour, one meaning. Destructive actions use `--err`, never signal.
3. Mono only for measurements (pages, sizes, counts, `io` signatures).
4. Every drag has a button alternative (WCAG 2.5.7).
5. Esc closes dialogs and drawers only, never a tool.

### Layout (desktop, 1100px and up)
```
+------------------------------------------------------------------------------+
| [mark] SwissPDF   [ Search tools                      / ]   Local only  (o)  |  56px bar
+--------------+--------------------------------------------+------------------+
| Favourites   | [Files] [Viewer] [Pages]      3 files . Add | Merge            |
|  Merge   *   |--------------------------------------------| 2+ PDF -> 1 PDF  |
| Recent       |  +------+ +------+ +------+ +------+       |                  |
|  Compress    |  | page | | page | | page | |  +   |       | options          |
| Organize     |  |      | |      | |      | | Add  |       |  (cards, grid)   |
|  Merge       |  +------+ +------+ +------+ +------+       |                  |
|  Split ...   |  name.pdf  name.pdf  name.pdf              |------------------|
| Convert ...  |                                            | 1 PDF will be    |
|              |                                            | created (30 p)   |
|              |                                            | [ Merge 2 PDFs ] |  sticky
+--------------+--------------------------------------------+------------------+
  264px            flex                                        340px
```
- 760-1099px: tool panel becomes a drawer (menu button in the bar); options panel stays right.
- Under 760px: one column. Bar (menu, brand, search icon, theme). Workbench, then options; the Run bar is sticky at the bottom of the screen. No horizontal scroll at 320px.
- Home (`#/`): tool panel + centre shows the file grid (or the start drop area) above the tool directory. No options panel.
- Legacy tools (not yet migrated, U2b): the centre shows the old tool page unchanged, the right panel is hidden, a one-line note says the tool still uses its own file picker.

## 3. Style
Base: **Swiss** (grid discipline, one family, flat surfaces, hierarchy from size/weight/position, short mechanical motion). Accent: **Minimalism** (one accent with one meaning, 1px low-contrast separators, visible affordances).
Borrowed: strict 4px spacing grid, flush-left text, no gradients or textures, one radius family, underlined text links, 2px focus outline with offset.
Not borrowed: Swiss 0 radius (we keep the existing soft 9/13/18px radii, the product already uses them), numbered sections, tracked caps.
Pitfalls checked: flat buttons must still look clickable (filled primary, 1px outlined secondary with a 3:1 edge), muted text kept at 4.5:1, no decorative red.

## 4. Colour tokens
Existing tokens kept (`--paper --surface --surface-2 --ink --ink-2 --muted --line --line-strong --signal --signal-deep --ok --err --warn`). Added:

| Token | Light | Dark | Use | Contrast |
|---|---|---|---|---|
| `--signal-wash` | `#ece9fd` | `#272348` | selected row / active mode bg | signal on it 4.91 / 4.79 |
| `--on-signal` | `#ffffff` | `#0d0c12` | text on signal fills | 5.84 / 6.31 |
| `--edge` | `#8a86a0` | `#6f6b85` | input and checkbox borders (1.4.11) | 3.17 on paper / 3.58 on surface |
| `--ok-text` | `#0a7f50` | `#35d08e` | success text | 5.04 / 9.19 |
| `--scrim` | `rgb(23 21 31 / .42)` | `rgb(0 0 0 / .6)` | dialog and drawer backdrop | n/a |

Computed pairs (WCAG 2.x): ink on paper 16.3, muted on paper 4.90, muted on surface 5.42, signal on surface 5.84, white on signal 5.84, dark ink on dark signal 6.31, dark muted on dark surface 5.80, err on white 4.61. `--ok` (`#0e9d63`, 3.49) is used for icons and fills only; text uses `--ok-text`.

## 5. Typography
One family: the system UI stack (`--sans`). Mono (`--mono`) for numbers that are measurements.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `--t-xs` | 12px / 16px | 500 | badges, kbd |
| `--t-sm` | 13px / 18px | 400-500 | meta lines, help |
| `--t-base` | 15px / 22px | 400 | body, controls |
| `--t-md` | 17px / 24px | 600 | panel titles, card names |
| `--t-lg` | 21px / 28px | 640 | result title |
| `--t-xl` | 28px / 34px | 680 | home heading |
Tracking: -0.01em at md and above, -0.02em at lg/xl. Body measure capped at 68ch. `font-variant-numeric: tabular-nums` on every mono measurement.

## 6. Layout tokens
| Token | Value |
|---|---|
| Spacing `--s-1..--s-8` | 4, 8, 12, 16, 20, 24, 32, 48px |
| `--bar-h` | 56px |
| `--panel-w` | 264px |
| `--options-w` | 340px |
| Radius | `--r-xs` 6px (chips, kbd), `--r-sm` 9px (controls), `--r-md` 13px (cards), `--r-lg` 18px (dialogs) |
| Shadow | `--shadow-1` hairline lift, `--shadow-2` floating (dialogs, drawers, drag ghost) |
| z-index | `--z-bar` 40, `--z-sticky` 30, `--z-drawer` 60, `--z-dialog` 80, `--z-toast` 90 |
| Breakpoints | 760px (phone / tablet), 1100px (tablet / desktop) |
| Hit targets | 40px min for buttons, 32px min for dense icon buttons with 8px spacing (WCAG 2.5.8) |

## 7. Components and states
| Component | States |
|---|---|
| Top bar search | empty, typing (filters the tool panel live), no match (message with suggestions), focus via `/` |
| Tool row | default, hover, current (signal wash + signal text), favourite on/off (star toggle, own button) |
| Mode switch (Files / Viewer / Pages) | segmented, active = surface + ink, disabled when no files |
| File card | reading (skeleton + "Reading..."), ready (thumb, name, pages and size), notice (repaired / unlocked), needs password (inline prompt), error (err text + details), selected (signal ring + check), dragging, drop target |
| Add files tile | default, drag over (signal dashed edge), keyboard: Enter / Space opens picker |
| Page tile (page editor) | default, selected, rotated, blank (inserted), duplicated, focus |
| Option card | default, hover, selected (signal edge + wash + check), disabled |
| 3x3 position grid | radio group, arrow keys move, selected cell filled |
| Run button | ready, disabled with reason line, running (progress bar + "Cancel"), done |
| Progress | determinate bar with `done / total` in mono, label line, Cancel button |
| Result screen | success (preview, summary, actions), partial (some outputs failed, listed), error (problem + fix + Back to options) |
| Dialog | open, Esc / backdrop closes, focus trapped and returned |
| Toast / live line | `aria-live=polite` status for runs and file intake |

Empty states: no files (drop area: "Add PDFs. They stay on this device."), no tool match, tool needs more files ("Add one more PDF to merge").

## 8. Motion
Tokens: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`, `--d-press: 160ms`, `--d-fast: 150ms`, `--d-panel: 240ms`, `--d-dialog: 200ms`.
| What | Motion | Why |
|---|---|---|
| Buttons | `scale(.97)` on `:active`, 160ms | feedback |
| Tool drawer (tablet/phone) | `translateX(-100%)` to 0, 240ms drawer curve; scrim opacity | spatial |
| Dialog | opacity + `scale(.96)` to 1, 200ms | prevents a jarring change |
| Result screen | one rise: opacity + `translateY(8px)` to 0, 240ms | the signature moment |
| Progress bar | `transform: scaleX()` linear | state |
| Search filtering, mode switch, tool switch | none (used tens of times a day, keyboard driven) | gate: frequent |
Reduced motion: drawers and dialogs fade only, result rise becomes a fade, press scale removed. No `transition: all`, no `ease-in`, nothing over 300ms.

## 9. Interaction
- Drag reorder of file cards and page tiles: HTML5 drag with a visible drop target; buttons "Move left / Move right" on focus/hover for keyboard and single-pointer use.
- File grid: click toggles selection, double click / Enter opens the viewer. Sort menu: name, size, date added.
- Page editor: click selects, Shift-click selects a range, "Select pages" field accepts `1-3, 7`. Rotate / Duplicate / Delete / Insert blank act on the selection. Undo (Ctrl+Z) for every edit until applied. "Apply changes" writes a new version per file.
- Unsaved-work guard: leaving the page with a running job or unapplied page edits asks first; switching tools with unapplied page edits asks in an in-app dialog.

## 10. Never list applied
No eyebrow labels, no gradient text, no emoji or unicode glyph icons (the line icon set in `Icon.jsx` is extended), no glass as decoration, no coloured thick borders, no `->` on every button, no ALL-CAPS labels, no card-kit hero metrics.
