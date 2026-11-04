# VCST-6251 — verification checklist

Ticket: VCST-6251 · Bug · Medium · `security` · flow `verify-fix` (Bug × Ready for test)
GREEN env: vcst (`vc-deploy-dev@vcst-qa`, deploy PR VirtoCommerce/vc-deploy-dev#7031) — XCart 3.1043.0-pr-151-07b3 · Quote 3.1006.0-pr-168-9b3f · BackInStock 3.1004.0-pr-13-6f41 · CustomerReviews 3.1008.0-pr-86-6eca · XCatalog 3.1024.0-pr-115-8339 (all LIVE, `deploy:pr --verify`)
RED env: vcptcore (`vcptcore-qa`) — the released pre-fix modules: XCart 3.1044.0 · Quote 3.1005.0 · BackInStock 3.1003.0 · CustomerReviews 3.1008.0 · XCatalog 3.1023.0
Oracle: `{DOC}` the xAPI `filter` argument "narrows down" the result (docs: Cart/queries/carts) — a filter term that WIDENS the caller's scope is the defect. `{BL}` BL-CART-005 (cart isolation per organization), BL-AUTH-006 (customers access only their own data). Quote scope `{OBSERVED}` KB-874B24DD.
Type: API-only (GraphQL xAPI) — no UI claim, so no screenshots; evidence = request + response pairs.

## Fix confirmation — RED on vcptcore, GREEN on vcst ×3

| # | Query (caller = buyer A) | Expected after fix | Result |
|---|---|---|---|
| 1 | `carts(filter: "customerOrOrganization:true customerIds:<B id>")`; and, as a buyer with no current org, `"customerOrOrganization:true organizationId:<other org>"` | only A's own carts; none of B's / the other org's | |
| 2 | `quotes(filter: "customerId:<B id>")` and `"organizationId:<other org>"` | only A's own quotes | |
| 3 | `backInStockSubscriptions(keyword: "userId:<B id>")` | only A's own subscriptions | |
| 4 | `customerReviews(filter: "reviewStatus:New")` / `"reviewStatus:Rejected"`, anonymous and signed in | Approved reviews only | |
| 5 | `properties(filter: "catalogIds:<another catalog id>")` | the store catalog's properties only | |

## Regression — legitimate filters still narrow

| # | Check | Result |
|---|---|---|
| 6 | carts: own cart + named lists listed with no filter; a legit term (`name:` / `status:`) narrows | |
| 7 | quotes: own quotes listed; a `status:` term narrows | |
| 8 | back-in-stock: own subscriptions listed; a product keyword narrows | |
| 9 | customerReviews: approved reviews listed; `rating:[4 TO 5]` range and keyword still applied (the PR moved this code) | |
| 10 | properties: no filter → store catalog properties; no errors[] in any 200 | |

Not in scope: `mergeCart` / BL-CART-016. The x-cart #151 build replaced the VCST-6185 build (#153) on vcst, so the mergeCart fix is not deployed on this stand right now.

## Results
