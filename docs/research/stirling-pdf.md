# Stirling PDF research (for SwissPDF)

Date: 2026-10-17. Method: GitHub API/raw of `Stirling-Tools/Stirling-PDF` main (94k stars), docs.stirlingpdf.com, stirling.com. Source files read as data only; nothing copied into the project.
Base URLs: repo `https://github.com/Stirling-Tools/Stirling-PDF`; frontend `.../tree/main/frontend/editor/src/core`; backend controllers `.../tree/main/app/core/src/main/java/stirling/software/SPDF/controller/api`; engine registry `.../app/common/src/main/java/stirling/software/SPDF/config/EndpointConfiguration.java`.
Note: repo layout changed since v1. Now `app/` (Java Spring backend: core, common, proprietary, saas), `engine/` (Python, AI), `frontend/editor` (React 19 + Mantine 8 + Tailwind 4 + Tauri desktop).

## 1. Tool inventory

Their UI categories: Recommended (Multi-Tool, Merge, Compare, Compress, Convert, OCR, Redact, PDF Text Editor), Standard, Advanced. Subcategories: Signing, Document Security, Verification, Document Review, Page Formatting, Extraction, Removal, Automation, General, Advanced Formatting, Developer Tools, AI. Source: `data/toolsTaxonomy.ts`, `data/useTranslatedToolRegistry.tsx`.
Option defaults below come from `hooks/tools/*/use*Parameters.ts`. "Gap" = SwissPDF likely lacks it (vs your known list).

### Recommended / general
| Tool | Options (default) | Gap |
|---|---|---|
| Merge | removeDigitalSignature (off), generateTableOfContents (off); file sort/reorder | TOC gen, strip sigs |
| Multi-Tool | page-editor style combined tool (rotate/delete/move/split/insert blank per page) | partly (organize) |
| PDF Text Editor | edit text in place, font fallback, charcode controller | SwissPDF has "edit"; check text reflow |
| Compare | mode text/pixel (text), pixelDpi 150, pixelThreshold 0.1; base+comparison file | have |
| Compress | method quality/filesize (quality); level 1-9 (5); grayscale off; lineArt off, lineArtThreshold 50, lineArtEdgeLevel 1-3 (3); target size value + KB/MB (MB); linearize off. Levels 1-3 light, 4-6 medium, 7+ aggressive | target-size, line-art, linearize |
| Convert | see Convert section below | many |
| OCR | ocrType skip-text / force-ocr / Normal (skip-text); ocrRenderType hocr (hocr, sandwich); languages[] (multi); additionalOptions[] (e.g. deskew, clean) | have base; options gap |
| Redact | mode automatic/manual (automatic); wordsToRedact[]; useRegex off; wholeWordSearch off; caseSensitive off; redactColor #000000; customPadding 0.1; convertPDFToImage off (true-redact flatten) | regex, padding, flatten-to-image |

### Signing / security / verification
| Tool | Options | Gap |
|---|---|---|
| Sign | type canvas/image/text (canvas); reason "Document signing", location "Digital", signerName; fontFamily Helvetica, fontSize 16, textColor #000, align left; script fonts Allura, Caveat, Dancing Script, Great Vibes, Homemade Apple, Mrs Saint Delafield | script fonts; saved signatures |
| Certificate Sign | signMode MANUAL/AUTO/DEVICE; certType PEM/PKCS12/PFX/JKS/WINDOWS_STORE/PKCS11; showSignature off, reason, location, name, pageNumber 1, showLogo on | cryptographic signing (gap) |
| Timestamp PDF | tsaUrl (preset list, first = default) | gap |
| Validate Signature | optional cert file | gap |
| Remove Certificate Sign | none | gap |
| Add Password | password, ownerPassword, keyLength 128 (40/128/256) plus permissions | have |
| Remove Password | password, ownerPassword | have |
| Change Permissions | 8 flags all off: preventAssembly, ExtractContent, ExtractForAccessibility, FillInForm, Modify, ModifyAnnotations, Printing, PrintingFaithful | gap |
| Watermark | type text/image; text; fontSize 12; rotation 0; opacity 50; widthSpacer 50; heightSpacer 50; alphabet roman (also arabic, japanese, korean, chinese, thai); color #d3d3d3; convertPDFToImage off | alphabets, tile spacing, flatten |
| Add Stamp | text/image stamp, position grid 1-9, margin, font size, rotation, opacity, color, page selection | gap |
| Sanitize | removeJavaScript on, removeEmbeddedFiles on, removeXMPMetadata off, removeMetadata off, removeLinks off, removeFonts off | gap |
| Flatten | flattenOnlyForms off; renderDpi | gap |
| Unlock PDF Forms | none (removes readonly flag) | gap |
| Form Editor / Auto Form Detection | fill, add/modify/delete fields; AI detect sensitivity low/balanced/high | have forms; auto-detect gap |
| Get ALL Info on PDF | metadata, fonts, images, forms, signatures, compliance, per-page info | partly (health check) |

