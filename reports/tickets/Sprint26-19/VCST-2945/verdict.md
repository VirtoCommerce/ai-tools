# VCST-2945 — PASS WITH NOTES (2026-09-30 delta re-test)
The only change since the 2026-09-28 runs is the storefront: theme `2.59.0-pr-2501-7e0c` → `2.59.0-pr-2501-3a82` (fix for VCST-6098 + a `dev` merge). The backend PR builds are the same ones tested on 09-28 (Catalog 3.1046.0-pr-909-2839, XCatalog 3.1022.0-pr-113-f4a8), so their evidence carries forward. VCST-6098 is fixed, the barcode storefront cases pass on the new build, and VCST-6094 is now treated as pre-existing platform behaviour.

| AC / item | Result | Evidence |
|---|---|---|
| T1–T3.5, AC-4 (admin blade, REST, xAPI) | PASS — carried from 2026-09-28, backend unchanged | testing-checklist.md rows A*/B* |
| VCST-6098: header box with `?barcode&q` | **FIXED** — box empty, scan button visible, desktop + 390 px | screenshots/d-D1-*.png · d-D2-*.png |
| Box follows the page's lookup-vs-keyword decision (empty / whitespace / repeated `barcode`) | PASS — parity on all 3 shapes | d-D5a/b/c-*.png |
| Plain keyword search, scanner OFF, single-hit PDP | PASS | d-D4 · d-D6 · d-D7 |
| Console / GraphQL / network (122 GraphQL calls) | PASS — no `errors[]`, no 4xx/5xx | d-lane-storefront-2026-09-30.har.gz |
| Storefront barcode cases SRCH-014..023 on the new theme | 10/10 PASS | REG-2026-09-30-1536 |
| VCST-6094 "exact match treats `*`/`?` as wildcards" | PRE-EXISTING / by design — operator decision | `code:"*"` also returns 4566 on B2B-store |

## Bugs
- Filed this run: none.
- Verified fixed: VCST-6098.
- Reclassified: VCST-6094 → pre-existing. Elasticsearch expands wildcards in every term filter on the platform, and the PR descriptions no longer promise literal matching. This still conflicts with BL-SRCH-005, platform-wide.
- Still open, not re-run: VCST-6095/6096/6097 (a11y, no fix in `3a82025`), VCST-6099/6100 (analytics, pre-existing).
- Not filed (below severity floor): blade shows scanner OFF when `/fields` fails; whitespace-only `?barcode=` not trimmed.

## Notes
- The frontend PR #2501 `auto-tests` CI is red on all 6 matrix jobs. This is outside this run, but it blocks merge.
- Not re-run, by operator choice (backend unchanged): reachability pass, Test Model, exploratory session, case authoring, design/a11y lane. No new regression cases.
- App Insights correlation skipped: Azure credentials expired.
- Test-case quality, to route to `/qa-review-tests`:
  - SRCH-018 hardcodes a `/product/<id>` URL.
  - SRCH-020 has no `code=` value.
  - SRCH-022's history check is weak.
  - SRCH-021: the `ORG_USER_PASSWORD` secret fails for its account.
- Still not tested: C17 paging (fixture gap), a real camera scan, older backend, Lucene.

## Data
No entities were created. The B2B-store barcode settings were written and restored twice, GET-confirmed at 15:33:05Z and 15:50:14Z: `{"scannerEnabled":true,"fields":[]}`.

## Context
- Checklist: testing-checklist.md §Round 2026-09-30
- Summary: summary.json
- Model: reports/ba/test-models/VCST-2945-2026-09-28.md
- PRs: vc-module-catalog#909, vc-module-x-catalog#113, vc-frontend#2501
