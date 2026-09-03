# salesRepCustomerOrders: `after` past the ES result window returns `data: null` + `errors[SEARCH]` — P3

**Severity:** P3 · **Type:** API contract / pagination boundary (GraphQL xAPI, scoped `sales-rep` schema)
**Provenance:** PRE-EXISTING (Elasticsearch `index.max_result_window`, shared with the standard xAPI)

**Env:** vcst-qa @ Platform 3.1063.0, SalesRep 3.1007.0-pr-14-5569, XOrder 3.1010.0

## Summary
`after` is parsed as an **offset**. Once `from + size` exceeds the Elasticsearch result window (10 000),
the query returns **HTTP 200 with `data.salesRepCustomerOrders: null`** and
`errors: [{ code: "SEARCH", codes: ["SEARCH","TRANSPORT"] }]` rather than an empty page. A **negative**
`after` fails the same way.

The boundary is exact and reproducible:

| `after` / `first` | `from + size` | Result |
|---|---|---|
| `9998` / `2` | 10 000 | clean, empty page |
| `9999` / `2` | 10 001 | `data: null` + `errors[SEARCH]` |
| `-5` / any | — | `data: null` + `errors[SEARCH]` |

The asymmetry worth knowing: the module's **non-index** siblings degrade gracefully at the same input —
`salesRepOrders` and `salesRepCustomers` with `after: "99999"` return `totalCount` intact, zero items and
an empty `errors[]`. So the new index-backed surface inherits a harsher failure mode than its neighbours.

## Steps to Reproduce
1. Obtain a sales-rep token (`storeId={{STORE_ID}}`).
2. `POST /graphql/sales-rep` → `{ salesRepCustomerOrders(storeId:"{{STORE_ID}}", cultureName:"{{CULTURE_NAME}}", after:"9998", first:2) { totalCount items { number } } }` → clean empty page.
3. Repeat with `after:"9999"` → `data: null` + `errors[SEARCH]`.
4. Repeat with `after:"-5"` → same error shape.
5. For the contrast, repeat step 3's input against `salesRepOrders` → graceful empty result.

## Expected vs Actual
- **Expected:** an out-of-range offset yields an empty page (as it does at exactly 10 000, and as the non-index siblings do at any offset), or an error that names the limit.
- **Actual:** `data: null` with a generic `SEARCH` / `TRANSPORT` error code that does not indicate a paging-range problem.

## Triangulation — why this is PRE-EXISTING
The standard `orders(after:"99999")` and `orders(after:"-5")` produce the **byte-identical** error, so the
cause is the shared search layer and the ES `index.max_result_window` default, not `vc-module-sales-rep`
PR #14.

## Practical reach
Low today: the largest rep scope observed on this environment is ~95 orders, so a real rep cannot page
into the window by hand. It becomes reachable on a large deployment, or immediately via a crafted or
corrupted `after` in a deep link — which is why it is recorded rather than dismissed. Note the related,
separately-documented behaviour that a **non-numeric** `after` silently restarts at offset 0.

## Notes
Below the `/qa-test` 5d severity floor, so **not filed to the tracker** — recorded in
`reports/tickets/Sprint26-17/VCST-5733/summary.json` `bugs_not_filed[]`.
