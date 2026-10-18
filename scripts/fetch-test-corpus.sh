#!/usr/bin/env bash
# Rebuilds the SwissPDF real-world test corpus into ./test-corpus (gitignored).
# Files are untrusted: this script only downloads, it never opens them.
# Usage: bash scripts/fetch-test-corpus.sh
# Line format: get <relative path> <url|commons:File name> "<stresses>" "<password>" "<licence/basis>"
# docs/research/test-corpus.md is generated from the `get` lines below.
cd "$(dirname "$0")/.." || exit 1
OUT=test-corpus
UA="Mozilla/5.0 (SwissPDF test corpus fetch)"
PDFJS=https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs
PDF20=https://raw.githubusercontent.com/pdf-association/pdf20examples/master
POI=https://raw.githubusercontent.com/apache/poi/trunk/test-data
INV=https://raw.githubusercontent.com/invoice-x/invoice2data/master/tests/compare
PIL=https://raw.githubusercontent.com/python-pillow/Pillow/main/Tests/images
OHCHR=https://www.ohchr.org/sites/default/files/UDHR/Documents/UDHR_Translations
IRS=https://www.irs.gov/pub/irs-pdf
FAIL=0

get() {
  local path="$1" url="$2"
  mkdir -p "$OUT/$(dirname "$path")"
  [ -s "$OUT/$path" ] && return 0
  if [[ "$url" == commons:* ]]; then
    local name="${url#commons:}"
    url="https://commons.wikimedia.org/wiki/Special:FilePath/${name// /_}"
    sleep 3
  fi
  if curl -fsSL --globoff -m 600 --retry 3 --retry-max-time 120 -A "$UA" -o "$OUT/$path.part" "$url"; then
    mv "$OUT/$path.part" "$OUT/$path"; echo "ok   $path"
  else
    rm -f "$OUT/$path.part"; echo "FAIL $path ($url)"; FAIL=$((FAIL+1))
  fi
}

# ---- forms ----
get forms/irs-f1040.pdf "$IRS/f1040.pdf" "AcroForm, many fields, calculated fields, JS" "" "US federal government work, public domain"
get forms/irs-fw9.pdf "$IRS/fw9.pdf" "AcroForm, checkboxes, comb text fields" "" "US federal government work, public domain"
get forms/irs-fw4.pdf "$IRS/fw4.pdf" "AcroForm, multi-page worksheets" "" "US federal government work, public domain"
get forms/irs-f1040sa.pdf "$IRS/f1040sa.pdf" "AcroForm, schedule with numeric fields" "" "US federal government work, public domain"
get forms/uscis-i-9.pdf "https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf" "Fillable USCIS form, dynamic/XFA-style layout, many fields" "" "US federal government work, public domain"
get forms/uscis-i-485.pdf "https://www.uscis.gov/sites/default/files/document/forms/i-485.pdf" "Long fillable USCIS form, barcodes, many fields" "" "US federal government work, public domain"
get forms/uk-IPPH353.pdf "https://assets.publishing.service.gov.uk/media/689f0df62e8cc8ec5b3572de/IPPH353-Online_version.pdf" "Fillable UK gov form (Veterans UK)" "" "UK Open Government Licence v3.0"
get forms/uk-AFPS-Form-17.pdf "https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/860656/AFPS_Form_17.pdf" "Fillable UK gov form (Veterans UK)" "" "UK Open Government Licence v3.0"
get forms/xfa-imm1344e-filled.pdf "$PDFJS/xfa_filled_imm1344e.pdf" "XFA form (Canadian gov IMM 1344E), filled, hybrid with AcroForm" "" "pdf.js test corpus (Apache-2.0 repo)"
get forms/xfa-issue14315.pdf "$PDFJS/xfa_issue14315.pdf" "Small XFA form" "" "pdf.js test corpus (Apache-2.0 repo)"
get forms/annotation-button-widget.pdf "$PDFJS/annotation-button-widget.pdf" "Button widgets: checkbox, radio, push" "" "pdf.js test corpus (Apache-2.0 repo)"
get forms/annotation-choice-widget.pdf "$PDFJS/annotation-choice-widget.pdf" "Choice widgets: combo and list boxes" "" "pdf.js test corpus (Apache-2.0 repo)"
get forms/annotation-text-widget.pdf "$PDFJS/annotation-text-widget.pdf" "Text widgets, multiline, comb, password flags" "" "pdf.js test corpus (Apache-2.0 repo)"

