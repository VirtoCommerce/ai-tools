# Sprint 26-22 · W4 Catalog, search, compare & analytics — report

**Owner:** Elena Kutasina · **Sub-task:** VCST-6800 · **Run:** REG-2026-11-11-1939-W4 · **Env:** vcst · Platform 3.1097.0 · Xapi 3.1031.0-pr-70-108f
**Theme changed during the wave:** 098 ran on 2.62.0-alpha.2642; 004, 043, 005, 002, 001 on 2.62.0-alpha.2647 (vc-deploy-dev#7097). Reason: the SalesRep 3.1023.0 plugin imports dashboard exports that vc-frontend#2552 added to `core-api` without bumping its 0.2.11 version, so on alpha.2642 the plugin never initialised and every page showed "Part of the site could not be loaded" (KB-D09A7347).

## Verdict

293 cases: 186 PASS · 13 FAIL · 47 BLOCKED · 47 SKIPPED. **Nothing new in this sprint**: every FAIL is a pre-existing defect or a stale expectation.

| Suite | Cases | Pass | Fail | Blocked | Skipped |
|-------|-------|------|------|---------|---------|
| 098 Product Compare v2 | 53 | 29 | 5 | 18 | 1 |
| 004 Search Core | 64 | 40 | 3 | 15 | 6 |
| 043 Google Analytics | 67 | 58 | 3 | 3 | 3 |
| 005 Search Filters & Advanced | 48 | 12 | 1 | 7 | 28 |
| 002 Product Detail | 32 | 28 | 1 | 2 | 1 |
| 001 Catalog Navigation | 29 | 19 | 0 | 2 | 8 |

## Real bugs (pre-existing, not filed yet)

| Ledger row | Defect | Since |
|------------|--------|-------|
| CMP-006 (+ CMP-032) | Compare: All/Differences switch only visually disabled on a one-product tab (keyboard-operable) | 2026-10-12 |
| CMP-017 | Compare: two configuration sections with the same label collapse into one row — a selected option disappears | 2026-10-14 |

| GA-027 | GA4: re-paying an unpaid order from the order page sends `purchase` again | 2026-10-29 |

Already filed and still present: VCST-5878 (compare table body not keyboard-scrollable, CMP-047), VCST-6613 (search Clear closes dropdown), VCST-5198 (Skyflow add_payment_info stale), VCST-6605 (USD-only product in EUR shows 0.00), VCST-6607 (Reset search keeps the facet).
**Pending decision:** CMP-031 — Pin and tooltip controls hidden below md / at 200–400% zoom; product/design to say whether intended.

## BLOCKED — causes and fixes

| Cause | Cases | Fix |
|-------|-------|-----|
| Technique the agent lanes cannot perform (CDP a11y tree, localStorage write, network interception, mouse wheel, browser Forward) | 22 (098 ×17, 004 ×5) | Move those assertions to Playwright `.spec` files |
| Env-wide store setting (barcode search, facet sorting, store asset URL) | 15 (004 ×9, 005 ×5, 002 ×1) | Run in the **WX** window — add them to WX with `/qa-test-plan 26-22 --update` |
| Fixture | 9 | MOQ stock, short-name category pair, duplicate "default" cart on USER_EMAIL, 11-org persona, 3 same-category products, two-store wishlist account (password drift) + seed |
| Stale case | 1 (CAT-045) | Variation picker was never built — retire or rewrite |

**Test defects to confirm with the AC:** SRCH-008 (clear-history control), SRCH-024 (measure painted frames), GA-006 (view_cart value = Total).

## Run notes

- USER_DEFAULT (qa-user-01) password on vcst had drifted from `TEST_USER_PASSWORD`; reset by admin API mid-run. `agent-test-wish-twostore` has the same drift (CAT-079).
- 043: 23 cases first stopped on a session budget, re-run on the same run id.
- SKIPPED: 44 manual-only, 3 deprecated.
