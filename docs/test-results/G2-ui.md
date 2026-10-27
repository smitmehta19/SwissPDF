# G2-ui: G2 tools in the shell UI

Run-to-result = click on Run until the result screen shows. Base http://127.0.0.1:59001. 2026-10-27T21:12:05.916Z

| Tool | Pass | Median Run-to-result |
|---|---|---|
| repair | 5/5 | 0.4 s |
| ocr | 3/3 | 17.4 s |
| autorotate | 3/3 | 6.6 s |
| protect | 3/3 | 0.9 s |
| unlock | 3/3 | 0.9 s |
| compare | 3/3 | 0.9 s |
| health | 3/3 | 12.9 s |

| Tool | File | Result | Time | Detail |
|---|---|---|---|---|
| repair | quirks/pdfjs-xref_command_missing.pdf | PASS | 1.0 s | 1 pages, Rebuilt the file structure. All 1 page kept as they were, with any bookmarks, links and form fields. |
| repair | quirks/pdfjs-poppler-395-0-fuzzed.pdf | PASS | - | rejected on add: PDFpdfjs-poppler-395-0-fuzzed.pdfCan't open this PDF. The file looks damaged or incomplete.DetailsNot a valid PDF. pdf-lib: Expected instance of PDFDict2, but g |
| repair | quirks/pdfjs-poppler-742-0-fuzzed.pdf | PASS | - | rejected on add: PDFpdfjs-poppler-742-0-fuzzed.pdfCan't open this PDF. The file looks damaged or incomplete.DetailsNot a valid PDF. pdf-lib: _this.catalog.Pages is not a functio |
| repair | quirks/pdfjs-Pages-tree-refs.pdf (extra, for timing) | PASS | 0.1 s | no new version: Nothing to do: It was already repaired when it was added, nothing more to fix. |
| repair | quirks/pdf20-offset-start.pdf (extra, for timing) | PASS | 0.4 s | 1 pages, Rebuilt the file structure. All 1 page kept as they were, with any bookmarks, links and form fields. |
| ocr | scanned/fax-jean-schmidt-doe.pdf (read every page) | PASS | 16.3 s | 2290 chars of text, 414 words recognised on 2 pages. The old invisible text layer was replaced on 2 pages. |
| ocr | scanned/lincoln-ellsworth-letter-1861.pdf | PASS | 54.9 s | 3059 chars of text, 95 words recognised on 24 pages. 12 pages already had text and stayed as they were. |
| ocr | derived/sub-ndl-konoye-p1.pdf | PASS | 17.4 s | 89 chars of text, 21 words recognised on 1 page. |
| autorotate | scanned/fax-jean-schmidt-doe.pdf (turned 90) | PASS | 3.7 s | 2 of 2 pages back upright, 0 wrong, 2 pages turned upright (p. 1-2). |
| autorotate | scanned/lincoln-ellsworth-letter-1861.pdf (turned 90) | PASS | 34.4 s | 36 of 36 pages back upright, 0 wrong, 36 pages turned upright (p. 1-36). |
| autorotate | derived/sub-ndl-konoye-p1.pdf (turned 90) | PASS | 6.6 s | no new version: Nothing to do: Every page was already upright. 1 page had too little text to tell and stayed as it was. |
| protect | reports/pdfjs-tracemonkey.pdf | PASS | 1.5 s | Standard V5 R6 256-bit AES, opens with the password |
| protect | invoices/aws-invoice.pdf | PASS | 0.3 s | Standard V4 R4 128-bit AES, opens freely |
| protect | forms/irs-fw9.pdf | PASS | 0.9 s | Standard V1 R2 40-bit RC4, opens with the password |
| unlock | derived/owner-only-aws-invoice.pdf | PASS | 0.9 s | None, 1 pages, 1921 chars, Its protection was already removed when it was added. |
| unlock | derived/user-pw-TAMReview.pdf (with a plain PDF, Pages and Viewer opened first) | PASS | 0.3 s | None, 23 pages, 65271 chars, Password removed. Not protected, left out: pdfjs-tracemonkey.pdf. |
| unlock | quirks/pdfjs-saslprep-r6.pdf | PASS | 1.1 s | None, 1 pages, 18 chars, Password removed. |
| compare | derived/compare-tracemonkey-base.pdf vs derived/compare-tracemonkey-inserted.pdf | PASS | 1.1 s | 1213 words added, 0 removed, on 1 of 6 page pairs. / Not in the original, changed p. 3 (1 of 1, new page) |
| compare | reports/pdfjs-TAMReview.pdf vs reports/pdfjs-TAMReview.pdf | PASS | 0.9 s | The text of both documents is the same. /  |
| compare | invoices/aws-invoice.pdf vs derived/origin-shift-aws-invoice.pdf | PASS | 0.4 s | The text of both documents is the same. /  |
| health | run 1 | PASS | 13.4 s | All 49 checks passed. Every tool works in this browser. |
| health | run 2 | PASS | 12.9 s | All 49 checks passed. Every tool works in this browser. |
| health | run 3 | PASS | 12.9 s | All 49 checks passed. Every tool works in this browser. |