# ---- scanned ----
get scanned/lincoln-ellsworth-letter-1861.pdf "commons:Lincoln's Ellsworth letter (IA lincolnsellsw3139linc).pdf" "Scanned 19th century letter pages (IA), small" "" "Public domain (Wikimedia Commons / Internet Archive)"
get scanned/letter-to-benjamin-glover.pdf "commons:Letter to Benjamin Glover (IA LetterBenjaminGlover).pdf" "Scanned handwritten letter, 2 pages, wide page size" "" "Public domain (Wikimedia Commons / Internet Archive)"
get scanned/fax-jean-schmidt-doe.pdf "commons:Jean Schmidt Fax to Department of Energy.pdf" "Real fax scan, low resolution bitonal" "" "Public domain US government work (Wikimedia Commons)"
get scanned/fips-document-facsimile-transmission.pdf "commons:Federal Information Processing Standards Publication- procedures for document facsimile transmission (IA federalinformati148nati).pdf" "72 page scanned government publication, image plus hidden text" "" "Public domain (Wikimedia Commons / Internet Archive)"
get scanned/queen-victoria-peabody-letter-1866.pdf "commons:Queen Victoria Letter And George Peabody 1866 (IA QueenVictoriaLetterAndGeorgePeabody1866).pdf" "38 page scanned archive set, 6 MB" "" "Public domain (Wikimedia Commons / Internet Archive)"
get scanned/ndl-konoye-handwritten-request.pdf "commons:NDL12921305 Pros. Doc. No. 1468- Handwritten request to throne made by Prince KONOYE, to be relieved of post of Prime Minister.pdf" "Large page size (3087x3950 px) handwritten Japanese scan, 37 pages" "" "Public domain (Wikimedia Commons / National Diet Library)"
get scanned/handwritten-field-trips-notebook-1950.pdf "commons:Field trips, 1950 - handwritten notebook, 1950-1951. (IA CAT31321542).pdf" "Handwritten notebook scan, 57 pages, no usable OCR" "" "Public domain (Wikimedia Commons / Internet Archive)"
get scanned/darwin-origin-of-species-ia.pdf "https://archive.org/download/originofspecies00darwuoft/originofspecies00darwuoft.pdf" "Internet Archive scanned book, JBIG2/JPX-style image layers plus OCR text" "" "Public domain (Internet Archive)"

# ---- reports ----
get reports/us-economic-report-president-2024.pdf "https://www.govinfo.gov/content/pkg/ERP-2024/pdf/ERP-2024.pdf" "Born-digital government report: tables, charts, footnotes" "" "US federal government work, public domain"
get reports/us-budget-2024.pdf "https://www.govinfo.gov/content/pkg/BUDGET-2024-BUD/pdf/BUDGET-2024-BUD.pdf" "Budget document: dense tables, bookmarks" "" "US federal government work, public domain"
get reports/fdic-quarterly-banking-profile-2023q4.pdf "https://www.fdic.gov/analysis/quarterly-banking-profile/qbp/2023dec/qbp.pdf" "Financial report with charts and tables" "" "US federal government work, public domain"
get reports/ipcc-ar6-synthesis-longer-report.pdf "https://www.ipcc.ch/report/ar6/syr/downloads/report/IPCC_AR6_SYR_LongerReport.pdf" "Multi-column report, vector charts, figures (downloaded from source, not redistributed)" "" "IPCC publicly downloadable; check IPCC terms before redistributing"
get reports/arxiv-1706.03762-attention.pdf "https://arxiv.org/pdf/1706.03762" "Math, figures, 2 column-ish ML paper" "" "arXiv open access (author licence, CC BY 4.0 for this paper)"
get reports/arxiv-1810.04805-bert.pdf "https://arxiv.org/pdf/1810.04805" "Two-column paper with tables and math" "" "arXiv open access (author-distributed)"
get reports/arxiv-2005.14165-gpt3.pdf "https://arxiv.org/pdf/2005.14165" "75 page paper, many tables and plots" "" "arXiv open access (author-distributed)"
get reports/arxiv-1512.03385-resnet.pdf "https://arxiv.org/pdf/1512.03385" "Two-column paper with figures and equations" "" "arXiv open access (author-distributed)"
get reports/arxiv-2307.09288-llama2.pdf "https://arxiv.org/pdf/2307.09288" "77 page two-column paper, embedded images, tables" "" "arXiv open access (author-distributed)"
get reports/pdfjs-tracemonkey.pdf "$PDFJS/tracemonkey.pdf" "Classic two-column academic paper with figures" "" "pdf.js test corpus (Apache-2.0 repo)"
get reports/pdfjs-TAMReview.pdf "$PDFJS/TAMReview.pdf" "Born-digital journal article, multi-column" "" "pdf.js test corpus (Apache-2.0 repo)"