### Document review
| Tool | Options | Gap |
|---|---|---|
| Read (viewer) | search, thumbnails, annotations, print | have |
| Change Metadata | title, author, subject, keywords, creator, producer, creationDate, modDate, trapped (Unknown/True/False), customMetadata[], deleteAll off | check |
| Edit Table of Contents | replaceExisting, bookmarks tree | gap |
| Annotate / Add Text / Add Image | draw, highlight, text, shapes; image overlay | partly |
| Remove Annotations | none (client-side in v2) | gap |

### Page formatting
| Tool | Options | Gap |
|---|---|---|
| Crop | cropArea rect, autoCrop off, pageNumbers "all" | have; autoCrop |
| Rotate | angle 0/90/180/270 | have |
| Auto Rotate | detectionMode auto/text/osd (auto), confidenceThreshold 14, inferUndetected on | gap |
| Split | methods: byPages, bySections (hDiv 2, vDiv 2, merge off), bySize / byPageCount / byDocCount (splitValue), byChapters (bookmarkLevel 1, includeMetadata, allowDuplicates), byPageDivider (duplexMode), byPoster (pageSize A4, xFactor 2, yFactor 2, rightToLeft) | chapters, divider, poster |
| Reorganize Pages | customMode (custom order via pageNumbers like "1,3,2,4-6", plus preset modes such as reverse, duplex sort, booklet sort, odd-even) | modes gap |
| Adjust Page Size/Scale | scaleFactor 1.0, pageSize KEEP/A-sizes/LETTER/LEGAL, orientation PORTRAIT/LANDSCAPE | gap |
| Add Page Numbers | position grid, start number, pages to number, custom text, font, margin (secondary options not verified) | have |
| Multi-Page Layout (n-up) | mode DEFAULT/CUSTOM; pagesPerSheet 4; rows/cols; orientation; arrangement BY_COLUMNS/BY_ROWS; readingDirection LTR/RTL; margins (inner, top, bottom, left, right); addBorder, borderWidth 1 | gap |
| Booklet Imposition | pagesPerSheet 2; addBorder off; spineLocation LEFT/RIGHT; addGutter off, gutterSize 12; doubleSided on; duplexPass BOTH/FIRST/SECOND; flipOnShortEdge off | gap |
| PDF to Single Large Page | none | gap |
| Manage Attachments | add/list/extract/remove; convertToPdfA3b | gap |
| Create Portfolio | coverTitle | gap |
| Overlay PDFs | overlayFiles[]; mode Sequential/Interleaved/FixedRepeat; position 0 foreground / 1 background; counts[] | gap |

### Extraction / removal
| Tool | Options | Gap |
|---|---|---|
| Extract Pages | pageNumbers ("1,3,5-8") | have |
| Extract Images | format png/jpg/gif (png) | check |
| Remove Pages | pageNumbers | have |
| Remove Blank Pages | threshold 10 (0-255), whitePercent 99.9, includeBlankPages off | gap |
| Remove Images | none | gap |
| Scanner Image Split | angle_threshold 10, tolerance 30, min_area 10000, min_contour_area 500, border_size 1 | gap (needs opencv.js) |

