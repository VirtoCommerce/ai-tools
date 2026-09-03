# salesRepCustomerOrders: an unrecognized filter FIELD silently returns 0 orders with no error — P3

**Severity:** P3 · **Type:** API contract / error handling (GraphQL xAPI, scoped `sales-rep` schema)
**Provenance:** PRE-EXISTING (shared X-Order phrase-parser / index behaviour, not introduced by VCST-5733)

**Env:** vcst-qa @ Platform 3.1063.0, SalesRep 3.1007.0-pr-14-5569, XOrder 3.1010.0, Xapi 3.1021.0-pr-84-0180

## Summary
`salesRepCustomerOrders(filter: …)` takes an X-Order search-phrase DSL string. A phrase naming a field
that does not exist returns **HTTP 200, `totalCount: 0`, empty `items[]`, and an empty `errors[]`** —
indistinguishable from "this customer genuinely has no matching orders". The asymmetry with the sibling
arguments is the point: an unrecognized **facet** name is *dropped* leaving the result set intact, and an
unrecognized **sort** field is *ignored* falling back to default order, but an unrecognized **filter**
field fails closed to zero rows without saying so.

This matters more on this surface than it would elsewhere, because the new query ships **no discovery
companion**. `salesRepOrders` has `salesRepOrderFilterRules` / `salesRepOrderSortRules`; the phrase-DSL
surface has neither, so the storefront must hardcode the grammar. A field rename upstream therefore
renders as *"this customer has no orders"* rather than as a failure, on a page whose entire purpose is
showing a customer's order history.

## Steps to Reproduce
1. Obtain a sales-rep token: `POST /connect/token`, `grant_type=password`, `username=@td(SR_REP_PRIMARY.email)`, `storeId={{STORE_ID}}`.
2. Baseline: `POST /graphql/sales-rep` with `{ salesRepCustomerOrders(storeId:"{{STORE_ID}}", cultureName:"{{CULTURE_NAME}}", first:1) { totalCount } }`.
3. Repeat with `filter: "notafield:\"zzz\""`.
4. For the contrast, repeat with `facet: "nosuchfield"` and then with `sort: "nosuchfield:desc"`.

## Expected vs Actual
- **Expected:** either an error identifying the unknown field, or the documented drop-and-continue behaviour the `facet` argument already implements. The caller must be able to tell "no data" from "your query was wrong".
- **Actual:** `filter` → `totalCount: 0`, `items: []`, `errors: []` (a silent empty result).
- **Contrast, same session:** `facet` → unknown name dropped, `totalCount` unchanged; `sort` → unknown field ignored, default ordering retained.

## Triangulation — why this is PRE-EXISTING
The identical probe against the standard xAPI `orders` query reproduces the same behaviour, so the root
cause is the shared phrase parser / index layer rather than `vc-module-sales-rep` PR #14. Recorded here
because the **consequence** is new: this is the first surface where the grammar is caller-composed with
no discovery query to validate it against.

## Notes
Below the `/qa-test` 5d severity floor (`Critical`/`High`/`Medium`), so **not filed to the tracker** — it
is recorded in `reports/tickets/Sprint26-17/VCST-5733/summary.json` `bugs_not_filed[]` instead. The
storefront-side consequence is covered by case `SR-CO-025`, which asserts that a no-match search renders
the filter-aware "nothing matched" state and never silently falls back to the unfiltered list.