# ---- large ----
get large/911-commission-report.pdf "https://www.govinfo.gov/content/pkg/GPO-911REPORT/pdf/GPO-911REPORT.pdf" "585 page government report, bookmarks, long text" "" "US federal government work, public domain"
get large/explorations-bible-lands-956pp-62MB.pdf "commons:Explorations in Bible lands during the 19th century (IA gri 33125007229756).pdf" "956 pages and 62 MB: 300+ pages and heavy page images" "" "Public domain (Wikimedia Commons / Internet Archive)"
get large/19th-century-young-man-57MB.pdf "commons:The 19th century young man, a series of lectures (IA 19thcenturyyoung00myer).pdf" "57 MB, 178 page image scan" "" "Public domain (Wikimedia Commons / Internet Archive)"
get large/crooked-paths-1648-104MB.pdf "commons:Crooked paths made straight- ... 1648 (IA bim early-english-books-1641-1700 crooked-paths-made-strai yemans-anne 1648).pdf" "104 MB, 255 page bitonal early book scan: memory stress" "" "Public domain (Wikimedia Commons / Internet Archive)"

# ---- intl ----
get intl/udhr-chinese-simplified.pdf "$OHCHR/chn.pdf" "CJK (Simplified Chinese) text, embedded CID fonts" "" "UN OHCHR UDHR translation, free to reproduce"
get intl/udhr-japanese.pdf "$OHCHR/jpn.pdf" "CJK (Japanese) text, embedded fonts" "" "UN OHCHR UDHR translation, free to reproduce"
get intl/udhr-korean.pdf "$OHCHR/kkn.pdf" "CJK (Korean) Hangul text" "" "UN OHCHR UDHR translation, free to reproduce"
get intl/udhr-hebrew.pdf "$OHCHR/hbr.pdf" "Hebrew RTL text" "" "UN OHCHR UDHR translation, free to reproduce"
get intl/udhr-hindi.pdf "$OHCHR/hnd.pdf" "Hindi Devanagari shaping, conjuncts" "" "UN OHCHR UDHR translation, free to reproduce"
get intl/udhr-arabic.pdf "https://resi.tu-dortmund.de/storages/resi/w/bilder/2023/UDHR_Arabic.pdf" "Arabic RTL text, contextual shaping (OHCHR text, third-party copy)" "" "UN UDHR text, free to reproduce"
get intl/pdfjs-ArabicCIDTrueType.pdf "$PDFJS/ArabicCIDTrueType.pdf" "Arabic CID TrueType font" "" "pdf.js test corpus (Apache-2.0 repo)"
get intl/pdfjs-ThuluthFeatures.pdf "$PDFJS/ThuluthFeatures.pdf" "Arabic Thuluth font features, ligatures" "" "pdf.js test corpus (Apache-2.0 repo)"
get intl/pdfjs-noembed-sjis.pdf "$PDFJS/noembed-sjis.pdf" "Japanese Shift-JIS, non-embedded CJK fonts" "" "pdf.js test corpus (Apache-2.0 repo)"
get intl/pdfjs-noembed-eucjp.pdf "$PDFJS/noembed-eucjp.pdf" "Japanese EUC-JP, non-embedded CJK fonts" "" "pdf.js test corpus (Apache-2.0 repo)"
get intl/pdfjs-vertical.pdf "$PDFJS/vertical.pdf" "Vertical writing mode (CJK)" "" "pdf.js test corpus (Apache-2.0 repo)"
get intl/pdfjs-arial_unicode_ab_cidfont.pdf "$PDFJS/arial_unicode_ab_cidfont.pdf" "Unicode CID font text" "" "pdf.js test corpus (Apache-2.0 repo)"

