# Regression Report — REG-2026-04-13-1133

## Executive Summary

**VERDICT: PASS** ✅ — VCST-4806 (product configuration section maxLength validation) verified end-to-end on QA.

| Metric | Value |
|---|---|
| Selection | `050b,072d` — targeted VCST-4806 cases (8 of 84 total) |
| Suites run | 2 / 2 (100%) |
| Cases executed | 8 / 8 (100%) — 2 GraphQL + 6 storefront |
| Assertions passed | 9 / 9 (100%) |
| Bugs found | **0** |
| Wall-clock duration | ~20 min (parallel: backend 8.5 min + frontend 19.6 min) |
| Order placed (E2E) | `CO260413-00001` (CFG-TEXT-006 checkout flow) |

## Environment

| | Value |
|---|---|
| QA front | https://vcst-qa-storefront.govirto.com |
| QA back | https://vcst-qa.govirto.com |
| Platform | 3.1017.0 |
| Theme | `vc-theme-b2b-vue-2.46.0-pr-2235-0b68-0b6869fe` (PR #2235 deployed, verified in storefront footer) |
| XCart | `3.1006.0-pr-107-daa4` (PR #107 deployed, verified via GraphQL introspection) |
| Cart | 3.1003.0 |
| Catalog | 3.1016.0 |

## Suite Results

### 050b — GraphQL xCart (qa-backend-expert / playwright-edge)

**Status:** PASS — 3/3 assertions, 0 bugs, 8.5 min

| Case | Assertion | Result | Evidence |
|---|---|---|---|
| GQL-099 | `ConfigurationSectionType` exposes `maxLength: Int` (introspection) | PASS | Schema field present; nullable Int scalar |
| GQL-099 | `productConfiguration` query returns `maxLength=30` for Engraving Text section | PASS | Matches admin-configured value |
| GQL-100 | `addItem` with 31-char `customText` → `validationErrors[]` contains `errorCode: CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` | PASS | Cart unchanged (0 items); error code matches PR #107 spec exactly |
| GQL-100 | `addItem` with 18-char valid text → `validationErrors[]` empty, item added | PASS | itemsCount=1 |

**Screenshots:** `gql-099-productConfiguration-maxLength.png`, `gql-100-over-limit-validation-error.png`, `gql-100-valid-text-success.png`
**Network log:** `050b-network-requests.txt`
**Result file:** `050b-results.json`

### 072d — Configurable Products Text Section (qa-frontend-expert / playwright-chrome)

**Status:** PASS — 6/6 cases, 0 bugs, 19.6 min

| Case | Scenario | Result |
|---|---|---|
| CFG-TEXT-001 | 30-char limit enforced on required Text section | PASS — 30 chars OK, 31st rejected, 1 char OK |
| CFG-TEXT-002 | Whitespace-only does not satisfy required validation | PASS — 5 spaces blocked with "Section is required"; meaningful text accepted |
| CFG-TEXT-003 | Optional Text section allows empty + non-empty | PASS — empty add-to-cart OK; "Congratulations on your new home!" preserved in cart |
| CFG-TEXT-004 | 100-char boundary preserved through cart | PASS — 100 chars accepted, 101st rejected, full text in cart |
| CFG-TEXT-006 | Text preserved through full checkout to order history | PASS — "With Love Always" present at cart → checkout → order CO260413-00001 → order history |
| CFG-TEXT-009 | Paste-bypass triggers `max_length_exceeded` i18n + backend rejection | PASS — programmatic 31-char value-set bypassed HTML maxlength; inline error "Text must not exceed 30 characters" rendered (i18n key + max param substitution confirmed); add-to-cart blocked client-side |

**Result file:** `072d-results.json`
**HAR:** `test-results/chrome/har/`

## Cross-Layer Verification

| Layer | What Was Verified | Where |
|---|---|---|
| GraphQL schema | `ConfigurationSectionType.maxLength: Int` exposed | GQL-099 introspection |
| GraphQL data | `productConfiguration` returns `maxLength` value matching admin config | GQL-099 query |
| Backend validation | `addItem` mutation rejects over-limit `customText` with exact error code from PR #107 | GQL-100 |
| Storefront input cap | HTML `maxlength` attr bound from `section.maxLength` (not hardcoded 255) | CFG-TEXT-001 (30 chars), -004 (100 chars) |
| Storefront paste-bypass | Programmatic value-set blocked by useConfigurableProduct.ts validator | CFG-TEXT-009 |
| i18n | `max_length_exceeded` translation rendered with `{max}` parameter substituted | CFG-TEXT-009 ("Text must not exceed 30 characters") |
| End-to-end persistence | Custom text survives cart → checkout → order → order history | CFG-TEXT-006 |

**Defense-in-depth note:** Backend rejection path (`CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED`) is exercised directly via GraphQL in GQL-100. In storefront flow CFG-TEXT-009, client validation blocks the `addItem` mutation before backend can reject — confirming layered enforcement (client first, server as defense). Both layers verified.

## Bugs Found

**None.**

## Test Data Issue (Resolved Mid-Run)

| Item | Detail |
|---|---|
| Stale product reference | Cases referenced `AGENT-TEST-Config-Engraved-Ring-20260324` (GUID `ebdc1c75-…`); product was re-seeded as `AGENT-TEST-RING-TXT-CFG-20260327` (GUID `e5ae288e-369e-423d-9647-3548797a398a`) on QA |
| How discovered | qa-backend-expert agent fell back to live catalog search |
| Resolution | Updated 3 files mid-run: `test-data/products/configurable-products.csv` (CFG-017), `regression/suites/Backend/graphql/050b-graphql-xcart.csv` (4 occurrences), `regression/suites/Frontend/configurable-products/072b-file-text-section-cases.csv` (6 occurrences). Test-data note also corrected: HTML maxLength was 255 pre-PR; now 30 (admin section value, post-PR #2235). |
| Impact on this run | None — both agents adapted via fallback. Future runs will use correct ID directly. |

## Retry Log

None — both suites passed first attempt.

## Files

- `reports/regression/REG-2026-04-13-1133/regression-report.md` (this file)
- `reports/regression/REG-2026-04-13-1133/050b-results.json`
- `reports/regression/REG-2026-04-13-1133/072d-results.json`
- `reports/regression/REG-2026-04-13-1133/050b-network-requests.txt`
- `reports/regression/REG-2026-04-13-1133/gql-099-*.png`, `gql-100-*.png` (3 screenshots)
- Frontend HAR: `test-results/chrome/har/`
- Status tracker: `reports/regression/test-run-status.json`

## Quality Gate

| Check | Status |
|---|---|
| All targeted cases executed | PASS — 8/8 |
| All assertions passed | PASS — 9/9 |
| No bugs filed | PASS |
| Theme + module versions verified | PASS |
| End-to-end persistence verified | PASS — order CO260413-00001 |
| Both code paths exercised (client + server) | PASS — GQL-100 hits backend; CFG-TEXT-009 hits client |
| i18n verified | PASS — en locale "Text must not exceed 30 characters" with `{max}` substituted |
| No stale references remain in CSVs | PASS — product code updated mid-run |

## Recommendation

✅ **VCST-4806 ready to mark verified / move to Done.**

Both PR #107 (vc-module-x-cart) and PR #2235 (vc-frontend) are working correctly on QA across all tested scenarios. No bugs, no follow-up tickets needed.

### Suggested next actions
- Move VCST-4806 to "Verified" / "Ready for Release" in JIRA
- Optional: extend CFG-TEXT-009 i18n assertion to non-English locales (fr, de, ja) — defer to next sprint
- Commit pending CSV updates (`git add -A regression/ test-data/ config/test-suites.json reports/`) — bundle `/qa-sync-tests` (SYNC-2026-04-13-1122 + SYNC-2026-04-13-1127) + this regression run as a single commit "VCST-4806: sync test cases + regression verification"