### Advanced
| Tool | Options | Gap |
|---|---|---|
| Repair | none (qpdf/Ghostscript) | have |
| Adjust Colors/Contrast | contrast, brightness, saturation, red, green, blue (all 0-200, 100 neutral) | gap |
| Replace & Invert Color | HIGH_CONTRAST_COLOR / CUSTOM_COLOR / FULL_INVERSION / COLOR_SPACE_CONVERSION; combos WHITE_TEXT_ON_BLACK (default), BLACK_TEXT_ON_WHITE, YELLOW_TEXT_ON_BLACK, GREEN_TEXT_ON_BLACK; custom text #000 / bg #fff | gap |
| Auto Rename | useFirstTextAsFallback off | gap |
| Scanner Effect (backend) | fake-scan look (Ghostscript) | gap |
| Show JavaScript | list embedded JS | gap |
| Other backend utilities | decompress PDF, PDF to/from JSON, PDF to vector, compliance validation (veraPDF), accessibility report | gap |
| Automate / Pipeline | chain tools, saved automations, folder scanning (server) | gap, see section 2 |
| AI tools (Classify, chat, auto form detect) | server/cloud, `engine/` dir | out of scope (privacy) |

### Convert (`constants/convertSupportedFornats.ts`, ConvertParameters)
- To PDF: images (bmp gif jpeg png tif tiff pbm pgm ppm ras xbm xpm svg wmf webp), Office (doc docx dot dotx xls xlsx csv ppt pptx), OpenDocument (odt ods odp odg), rtf, txt, html, md, json, xml, eml, msg, epub/mobi/azw3/fb2, cbz/cbr, zip of images, ps, URL (server only).
- From PDF: image, word (docx/odt), presentation (pptx/odp), text/rtf, html, xml, csv, markdown, PDF/A (strict flag), PDF/UA (profile, language, title, embedFonts, alt text), PDF/X, epub/azw3 (detectChapters, targetDevice), cbz/cbr, vector, video.
- Options: imageOptions colorType, dpi, singleOrMultiple, fitOption, autoRotate, combineImages; htmlOptions.zoomLevel; emailOptions includeAttachments, maxAttachmentSizeMB, downloadHtml, includeAllRecipients.
- Gap for SwissPDF: PDF/A, PDF/UA, PDF/X, epub, cbz, csv, xml, rtf, odt/odp, eml/msg, vector, fb2.

Caveat: option lists are v2 UI defaults from parameter files; secondary options for page numbers, stamp and OCR extras were not verified line by line.

## 2. UI (v2 React frontend)

Source: `components/layout/*`, `components/tools/*`, `types/workbench.ts`, `contexts/*`, `services/*`.
| Area | Finding |
|---|---|
| Stack | React 19, Mantine 8, Tailwind 4, TanStack Query/Virtual/Table, Tauri 2 (desktop), i18next (40+ languages), pdf.js (`pdfjs-dist` 5) + EmbedPDF/PDFium WASM (`@embedpdf/*`), `@cantoo/pdf-lib`, dnd-kit + pragmatic-drag-and-drop, PostHog analytics |
| Layout | `AppFrame`, `TitleBarChrome` + `TitleBarSearch` (global search), left tool panel (`ToolPanel`, `ToolPicker`, `SearchResults`, fullscreen tool list), center `Workbench`, `RightSidebar`, workbench bar with view buttons, `FileManager` modal + files page, toasts, onboarding tour (`@reactour/tour`) |
| Workbench modes | `viewer`, `pageEditor`, `fileEditor`, `myFiles`, `signing`, plus `custom:*` views (e.g. compare) |
| Page editor | Multi-file "tracks": every open PDF is a row of page tiles (`pageTracks/`), drag between tracks, select by number popover, download selected pages, blank page insert, undo/redo (`useUndoRedo`) |
| File editor | Thumbnail grid of open files, drag reorder, merge from selection, status dot per file, add-file card |
| Tool flow | Pick tool, settings in left panel, Run, result replaces input as new version in workbench; chaining = pick next tool on the result |
| Tool panel | Recommended / Standard / Advanced, colored subcategory accents; favorites (star), recently used (`toolUsageTracker`), suggested next tools (`useToolRecommendations`) |
| Pipelines | "Automate" tool: ordered list of tools with saved settings, run on selected files, stored locally (`automationStorage`); server adds folder scanning and `/pipeline` API. Per-tool `supportsAutomate` flag |
| File history | Each file record has `versionNumber`, `originalFileId`, `parentFileId`, `isLeaf`, `toolHistory[]`. Version chain visible in File Manager |
| Persistence | IndexedDB (`indexedDBManager` + `fileStorage`): single table, file stored as Blob by reference (OOM fix), thumbnail with 30 day sliding TTL, `isEncrypted`, versioned migrations, multi-tab blocked/versionchange handling |
| Processing model | Most tools still POST to backend `/api/v1/...`. A growing set runs client-side (PDFium/pdf-lib: viewer, page edits, remove annotations; `useLocalProcessingOnly`). Desktop app bundles the backend |
| Hotkeys | Per-tool shortcuts, defaults `Digit1..9` for first quick-access tools, user-rebindable, conflict-checked (`HotkeyContext`, `utils/hotkeys.ts`); needs >=1 modifier; Ctrl/cmd label |
| Dark mode | `data-theme="dark"` on `<html>`; tokens flip via CSS variables; Mantine theme reads the same variables |
| Other UX | Unsaved-work guard, zip confirmation on multi-output, file drop anywhere, directory drop, mobile scan-to-PDF via QR + PeerJS, tooltips per option, progressive page previews |