# ---- quirks (pdf.js corpus) ----
get quirks/pdfjs-rotation.pdf "$PDFJS/rotation.pdf" "Pages with /Rotate 0/90/180/270" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-rotated.pdf "$PDFJS/rotated.pdf" "Rotated pages" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-hello_world_rotated.pdf "$PDFJS/hello_world_rotated.pdf" "Rotated page, tiny" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-issue1155r.pdf "$PDFJS/issue1155r.pdf" "Non-zero origin MediaBox" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-issue11555.pdf "$PDFJS/issue11555.pdf" "Unusual MediaBox/CropBox" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-bug1020226.pdf "$PDFJS/bug1020226.pdf" "Tiny, malformed page tree/box" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-xref_command_missing.pdf "$PDFJS/xref_command_missing.pdf" "Broken xref (xref keyword missing), needs recovery" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-Pages-tree-refs.pdf "$PDFJS/Pages-tree-refs.pdf" "Page tree with circular/odd refs" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-poppler-742-0-fuzzed.pdf "$PDFJS/poppler-742-0-fuzzed.pdf" "Fuzzed/corrupt file, must fail gracefully" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-poppler-395-0-fuzzed.pdf "$PDFJS/poppler-395-0-fuzzed.pdf" "Fuzzed/corrupt file, must fail gracefully" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-jbig2_symbol_offset.pdf "$PDFJS/jbig2_symbol_offset.pdf" "JBIG2 symbol dictionary image" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-jbig2_file_header.pdf "$PDFJS/jbig2_file_header.pdf" "JBIG2 with file header" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-bitmap-symbol-empty.pdf "$PDFJS/bitmap-symbol-empty.pdf" "JBIG2 empty bitmap symbol" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-bug_jpx.pdf "$PDFJS/bug_jpx.pdf" "JPX (JPEG 2000) image" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-jpx_subsampling.pdf "$PDFJS/jpx_subsampling.pdf" "JPX with subsampled components" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-jpx_smaskindata.pdf "$PDFJS/jpx_smaskindata.pdf" "JPX with SMaskInData alpha" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-cmykjpeg.pdf "$PDFJS/cmykjpeg.pdf" "CMYK JPEG (DCT) image" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-function_based_shading_cmyk.pdf "$PDFJS/function_based_shading_cmyk.pdf" "CMYK function-based shading" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-devicen.pdf "$PDFJS/devicen.pdf" "DeviceN colour space" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-simpletype3font.pdf "$PDFJS/simpletype3font.pdf" "Type3 font" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-Type3WordSpacing.pdf "$PDFJS/Type3WordSpacing.pdf" "Type3 font word spacing" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-annotation-highlight.pdf "$PDFJS/annotation-highlight.pdf" "Highlight annotations with appearance streams" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-annotation-line.pdf "$PDFJS/annotation-line.pdf" "Line annotations" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-annotation-freetext.pdf "$PDFJS/annotation-freetext.pdf" "FreeText annotations" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-annotation-stamp.pdf "$PDFJS/annotation-stamp.pdf" "Stamp annotations" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-annotation-fileattachment.pdf "$PDFJS/annotation-fileattachment.pdf" "FileAttachment annotations" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-annotation-highlight-without-appearance.pdf "$PDFJS/annotation-highlight-without-appearance.pdf" "Annotation lacking appearance stream" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-nested_outline.pdf "$PDFJS/nested_outline.pdf" "Nested outlines/bookmarks" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-outlines_se.pdf "$PDFJS/outlines_se.pdf" "Outlines with structure elements" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-outline_goto_action.pdf "$PDFJS/outline_goto_action.pdf" "Outline items using GoTo actions" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-empty_protected.pdf "$PDFJS/empty_protected.pdf" "Encrypted, restricted permissions (empty user password, owner password set)" "(open with empty password; owner password not in manifest)" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-encrypted-attachment.pdf "$PDFJS/encrypted-attachment.pdf" "Encrypted embedded attachment" "see test/test_manifest.json" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-issue3371.pdf "$PDFJS/issue3371.pdf" "Encrypted, user password required" "ELXRTQWS" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-issue6010_1.pdf "$PDFJS/issue6010_1.pdf" "Encrypted, user password required" "abc" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-issue6010_2.pdf "$PDFJS/issue6010_2.pdf" "Encrypted, non-ASCII password" "æøå" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-bug1782186.pdf "$PDFJS/bug1782186.pdf" "Encrypted, user password required" "Hello" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-issue21579.pdf "$PDFJS/issue21579.pdf" "Encrypted, accented password" "pässwört" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-issue15893_reduced.pdf "$PDFJS/issue15893_reduced.pdf" "Encrypted, user password required" "test" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-saslprep-r6.pdf "$PDFJS/saslprep-r6.pdf" "AES-256 (R6) encryption with SASLprep password" "SªSL­prep (S, U+00AA, S, L, U+00AD soft hyphen, p, r, e, p; check manifest)" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-openoffice.pdf "$PDFJS/openoffice.pdf" "OpenOffice-produced PDF, subset fonts" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-alphatrans.pdf "$PDFJS/alphatrans.pdf" "Transparency / alpha blending" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-blendmode.pdf "$PDFJS/blendmode.pdf" "Blend modes" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdfjs-tracemonkey_with_annotations.pdf "$PDFJS/tracemonkey_with_annotations.pdf" "Real paper with many annotations" "" "pdf.js test corpus (Apache-2.0 repo)"
get quirks/pdf20-simple.pdf "$PDF20/Simple%20PDF%202.0%20file.pdf" "PDF 2.0 minimal" "" "pdf-association/pdf20examples (CC0/public)"
get quirks/pdf20-image-bpc.pdf "$PDF20/PDF%202.0%20image%20with%20BPC.pdf" "PDF 2.0 image with BitsPerComponent" "" "pdf-association/pdf20examples (CC0/public)"
get quirks/pdf20-incremental-save.pdf "$PDF20/PDF%202.0%20via%20incremental%20save.pdf" "PDF 2.0 via incremental update" "" "pdf-association/pdf20examples (CC0/public)"
get quirks/pdf20-offset-start.pdf "$PDF20/PDF%202.0%20with%20offset%20start.pdf" "PDF 2.0 with junk before %PDF header" "" "pdf-association/pdf20examples (CC0/public)"
get quirks/pdf20-page-output-intent.pdf "$PDF20/PDF%202.0%20with%20page%20level%20output%20intent.pdf" "PDF 2.0 page-level output intent" "" "pdf-association/pdf20examples (CC0/public)"
get quirks/pdf20-utf8-annotation.pdf "$PDF20/PDF%202.0%20UTF-8%20string%20and%20annotation.pdf" "PDF 2.0 UTF-8 strings" "" "pdf-association/pdf20examples (CC0/public)"
get quirks/pdf20-utf8-test.pdf "$PDF20/pdf20-utf8-test.pdf" "PDF 2.0 UTF-8 test" "" "pdf-association/pdf20examples (CC0/public)"

