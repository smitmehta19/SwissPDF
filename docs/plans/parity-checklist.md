# Parity checklist (definition of done)

Source: iLovePDF (I) and Stirling PDF (S) tool lists in `docs/research/`. A row is green only when the tool passes on its real corpus files in the corpus runner (`npm run test:corpus`) and the output re-opens in pdf.js and MuPDF.
Status: have = exists, partial = exists but missing options or fails real files, missing = not built. Baseline results: `docs/test-results/`.
Corpus folders: `test-corpus/<folder>/`, derived = generated from real files in `test-corpus/derived/`.

## Organize
| Tool | From | Status | Unit | Must handle (corpus) | Key options to match |
|---|---|---|---|---|---|
| Merge | I S | partial | U1 | reports, quirks outlines, forms, derived owner-only | order by name, keep bookmarks/forms/links, TOC gen, strip signatures |
| Split | I S | partial | U1 U5 | large, reports | ranges, fixed N, by size, by bookmarks, divider page, sections, poster; "N PDFs will be created" |
| Extract pages | I S | have | U1 | large | Shift-click ranges, `1,5-8` |
| Remove pages | I S | have | U1 | large | Shift-click ranges |
| Organize / page editor | I S | partial | U2 U3 | large, reports | multi-file, rotate/delete/duplicate per page, insert blank, reverse/odd-even/duplex/booklet sort, undo |
| Rotate | I S | have | U3 | quirks rotated, scanned | all/portrait/landscape, per file |
| Scan to PDF | I S | missing | U5 | images phone/large | camera capture, crop, enhance |
| Auto rename | S | missing | U5 | reports | name from first heading |
| Single large page | S | missing | U5 | reports | n/a |

## Optimize
| Tool | From | Status | Unit | Must handle | Key options |
|---|---|---|---|---|---|
| Compress | I S | partial | U3 | scanned, large, reports, images-heavy | 3 levels + 1-9, grayscale, target size, never larger, keep text |
| Repair | I S | partial | U1 U3 | quirks broken xref, fuzzed | keep outlines/forms |
| OCR | I S | partial | U3 | scanned, intl, large | languages, skip/force, deskew, auto rotate, offline |
| Remove blank pages | S | missing | U5 | scanned | threshold, white % |
| Auto rotate | S | missing | U5 | scanned | OSD |
| Linearize (fast web view) | S | missing | U5 | reports | n/a |

## Convert to PDF
| Tool | From | Status | Unit | Must handle | Key options |
|---|---|---|---|---|---|
| Image to PDF | I S | partial | U3 | images JPG/PNG/WEBP/HEIC/TIFF multi-page | orientation, A4/Letter/fit, margin 0/20/40, merge all, EXIF |
| Word to PDF | I S | have | U4 | office docx | hifi text |
| PowerPoint to PDF | I S | have | U4 | office pptx | hifi |
| Excel to PDF | I S | have | U4 | office xlsx | paginate |
| HTML to PDF | I S | partial | U4 | n/a (pasted) | page size, margin, one long page |
| Markdown / TXT / RTF / ODT / CSV to PDF | S | partial | U5 | office | n/a |

## Convert from PDF
| Tool | From | Status | Unit | Must handle | Key options |
|---|---|---|---|---|---|
| PDF to JPG/PNG | I S | have | U3 | reports, intl, quirks JPX/JBIG2/CMYK | page or extract images, 150/300 dpi |
| PDF to Word | I S | partial | U4 | reports multi-column, invoices, intl RTL, scanned | flow/exact, OCR when scanned |
| PDF to PowerPoint | I S | partial | U4 | reports | editable text boxes |
| PDF to Excel | I S | partial | U4 | invoices, reports FDIC | numbers, dates, leading zeros, join pages |
| PDF to Markdown | I | have | U4 | reports | tables, headings |
| PDF to text / HTML / CSV / EPUB | S | missing | U5 | reports | n/a |
| PDF to PDF/A | I S | missing | U5 | reports | 1b/2b/3b, needs AGPL decision |
| Extract images | S | missing | U5 | reports, quirks JPX | png/jpg |

