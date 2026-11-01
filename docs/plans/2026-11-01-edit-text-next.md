# Edit text: next units after spill (for Smit's pick)

Status: proposed, not started. Pick one; each is its own sprint.

| # | Unit | What the user gets | Size | Risk |
|---|---|---|---|---|
| A | Overflow guard | A line edit that would run past the page edge or through a box border is refused with "No room: try shorter text" (today it is applied and clipped). Centred titles that would pass the page edge: same. | 2 to 3 h | Low: a check before drawing, refuses more often |
| B | Note and feedback polish | One wording for "no room" (3 today); note card placed so it does not cover moved lines; no outline over the first spilled line; a busy sign during the 1 to 4 s apply | 3 to 4 h | Low: UI only |
| C | Real spaces between moved words | Draw the font's own space code between words on spilled rows, so fewer spills fall back (free-fiber style files) | 3 to 5 h | Medium: subset fonts may lack a space |
| D | Multi-line select editing | Select several lines, edit them as one box; the selected lines are re-laid, lines after move whole (spill base) | 1.5 to 2.5 days | High: close to parked paragraph re-wrap (hyphens, justify) for the selected lines |

Recommendation: A then B (small, visible, safe), then D as its own planned unit with review and blind test. C only if real files show many fallbacks.

Done when (each): corpus rows for the change pass, edittext-ui green, test:quick green, deploy, live Health green.

Out of scope here: paragraph re-wrap (parked), RTL/vertical spill, moving links with text.