# ---- invoices (invoice2data test set, real vendor invoices) ----
get invoices/aws-invoice.pdf "$INV/AmazonWebServices.pdf" "Real cloud invoice, tables" "" "invoice2data repo (MIT)"
get invoices/azure-interior.pdf "$INV/AzureInterior.pdf" "Odoo-style invoice" "" "invoice2data repo (MIT)"
get invoices/flipkart-invoice.pdf "$INV/FlipkartInvoice.pdf" "Retail invoice, GST layout" "" "invoice2data repo (MIT)"
get invoices/netpresse-invoice.pdf "$INV/NetpresseInvoice.pdf" "French invoice" "" "invoice2data repo (MIT)"
get invoices/quality-hosting.pdf "$INV/QualityHosting.pdf" "German hosting invoice" "" "invoice2data repo (MIT)"
get invoices/coolblue.pdf "$INV/coolblue1.pdf" "Dutch retail invoice" "" "invoice2data repo (MIT)"
get invoices/free-fiber.pdf "$INV/free_fiber.pdf" "Telecom bill, multi-section" "" "invoice2data repo (MIT)"
get invoices/oyo.pdf "$INV/oyo.pdf" "Hospitality invoice" "" "invoice2data repo (MIT)"
get invoices/saeco.pdf "$INV/saeco.pdf" "Italian invoice" "" "invoice2data repo (MIT)"
get invoices/camelot-bol.pdf "https://raw.githubusercontent.com/invoice-x/invoice2data/master/tests/files/camelot-bol100649863.pdf" "Bill of lading style table form" "" "invoice2data repo (MIT)"

