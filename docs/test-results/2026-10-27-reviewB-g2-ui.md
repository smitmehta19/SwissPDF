# 2026-10-27-reviewB-g2-ui: G2 tools in the shell UI

Run-to-result = click on Run until the result screen shows. Base http://127.0.0.1:55899. 2026-10-27T19:02:16.259Z

| Tool | Pass | Median Run-to-result |
|---|---|---|
| repair | 5/5 | 0.4 s |
| autorotate | 3/3 | 4.0 s |
| unlock | 0/3 | 0.9 s |

| Tool | File | Result | Time | Detail |
|---|---|---|---|---|
| repair | quirks/pdfjs-xref_command_missing.pdf | PASS | 0.9 s | 1 pages, Rebuilt the file structure. All 1 page kept as they were, with any bookmarks, links and form fields. |
| repair | quirks/pdfjs-poppler-395-0-fuzzed.pdf | PASS | - | rejected on add: PDFpdfjs-poppler-395-0-fuzzed.pdfCan't open this PDF. The file looks damaged or incomplete.DetailsNot a valid PDF. pdf-lib: Expected instance of PDFDict2, but g |
| repair | quirks/pdfjs-poppler-742-0-fuzzed.pdf | PASS | - | rejected on add: PDFpdfjs-poppler-742-0-fuzzed.pdfCan't open this PDF. The file looks damaged or incomplete.DetailsNot a valid PDF. pdf-lib: _this.catalog.Pages is not a functio |
| repair | quirks/pdfjs-Pages-tree-refs.pdf (extra, for timing) | PASS | 0.1 s | no new version: Nothing to do: Rebuilt the file structure. All 1 page kept as they were, with any bookmarks, links and form fields. Dama |
| repair | quirks/pdf20-offset-start.pdf (extra, for timing) | PASS | 0.4 s | 1 pages, Rebuilt the file structure. All 1 page kept as they were, with any bookmarks, links and form fields. |
| autorotate | scanned/fax-jean-schmidt-doe.pdf (turned 90) | PASS | 3.0 s | 2 of 2 pages back upright, 0 wrong, 2 pages turned upright (p. 1-2). |
| autorotate | scanned/lincoln-ellsworth-letter-1861.pdf (turned 90) | PASS | 18.7 s | 36 of 36 pages back upright, 0 wrong, 36 pages turned upright (p. 1-36). |
| autorotate | derived/sub-ndl-konoye-p1.pdf (turned 90) | PASS | 4.0 s | no new version: Nothing to do: Every page was already upright. 1 page had too little text to tell and stayed as it was. |
| unlock | derived/owner-only-aws-invoice.pdf | FAIL | 0.9 s | run failed: Unlock failed: next.toLowerCase is not a function |
| unlock | derived/user-pw-TAMReview.pdf (with a plain PDF, Pages and Viewer opened first) | FAIL | 0.1 s | run failed: Unlock failed: next.toLowerCase is not a function |
| unlock | quirks/pdfjs-saslprep-r6.pdf | FAIL | 0.9 s | run failed: Unlock failed: next.toLowerCase is not a function |