## Edit
| Tool | From | Status | Unit | Must handle | Key options |
|---|---|---|---|---|---|
| Edit PDF (add) | I S | have | U3 | quirks rotated, intl | text/image/shape/ink/highlight, non-Latin text |
| Edit existing text | I S | missing | U5 | reports, invoices | replace text, font match |
| Watermark | I S | partial | U3 | quirks rotated/mediabox, intl | text/image, 3x3 grid, mosaic, opacity, rotation, over/under, fonts incl. CJK |
| Page numbers | I S | partial | U3 | quirks rotated, reports | 3x3 grid, margin, first number, skip pages, facing pages, `{n}` `{p}` templates, Bates |
| Crop | I S | partial | U3 | quirks rotated/mediabox, scanned | all/current page, auto-crop |
| Forms (fill/create) | I S | partial | U3 | forms IRS/USCIS/UK, XFA | all field types, XFA warning, flatten |
| Stamp | S | missing | U5 | reports | text/image, grid, margin |
| N-up | S | missing | U5 | reports | 2/4/9/16, order, border |
| Booklet | S | missing | U5 | reports | spine, gutter, duplex |
| Overlay PDFs | S | missing | U5 | reports | sequential/interleaved, fore/background |
| Scale / page size | S | missing | U5 | mixed sizes | A-sizes, Letter, factor |
| Adjust colours / invert / replace | S | missing | U5 | reports, scanned | contrast, brightness, invert, high contrast |
| Bookmarks / TOC editor | S | missing | U5 | quirks outlines | tree edit |
| Metadata editor | S | missing | U5 | reports | all info fields, delete all |
| Attachments | S | missing | U5 | quirks encrypted-attachment | add/list/extract/remove |
| Remove annotations / images | S | missing | U5 | quirks annotations | n/a |

## Security
| Tool | From | Status | Unit | Must handle | Key options |
|---|---|---|---|---|---|
| Protect | I S | partial | U3 | reports | user + owner pw, 7 permissions, strength checklist, verified |
| Unlock | I S | partial | U1 U3 | quirks encrypted (manifest pw), derived owner-only | per-file password, same pw for all |
| Change permissions | S | missing | U5 | derived owner-only | 8 flags |
| Sign (visual) | I S | partial | U3 | quirks rotated, forms | draw/type/upload, initials, date, multi-place, script fonts |
| Certificate sign + validate | S | missing | U5 | reports | PKCS12/PEM, visible stamp, validate |
| Redact | I S | partial | U3 | reports, invoices, quirks rotated, intl | search, regex, patterns (email/phone/card), whole page, true removal |
| Compare | I S | have | U3 | reports (2 versions) | text + overlay, inserted pages |
| Sanitize | S | missing | U5 | quirks (JS, attachments) | JS, files, metadata, links |
| Flatten | S | missing | U5 | forms, quirks annotations | forms only / full |
| Show JavaScript / PDF info | S | missing | U5 | quirks | fonts, images, forms, encryption |

## Workflow and shell
| Feature | From | Status | Unit | Done when |
|---|---|---|---|---|
| Workbench layout (tool panel, viewer, page editor, file grid, options panel) | S | missing | U2 | design critique passes, mobile works |
| Files persist across tools and reloads | S | missing | U2 | IndexedDB, wipe button |
| Result screen + continue with another tool | I S | missing | U2 | every tool |
| Version history per file, undo | S | missing | U2 | n/a |
| Progress bar + cancel | I S | missing | U2 | every long tool |
| Automate (saved tool chains) | I S | missing | U5 | run chain on many files |
| Large files (500 MB, 1000 pages) | S | missing | U1 | corpus large/ runs without crash |
| Offline (OCR + core tools) | n/a | missing | U3 | works with network off after first load |