# ---- office ----
get office/poi-sample.docx "$POI/document/sample.docx" "Basic Word doc" "" "Apache POI test data (Apache-2.0)"
get office/poi-VariousPictures.docx "$POI/document/VariousPictures.docx" "Word with several image types" "" "Apache POI test data (Apache-2.0)"
get office/poi-table_footnotes.docx "$POI/document/table_footnotes.docx" "Word tables and footnotes" "" "Apache POI test data (Apache-2.0)"
get office/poi-chartex.docx "$POI/document/chartex.docx" "Word with extended chart" "" "Apache POI test data (Apache-2.0)"
get office/poi-SampleSS.xlsx "$POI/spreadsheet/SampleSS.xlsx" "Basic spreadsheet" "" "Apache POI test data (Apache-2.0)"
get office/poi-WithThreeCharts.xlsx "$POI/spreadsheet/WithThreeCharts.xlsx" "Excel with three charts" "" "Apache POI test data (Apache-2.0)"
get office/poi-Tables.xlsx "$POI/spreadsheet/Tables.xlsx" "Excel tables" "" "Apache POI test data (Apache-2.0)"
get office/poi-picture.xlsx "$POI/spreadsheet/picture.xlsx" "Excel with embedded picture" "" "Apache POI test data (Apache-2.0)"
get office/poi-SampleShow.pptx "$POI/slideshow/SampleShow.pptx" "Basic PowerPoint" "" "Apache POI test data (Apache-2.0)"
get office/poi-pie-chart.pptx "$POI/slideshow/pie-chart.pptx" "PowerPoint with chart" "" "Apache POI test data (Apache-2.0)"
get office/poi-chart-picture-bg.pptx "$POI/slideshow/chart-picture-bg.pptx" "PowerPoint chart with picture background" "" "Apache POI test data (Apache-2.0)"
get office/poi-table_test.pptx "$POI/slideshow/table_test.pptx" "PowerPoint tables" "" "Apache POI test data (Apache-2.0)"

# ---- images ----
get images/photo-24MP-punjab-smartphone.jpg "commons:A woman in Punjab using a smartphone whilst walking.jpg" "6016x4000 (24 MP) JPEG, 14 MB, EXIF" "" "CC BY 3.0 (Wikimedia Commons)"
get images/photo-castle-3456x2628.jpg "commons:Vyborg 06-2012 Castle 06.jpg" "9 MP JPEG photo" "" "CC BY-SA 3.0 (Wikimedia Commons)"
get images/photo-portrait-sepia-1640x2268.jpg "commons:La Belle Otero, par Jean Reutlinger, sepia.jpg" "Portrait JPEG, sepia" "" "Public domain (Wikimedia Commons)"
get images/png-alpha-transparency-demo.png "commons:PNG transparency demonstration 2.png" "PNG with real alpha channel" "" "CC BY-SA 3.0 (Wikimedia Commons)"
get images/png-webp-comparison-2412x1500.png "commons:Webp - Jpeg - Lossless comparative.png" "Large 3 MB PNG" "" "CC BY-SA 3.0 (Wikimedia Commons)"
get images/webp-chandrayaan-rover.webp "commons:Chandrayaan-3 Rover.webp" "Real WEBP photo" "" "GODL-India (Wikimedia Commons)"
get images/webp-hopper.webp "$PIL/hopper.webp" "WEBP photo (Pillow test image)" "" "Pillow test images (HPND)"
get images/tiff-multipage.tiff "$PIL/multipage.tiff" "Multi-page TIFF" "" "Pillow test images (HPND)"
get images/tiff-multipage-mmap.tiff "$PIL/multipage-mmap.tiff" "Multi-page TIFF" "" "Pillow test images (HPND)"
get images/heic-libheif-example.heic "https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic" "HEIC photo" "" "libheif examples (LGPL repo sample)"
get images/heic-nokia-C001.heic "https://raw.githubusercontent.com/nokiatech/heif_conformance/master/conformance_files/C001.heic" "HEIC conformance file" "" "Nokia HEIF conformance files (see repo licence)"

echo "done, failures: $FAIL"
du -sh "$OUT"
