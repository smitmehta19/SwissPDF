# Architect notes

## 2026-10-27 Edit existing text (research: docs/research/2026-10-27-edit-existing-text.md)
- MuPDF stext font names keep the subset prefix but are cut at 31 chars ("...-BdIt" reads "...-Bd"). Match font dicts on the full BaseFont, by prefix when the name is 31 chars long.
- MuPDF `Font.isSerif/isBold` come from descriptor flags and are often wrong (HelveticaNeue reports serif): pick fallbacks by name.
- Simple fonts always use 1-byte codes even when their ToUnicode codespace says 2 bytes. Writing 2-byte codes drew garbage.
- A glyph is "in the subset" only if the file draws it with that font. ToUnicode and /Widths are not proof, and `encodeCharacter` returns 0 for CID fonts.
- Text-only redaction on a thin baseline band plus redraw kept every other glyph exactly in place on 10 real files. Prefer it to content-stream rewriting.
- OCR text under a scan: a text block drawn before an image that covers it is hidden. Image coverage alone is not enough.
- Checks that read text through ToUnicode cannot see blank or `.notdef` glyphs. Always look at or measure the ink inside the edited box too.
