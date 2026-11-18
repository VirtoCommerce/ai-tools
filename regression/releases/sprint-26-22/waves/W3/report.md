# Sprint 26-22 · W3 Cart, checkout & addresses — report

**Owner:** Elena Kutasina · **Sub-task:** VCST-6799 · **Run:** REG-2026-11-12-0714-W3 · **Env:** vcst
**Build:** Platform 3.1097.0 · theme 2.62.0-alpha.2647 · XCart 3.1046.0 · Xapi 3.1031.0-pr-70-108f during the run, release 3.1031.0 since vc-deploy-dev#7098 (BackgroundJobs 3.1055.0)

## Verdict

304 cases, 174 automated: 110 PASS · 28 FAIL · 29 BLOCKED · 108 SKIPPED (manual / deprecated). Suite 081 is all manual.
**One new Critical security regression: [VCST-6818](https://virtocommerce.atlassian.net/browse/VCST-6818)** (CART-124 — anonymous `mergeCart` takes and deletes another customer's cart; the VCST-6185 guard no longer holds; re-checked on release Xapi 3.1031.0).
Sprint changes verified: address add / edit / select after vc-frontend#2424 (cart, account, company, B2B checkout, quotes), VCST-6698 long address lines, VCST-6564 Google Maps, VCST-6477 pickup keywords, VCST-6374 / 6375 / 5711 cart.

| Suite | Cases | Pass | Fail | Blocked | Skipped |
|-------|-------|------|------|---------|---------|
| 011 Checkout Flow | 71 | 26 | 7 | 8 | 30 |
| 036 BOPIS Store Selector | 53 | 24 | 9 | 11 | 9 |
| 028 Cart Core | 57 | 34 | 1 | 5 | 17 |
| 015 Quotes | 32 | 11 | 10 | 4 | 7 |
| 029 Cart Validation & Persistence | 34 | 11 | 0 | 1 | 22 |
| 030 Cart Merge | 21 | 3 | 1 | 0 | 17 |
| 013 Checkout B2B | 7 | 1 | 0 | 0 | 6 |
| 081 Select Shipping Address Popup | 29 | 0 | 0 | 0 | 29 |

## Real bugs

| Ledger row | Defect | New |
|------------|--------|-----|
| CART-124 | Anonymous `mergeCart` takes and deletes another customer's cart — **VCST-6818** (Highest) | yes |
| BOPIS-096 (+ BOPIS-100) | After Load more the pickup map keeps only page-1 markers | unknown |
| QUOTE-026 | Approving a quote with an out-of-stock line places the order, stock goes negative | no |
| CHK-089 | Address popup: clearing the search text leaves the list filtered | unknown |
| CHK-096 | No-match address search says "You do not have any addresses yet" (VCST-4723 area) | unknown |

**Pending decision (product):** quote expiry not shown / not enforced (QUOTE-011, 022, 023); ZIP format validation (CHK-004, 027); delivery method dropped on cart currency switch (CART-051); duplicate-address check (CHK-106, OQ-8); map zoom buttons (BOPIS-011); quote date filter never built vs removed (QUOTE-031, 032).

## BLOCKED — causes and fixes

| Cause | Cases | Fix |
|-------|-------|-----|
| Fixtures: US-only addresses, no zero-address account, 151 pickup locations, quote with PO | 9 | Multi-country / zero-address personas; dedicated store for pickup sizing |
| Env-wide / shared writes: deactivating pickup locations, $0 shared price | 5 | **WX** with restore in Cleanup |
| vc-frontend-next PR #19 cases (CART-119…123) | 5 | Not testable on vcst |
| Stale cases: absent quote negotiation / substitution / history, absent pickup filters, map / wheel tool limits | 10 | Deprecate or move to `.spec` |

## Run notes

- 015 quote fixtures were re-seeded mid-run (`npm run seed:quotes -- --slot 1`), rewriting quote ids in `test-data/aliases.vcst.json`.
- Stand data left: orders CO261112-00002…00011, quotes RFQ261112-00001/00002, list AGENT-TEST-QUOTE-015-list, AGENT-TEST anonymous carts. CO261112-00003 sits in Payment required after a "successfully submitted" checkout (unconfirmed).

## Closed (2026-11-12)

W3 set to **DONE**. Every real bug is filed after a live re-check: **VCST-6818** (Highest, new — anonymous `mergeCart`), VCST-6819 (pickup map, Low), VCST-6820 and VCST-6821 (address popup search, Low), VCST-6822 (quote approve with out-of-stock line, Low — re-verified on a disposable AGENT-TEST organization while W5 ran, all fixtures deleted).
Still pending a **product decision** (rows stay `PENDING_DECISION`): quote expiry (QUOTE-011/022/023), ZIP format (CHK-004/027), delivery method on currency switch (CART-051), duplicate-address check (CHK-106), map zoom (BOPIS-011), quote date filter (QUOTE-031/032).
Everything else open is marked `DEFERRED` in `ledger.csv` (fixtures, stale cases, manual cases, WX cases).