### Theme values (`theme/primitives.css`, `dimensions.css`, `colors.css`)
| Token | Value |
|---|---|
| Font | Inter + system stack; mono token; brand font "Alumni Sans"; weights 500, 600 |
| Blue | 400 `#60a5fa`, 500 `#3b82f6`, 600 `#2563eb`, 700 `#1d4ed8` |
| Green | 500 `#22c55e`, 600 `#16a34a`, 700 `#15803d`, 800 `#166534` |
| Amber | 400 `#fbbf24`, 500 `#f59e0b`, 600 `#d97706`, 800 `#92400e` |
| Compare highlights | removed `#ff6b6b` @45%, added `#51cf66` @35% |
| Light | gray 50 `#f9fafb`, 200 `#e5e7eb`, 400 `#9ca3af`, 600 `#4b5563`, 900 `#111827`; surface white, background `#f9fafb`, border `#e5e7eb` |
| Dark (zinc) | text `#f4f4f5`, secondary `#a1a1aa`, muted `#71717a`; elevated `#2a2a2e`, card `#202023`, toolbar/sidebar `#18181b`, page `#0f0f10` |
| Spacing | 4px grid, `--space-1..8` = 4..32px |
| Radius | 2, 4, 8, 12, 16, pill |
| Layout | nav rail 3rem (48px), sidebar 16.25rem (260px) |
| Category accents | removal red-500, security amber-500, formatting blue-400, extraction blue-500, signing green-500, general blue-500, verification amber-600, automation red-400, developer gray-500 |
| Motion | fullscreen panel 0.28s in / 0.22s out |
Their comments: gray-400 as text is 2.3:1 (use gray-600); tertiary text raised to `#64748b` for AA. Reuse lessons, not palette (SwissPDF has its own iris palette).

## 3. Backend engines vs browser/WASM equivalents

