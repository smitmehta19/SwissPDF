# polishB2-g2-ui: G2 tools in the shell UI

Run-to-result = click on Run until the result screen shows. Base http://127.0.0.1:53802. 2026-10-27T20:18:04.566Z

| Tool | Pass | Median Run-to-result |
|---|---|---|
| repair | 5/5 | 0.4 s |
| unlock | 3/3 | 0.9 s |

| Tool | File | Result | Time | Detail |
|---|---|---|---|---|
| repair | quirks/pdfjs-xref_command_missing.pdf | PASS | 0.4 s | 1 pages, Rebuilt the file structure. All 1 page kept as they were, with any bookmarks, links and form fields. |
| repair | quirks/pdfjs-poppler-395-0-fuzzed.pdf | PASS | - | rejected on add: PDFpdfjs-poppler-395-0-fuzzed.pdfCan't open this PDF. The file looks damaged or incomplete.DetailsNot a valid PDF. pdf-lib: Expected instance of PDFDict2, but g |
| repair | quirks/pdfjs-poppler-742-0-fuzzed.pdf | PASS | - | rejected on add: PDFpdfjs-poppler-742-0-fuzzed.pdfCan't open this PDF. The file looks damaged or incomplete.DetailsNot a valid PDF. pdf-lib: _this.catalog.Pages is not a functio |
| repair | quirks/pdfjs-Pages-tree-refs.pdf (extra, for timing) | PASS | 0.1 s | no new version: Nothing to do: It was already repaired when it was added, nothing more to fix. |
| repair | quirks/pdf20-offset-start.pdf (extra, for timing) | PASS | 0.9 s | 1 pages, Rebuilt the file structure. All 1 page kept as they were, with any bookmarks, links and form fields. |
| unlock | derived/owner-only-aws-invoice.pdf | PASS | 0.9 s | None, 1 pages, 1921 chars, Its protection was already removed when it was added. |
| unlock | derived/user-pw-TAMReview.pdf (with a plain PDF, Pages and Viewer opened first) | PASS | 0.2 s | None, 23 pages, 65271 chars, Password removed. Not protected, left out: pdfjs-tracemonkey.pdf. |
| unlock | quirks/pdfjs-saslprep-r6.pdf | PASS | 0.9 s | None, 1 pages, 18 chars, Password removed. |
