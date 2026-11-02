# Edit text: next units after spill (for Smit's pick)

Status: A built 2026-11-01 (refuses 'off-page' / 'crosses-drawing'); B built 2026-11-02 (wording, note placement, focus ring, busy sign); C, D next (Smit: finish all). Each is its own sprint.

| # | Unit | What the user gets | Size | Risk |
|---|---|---|---|---|
| A | Overflow guard | A line edit that would run past the page edge or through a box border is refused with "No room: try shorter text" (today it is applied and clipped). Centred titles that would pass the page edge: same. | 2 to 3 h | Low: a check before drawing, refuses more often |
| B | Note and feedback polish | One wording for "no room" (3 today); note card placed so it does not cover moved lines; no outline over the first spilled line; a busy sign during the 1 to 4 s apply | 3 to 4 h | Low: UI only |
| C | Real spaces between moved words | Draw the font's own space code between words on spilled rows, so fewer spills fall back (free-fiber style files) | 3 to 5 h | Medium: subset fonts may lack a space |
| D | Multi-line select editing | Select several lines, edit them as one box; the selected lines are re-laid, lines after move whole (spill base) | 1.5 to 2.5 days | High: close to parked paragraph re-wrap (hyphens, justify) for the selected lines |

Recommendation: A then B (small, visible, safe), then D as its own planned unit with review and blind test. C only if real files show many fallbacks.

Done when (each): corpus rows for the change pass, edittext-ui green, test:quick green, deploy, live Health green.

Out of scope here: paragraph re-wrap (parked), RTL/vertical spill, moving links with text.

## Parking lot (from unit A reviews, 2026-11-01)
- Crossing check uses path bounding boxes: a curve or logo whose box holds the line refuses growth; a grid drawn as one path, or a shading, is not caught.
- Paints drawn after the line are not checked for centred and RTL lines (plain lines are squeezed by the 'covered' rule); clip paths around the text are not checked.
- Trailing character spacing (tc) makes a same-length edit measure slightly wider; can trip the check on letter-spaced lines next to a rule.
- An image counts as a "line or box border" in the message.
- Phone editor: Tab order from the Fit button cycles inside the sheet.
- Alignment detection: irs-fw9 "Taxpayer Identification Number (TIN)" is treated as right-aligned and grows left (now refused, it would draw over the black "Part I" box).
- Missing tests: RTL push off the left edge, mixed RTL/LTR line, a collision squeeze crossing a cell border, Fit by mouse, in the phone editor and on the note card.

## Parking lot (from unit B reviews, 2026-11-02)
- Picture boxes for note placement ignore clipping: a cropped picture is avoided by its full box.
- On a dense phone page there is no free spot; the note sits above or under the line and covers text there.
- A note that only fits out of view does not try the narrower card.