Source: `EndpointConfiguration.java` groups, `docker/base/Dockerfile`, `app/core/build.gradle`.
| Operation | Their engine | Browser / WASM option | Licence caution |
|---|---|---|---|
| Merge, split, rotate, reorder, remove, extract, page numbers, watermark, stamp, metadata, attachments (PDFBox "Java" group, ~40 endpoints) | Apache PDFBox 3 | pdf-lib (have), mupdf WASM (have), EmbedPDF PDFium WASM | pdf-lib MIT; mupdf AGPL; PDFium BSD/Apache |
| Repair | qpdf, Ghostscript | qpdf-wasm (e.g. `@jspawn/qpdf-wasm`), mupdf clean + rewrite, Ghostscript WASM | qpdf Apache-2; GS AGPL |
| Compress | qpdf + Ghostscript + ImageMagick + PDFBox image recompress (scale, JPEG quality, grayscale) | mupdf clean/garbage + canvas image recompress, qpdf-wasm object streams/linearize, Ghostscript WASM (heavy, AGPL) | AGPL |
| Crop, replace/invert color, scanner effect, vector | Ghostscript | mupdf + canvas pixel ops; pdf-lib for crop box | |
| OCR | OCRmyPDF + tesseract | tesseract.js (have) + invisible text layer via pdf-lib/mupdf (sandwich) | Apache-2 |
| Auto rotate | tesseract OSD | tesseract.js OSD | |
| Office to PDF, PDF to Word/PPT/RTF/HTML/XML/PDFA | LibreOffice (unoserver pool, own `stirling-office-convert` libs) | LibreOffice WASM via zetajs (have); `docx`/`pptxgenjs`/SheetJS (have) | MPL; big download |
| HTML/URL/Markdown/EML to PDF | WeasyPrint, commonmark | mupdf HTML layout, or browser print; marked + html2canvas fallback | URL fetch blocked by CORS |
| PDF to image / image to PDF | PDFBox/pdfium | pdf.js, mupdf, pdf-lib (have) | |
| PDF to EPUB/AZW3, ebook to PDF | Calibre | no WASM; build EPUB zip in JS (jszip) | skip or JS-only |
| PDF/A, PDF/UA, validation | LibreOffice, Ghostscript, veraPDF, PDFBox preflight | Ghostscript WASM `-dPDFA`; no veraPDF WASM; basic XMP + OutputIntent via pdf-lib | |
| Cert sign / timestamp / validate | BouncyCastle (PEM, P12, JKS, PKCS11, TSA) | pkijs / node-forge + pdf-lib placeholder (PAdES); TSA needs network (CORS) | |
| Scanner image split | OpenCV | opencv.js WASM | Apache-2 |
| Blank page detect, pixel compare | PDFBox + pixelmatch | canvas + pixelmatch | |
| True redact | PDFBox text removal + image convert | mupdf redaction API, or rasterize page | |
| PDF to text/markdown/html/csv | PDFBox, pdftohtml (poppler), tabula | mupdf structured text, pdf.js text content | |
| Passwords / AES-256 | PDFBox | mupdf encrypt/decrypt; pdf-lib cannot encrypt | |
| Forms | PDFBox AcroForm, AI form detect | mupdf widgets, pdf-lib forms | XFA unsupported |
| Pipelines/batch | Spring job executor, temp files | Web Worker pool + IndexedDB queue | |

## 4. Licence

Source: `LICENSE` at repo root; plans page `https://docs.stirlingpdf.com/Server/Licensing/Plans-and-Licences/`.
| Area | Licence |
|---|---|
| Everything not listed below (core Java tools, `app/core`, `app/common`, `frontend/editor/src/core`) | MIT, (c) Stirling PDF Inc. 2025 |
| `app/proprietary/`, `app/saas/`, `engine/` (AI), `frontend/editor/src/proprietary/`, `desktop/`, `saas/`, `cloud/`, `portal/`, `portal-saas/` | "Stirling PDF User License": production use needs paid subscription. Do not copy |
| Plans | Free (5 users; all PDF tools, REST API, OAuth2 SSO), Team (100 users; external DB, clustering, S3, Prometheus, custom metadata), Enterprise (SAML2, audit log, analytics, offline activation). Processor/AI features have a monthly allowance except Enterprise |
| Branding | Name, logo, wordmark, brand red `#8E3131`: do not reuse |
Rules for SwissPDF: copy behaviour, option names and defaults of MIT parts only; reimplement from the tables above; never paste proprietary directories, strings, icons. If any MIT code is ever copied keep its notice. Check that AGPL WASM deps (mupdf, Ghostscript) fit SwissPDF's own licence.

## 5. Real-world failure modes (testing checklist)

