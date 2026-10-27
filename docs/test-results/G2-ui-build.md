# G2-ui-build: G2 tools in the shell UI

Run-to-result = click on Run until the result screen shows. Base http://localhost:4191/SwissPDF. 2026-10-26T23:58:02.096Z

| Tool | Pass | Median Run-to-result |
|---|---|---|
| repair | 5/5 | 0.9 s |
| protect | 3/3 | 0.9 s |
| unlock | 3/3 | 1.4 s |
| compare | 3/3 | 2.1 s |

| Tool | File | Result | Time | Detail |
|---|---|---|---|---|
| repair | quirks/pdfjs-xref_command_missing.pdf | PASS | 2.0 s | 1 pages, Rebuilt the file structure. All 1 page kept as they were, with any bookmarks, links and form fields. |
| repair | quirks/pdfjs-poppler-395-0-fuzzed.pdf | PASS | - | rejected on add: Not a valid PDF pdf-lib: Expected instance of t, but got instance of undefined; MuPDF rewrite: No readable pages; MuPDF repair: Unrecoverable: the file contains |
| repair | quirks/pdfjs-poppler-742-0-fuzzed.pdf | PASS | - | rejected on add: Not a valid PDF pdf-lib: i.catalog.Pages is not a function; MuPDF: cannot open the file; MuPDF rewrite: invalid key in dict; MuPDF repair: Unrecoverable: the fi |
| repair | quirks/pdfjs-Pages-tree-refs.pdf (extra, for timing) | PASS | 0.9 s | 1 pages, Rebuilt the file structure. All 1 page kept as they were, with any bookmarks, links and form fields. Damage was also found and fixed when the file was added. |
| repair | quirks/pdf20-offset-start.pdf (extra, for timing) | PASS | 0.9 s | 1 pages, Rebuilt the file structure. All 1 page kept as they were, with any bookmarks, links and form fields. |
| protect | reports/pdfjs-tracemonkey.pdf | PASS | 0.9 s | Standard V5 R6 256-bit AES, opens with the password |
| protect | invoices/aws-invoice.pdf | PASS | 0.9 s | Standard V4 R4 128-bit AES, opens freely |
| protect | forms/irs-fw9.pdf | PASS | 1.0 s | Standard V1 R2 40-bit RC4, opens with the password |
| unlock | derived/owner-only-aws-invoice.pdf | PASS | 0.9 s | None, 1 pages, 1921 chars, Its protection was already removed when it was added. |
| unlock | derived/user-pw-TAMReview.pdf | PASS | 3.4 s | None, 23 pages, 65271 chars, Password removed. |
| unlock | quirks/pdfjs-saslprep-r6.pdf | PASS | 1.4 s | None, 1 pages, 18 chars, Password removed. |
| compare | derived/compare-tracemonkey-base.pdf vs derived/compare-tracemonkey-inserted.pdf | PASS | 2.1 s | 1213 words added, 0 removed, on 1 of 6 page pairs. / Not in the original, changed p. 3 (1 of 1, new page) |
| compare | reports/pdfjs-TAMReview.pdf vs reports/pdfjs-TAMReview.pdf | PASS | 3.5 s | The text of both documents is the same. /  |
| compare | invoices/aws-invoice.pdf vs derived/origin-shift-aws-invoice.pdf | PASS | 1.6 s | The text of both documents is the same. /  |
