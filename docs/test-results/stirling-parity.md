# Stirling parity: S5 test pass (2026-10-27)

Plan: `docs/plans/2026-10-26-stirling-parity.md`. Each tool runs on its 3 real files (case table in the plan). Full corpus run: `2026-10-27-s5-full.md` (filled in below when done).

## Full corpus run
`CORPUS_OUT=s5 npm run test:corpus -- --shards 4 --name 2026-10-27-s5-full`: **828 pass, 1 fail, 0 skip** of 829 rows, 17 min (`2026-10-27-s5-full.md`). Run before the S2 fix batch landed.
The 1 fail (`forms-fill-xfa-imm1344e`) was a wrong test expectation: the file is a dynamic XFA form, the Forms tool correctly says its fields cannot be filled here. Row now expects no fillable fields: pass (`2026-10-27-xfa-row.md`). Net: 829/829.

## Final gate before deploy (2026-10-27, clean machine, after all review fixes)
| Check | Result |
|---|---|
| `npm run build` | pass |
| `npm run test:full` (829 rows, real files) | 829 pass, 0 fail (`2026-10-27-final-full.md`, 39.7 min) |
| s2-ui (dev) | 90/90 |
| automate-ui (dev) | 46/46 (one test expectation updated: nothing is selected after a reload) |
| Health on the built app | 49/49 |
| chain on the built app | all passed |
| Blind no-context review | all 55 tools worked; re-check: no P0, only P1 left is "edit existing text" (parked) |

## Run-to-result latency (click Run to result screen, real shell, median of 3 real files)
Built app unless marked dev. Cold = fresh browser context (worker + engine load included).

| Tool | Median | Files | Source |
|---|---|---|---|
| N-up | 0.94 s | tracemonkey, aws, attention | u5a-final |
| Booklet | 0.92 s | same | u5a-final |
| Page size / scale | 0.94 s | rot90-cropbox-bert, c-rot270, origin-shift | u5a-final |
| Single large page | 1.47 s | tracemonkey, aws, attention | u5a-final |
| Stamp | 0.96 s | rot90-cropbox-bert, c-rot270, origin-shift | u5a-final |
| Overlay | 1.03 s | tracemonkey, aws, attention | u5a-final |
| Remove blank | 1.43 s (Lincoln 36 pp: 12.3 s) | fax, Lincoln, c-mixed | u5a-final |
| Adjust colours | 0.96 s | fax, Lincoln, c-mixed | u5a-final |
| Replace colours | 0.91 s | same | u5a-final |
| Fast web view | 0.93 s | tracemonkey, aws, attention | u5a-final |
| Bookmarks | 0.97 s | structure files | u5b-final (cold) |
| Metadata | 1.48 s | tracemonkey, aws, attention | u5b-final (cold) |
| Attachments | 1.09 s | fileattachment, aws, tracemonkey | u5b-final (cold) |
| Remove annotations | 1.21 s | tracemonkey_with_annotations, fw9, fileattachment | u5b-final (cold) |
| Remove images | 1.57 s | tracemonkey, aws, attention | u5b-final (cold) |
| Extract images | 1.13 s | same + cmykjpeg | u5b-final (cold) |
| Flatten | 1.68 s | fw9, i-9, fw4 | u5b-final (cold) |
| Unlock forms | 1.61 s | fw9, i-9, imm1344e | u5b-final (cold) |
| Sanitize | 2.16 s | tracemonkey, aws, attention | u5b-final (cold) |
| Change permissions | 2.10 s | owner-only aws, tracemonkey, fw9 | u5b-final (cold) |
| Show JavaScript | 1.48 s | structure files | u5b-final (cold) |
| PDF info | 1.51 s | tracemonkey, aws, attention | u5b-final (cold) |
| Auto rename | 2.34 s | same | u5b-final (cold) |
| Repair | 1.4 s | xref_command_missing + 2 stand-ins | G2-ui (cold) |
| OCR | 28.8 s | fax 16 s, Konoye 29 s, Lincoln 36 pp 67 s | G2-ui (cold) |
| Auto rotate | 12.3 s (ops 1 to 3 s) | fax, Lincoln, Konoye turned 90 | G2-ui (cold) |
| Protect | 2.0 s | tracemonkey, aws, fw9 | G2-ui (cold) |
| Unlock | 2.2 s | owner-only aws, user-pw TAMReview, saslprep-r6 | G2-ui (cold) |
| Compare | 2.5 s | inserted page, TAMReview x2, aws vs shifted | G2-ui (cold) |
| Automate: clean copy | 2.2 s | tracemonkey, aws, fw9 | s3-automate |
| Automate: small and locked | 2.6 s | same | s3-automate |
| Automate: scan to searchable | 16.0 s (Lincoln 66 s) | fax, Konoye, Lincoln | s3-automate |
| Automate: numbered draft | 2.1 s | tracemonkey, aws, fw9 | s3-automate |
| Automate: long-term copy | 2.1 s | same | s3-automate |
| Compress (flow, 184 pp us-budget) | ready 3.5 s | us-budget | resume-check |
| Merge (flow) | ready 1.0 s | 2 reports | resume-check |
| Split (flow) | ready 1.4 s | tracemonkey | resume-check |

Stirling's web app for comparison (live, 2026-10-26): Compress level 5 on a 1-page invoice took about 1.9 s Run-to-result, with the file uploaded to their server. SwissPDF keeps the file on the device.

Gaps in this table: convert tools (Word/Excel/PPT to PDF, PDF to Office, images) were timed in U4/G4 runs (`docs/test-results/fixB-convert.md`); the blind review (S6) re-times the main flows from a cold start.