Issue links: `https://github.com/Stirling-Tools/Stirling-PDF/issues/<n>`.
| # | Failure mode | Evidence | Test for SwissPDF |
|---|---|---|---|
| 1 | Broken xref, repair fails | #3402, #3920, #4432 | Truncated file, missing `startxref`, bad offsets; repair then open in pdf.js and mupdf; every tool output must re-open |
| 2 | Invalid output after rotate/sign | #3076, #2728 | Rotate then re-open in 3 viewers; /Rotate plus CropBox plus sign coordinates |
| 3 | Rotated-page coordinates for image, stamp, signature | #7796, #6784, #5399, #2246 | Place image/stamp/signature on /Rotate 90/180/270 and non-zero-origin boxes |
| 4 | Encrypted: AES-256 / PDF 2.0, owner-only password, blank user password | #3516, #8232, #6317, #3507, #5916 | RC4-40, AES-128, AES-256 R5/R6, owner-only, wrong password UX; every tool on no-open-password encrypted files |
| 5 | CJK / non-Latin fonts missing | #4102, #915, #661, #6057, #4021 | Watermark, page numbers, stamp, text edit with CJK, Arabic, Hebrew (RTL), Thai, emoji; fallback font embed; OCR chi_sim, jpn, ara |
| 6 | PDF to Word quality (text boxes, wrong content), timeouts | #4338, #5927, #7717 | Multi-column, tables, scanned, 300+ pages; progress and cancel |
| 7 | LibreOffice hangs or crashes | #3829, #3030 | Office to PDF with macros, embedded fonts, huge xlsx; worker timeout and restart |
| 8 | Compress makes file larger, memory not released | #2506, #3489 | Already-optimised PDF (never return larger than input), 200MB scan, repeated-run leak check |
| 9 | Out of memory on large files and batches | #5486, #3478, #5866, #7541, #8247 (Blob from IndexedDB bytes kills tab) | 500MB PDF, 50-file merge, 1000-page render; chunking, Blob by reference, free WASM heap |
| 10 | Edits break digital signatures; merge/OCR of signed docs | #435, #5142 | Warn when modifying signed PDF; offer strip-signature |
| 11 | Hybrid XFA / LiveCycle forms show stale data | #8168 | Detect XFA and warn; AcroForm flatten fallback |
| 12 | Redact changes page size; text still extractable | #2486, #465 | After redact: text extraction empty in area, page boxes unchanged, flatten option |
| 13 | PDF/A validation failures | #7819 | Validate output with veraPDF in CI if PDF/A added |
| 14 | OCR existing text layer, skip vs force | #4666 and OCR modes | Partial-text scans; skip-text vs force; deskew; rotated scans; 600dpi |
| 15 | Form fields lost or read-only after ops | #2965 | Merge/split/flatten with AcroForm; checkboxes, radios, comb fields; appearances regenerate |
| 16 | Page size surprises | #2486 | Non-A4, mixed sizes, UserUnit, huge poster pages |
| 17 | JBIG2 / CCITT / JPX / CMYK JPEG images | they ship jbig2-imageio | Scans using JBIG2, CCITT G4, JPEG2000, CMYK JPEG, 16-bit PNG |
| 18 | Bookmarks, named dests, page labels lost on merge/split | their chapters split + TOC tool | Metadata survives merge/split/compress |
| 19 | Rendering crashes | #7541 | Transparency groups, Type3 fonts, huge dimensions, 10k-page doc |

## 6. Ideas worth matching (behaviour only)
1. Version chain per file with `toolHistory` and undo (chain results without re-upload).
2. Multi-file page tracks editor.
3. Automate: saved ordered pipelines run on many files.
4. Per-tool quick keys, rebindable.
5. Compress by target size, line-art mode, never return larger.
6. Split modes: chapters, size, divider page, poster.
7. N-up, booklet, overlay, scale, single large page, adjust colors, replace/invert colors (pure canvas/pdf-lib).
8. Sanitize, change permissions, remove blanks, auto rotate, auto rename, flatten, metadata editor, TOC editor, attachments.
9. Compare text + pixel with colored highlights.
10. Blob-by-reference storage in IndexedDB (their OOM fix).
