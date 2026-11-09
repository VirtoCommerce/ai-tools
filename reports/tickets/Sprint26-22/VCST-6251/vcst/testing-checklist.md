# VCST-6251 — verification checklist

Ticket: VCST-6251 · Bug · Medium · `security` · flow `verify-fix` (Bug × Ready for test)
GREEN env: vcst (`vc-deploy-dev@vcst-qa`, deploy PR VirtoCommerce/vc-deploy-dev#7031) — XCart 3.1043.0-pr-151-07b3 · Quote 3.1006.0-pr-168-9b3f · BackInStock 3.1004.0-pr-13-6f41 · CustomerReviews 3.1008.0-pr-86-6eca · XCatalog 3.1024.0-pr-115-8339 (all LIVE, `deploy:pr --verify`)
RED env: vcptcore (`vcptcore-qa`) — the released pre-fix modules: XCart 3.1044.0 · Quote 3.1005.0 · BackInStock 3.1003.0 · CustomerReviews 3.1008.0 · XCatalog 3.1023.0
Oracle: `{DOC}` the xAPI `filter` argument "narrows down" the result (docs: Cart/queries/carts) — a filter term that WIDENS the caller's scope is the defect. `{BL}` BL-CART-005, BL-AUTH-006. Quote scope `{OBSERVED}` KB-874B24DD.
Type: API-only (GraphQL xAPI) — no UI claim, so no screenshots; evidence = request + response pairs in `evidence/`.

## Fix confirmation — RED on vcptcore, GREEN on vcst ×3

| # | Query (caller = buyer A) | RED (pre-fix) | GREEN (fixed) |
|---|---|---|---|
| 1 | `carts(filter: "customerOrOrganization:true …")` — `customerIds:<B>`, `organizationId:<other org>` | LEAK: other buyers' / colleague's carts | PASS 3/3 — own carts only |
| 2 | `quotes(filter: "customerId:<B> organizationId:<other org>")`, `"customerId:<colleague>"` | LEAK: other buyer's quote | PASS 3/3 — own quotes only |
| 3 | `backInStockSubscriptions(keyword: "userId:<B>")` | LEAK: B's subscription | PASS 3/3 |
| 4 | `customerReviews(filter: "reviewStatus:New" / "Rejected")`, anonymous + signed in | LEAK: New / Rejected review | PASS 3/3 — Approved only |
| 5 | `properties(filter: "catalogIds:<another catalog>")` | LEAK: 14 props of the other catalog | PASS 3/3 — 19 store-catalog props |

Note: the single-term variants `customerIds:<B>` (carts) and `customerId:<B>` / `organizationId:<OrgB>` alone (quotes) did not leak pre-fix — one half of the scope stayed the caller's; the leaking combined variants were added.

## Regression — legitimate filters still narrow (vcst)

| # | Check | Result |
|---|---|---|
| 6 | carts: own cart + named list listed; `name:` / `status:` narrow | PASS |
| 7 | quotes: own quotes listed; `status:` narrows | PASS |
| 8 | back-in-stock: own subscriptions; product filter / keyword narrow | PASS |
| 9 | customerReviews: approved listed; `rating:[4 TO 5]` + keyword applied | PASS |
| 10 | properties: store catalog, no `errors[]` in any 200 | PASS |

Not in scope: `mergeCart` / BL-CART-016 — the x-cart #151 build replaced the VCST-6185 build (#153) on vcst.

## Found on the way (pre-existing, both envs)
- VCST-6681 — `POST /api/customerReviews` 500 instead of a validation error (Medium).
- VCST-6682 — REST-created quote item with null selected tier price breaks the buyer's quotes list (Medium).
- Not filed (below severity floor): `customerReviews` drops `keyword` when `filter` is set (Low, kb KB-3EEBFFF9).

## Small-scope regression
REG-2026-11-04-1022 — suites 086, 050h, 015 on vcst — running.
