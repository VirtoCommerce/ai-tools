# BUG: One order in a deleted currency stops order change indexing indefinitely `[Medium]`

## Status: CONFIRMED — filed as VCST-6927
**Found by:** human

**Env:** vcst-qa @ Platform 3.1099.0 · Orders 3.1021.0 · Search (vc-module-search @ eec68f7) · BackgroundJobs 3.1055.0 (RabbitMQ engine) · ElasticSearch8

## Summary
The scheduled index-changes job (`IndexChangesJob`) fails for **CustomerOrder** on every run with
`System.InvalidOperationException: Sequence contains no matching element` while one changed order in its window has a
currency the platform no longer configures. The job only saves a type's `IndexationDate` after that type succeeds, so the
window never moves and the same order fails every run: order changes stop reaching the search index, with no visible
signal except one error line per run.

## Steps to reproduce
1. Admin token. `POST /api/currencies` with a test currency, e.g. `XTS`.
2. Create an order in `XTS` (`POST /api/order/customerOrders`).
3. `DELETE /api/currencies?codes=XTS` — the order stays, now in an unconfigured currency.
4. Keep `VirtoCommerce.Search.IndexingJobs.Enable = true` and wait for the next `IndexChangesJob` run.
5. Read `GET /api/platform/settings/VirtoCommerce.Search.IndexingJobs.IndexationDate.CustomerOrder` after each run.

## Expected
- The run indexes every order it can and reports the one it cannot (logged with the order id), without blocking the rest.
- `IndexationDate.CustomerOrder` advances like every other document type.

## Actual
- Every run logs one `Sequence contains no matching element` (source `IndexProgressHandler`), message only, no order id.
- `IndexationDate.CustomerOrder` stayed at **2026-11-16 12:59:02Z** for two days; Product, Category, Member, ContentFile,
  PickupLocation and Pages advanced to 2026-11-18 14:00Z.
- 9,029 orders changed since then; exactly one, `AGENT-TEST-BD-UNCFG-X1` (currency `XTS`, modified 2026-11-16 13:06Z), has a
  currency not in `GET /api/currencies`.
- **Proof (2026-11-18):** `XTS` re-added at 14:55:01Z → the 15:00 run succeeded, `IndexationDate.CustomerOrder` moved to
  15:00:01Z, no error; `XTS` deleted again at 15:00:05Z.
- Non-visual defect (background job + settings): no screenshot exists to show.

## Root cause
`CustomerOrderDocumentBuilder` loads the changed orders with `GetNoCloneAsync(documentIds)` (full response group).
`CustomerOrderService.ProcessModel` runs `_totalsCalculator.CalculateTotals(model)` for the full response group, and
`DefaultCustomerOrderTotalsCalculator.GetCurrency` does `currencies.First(c => c.Code.EqualsIgnoreCase(currencyCode))`, which
throws for a deleted currency. One bad order fails the whole batch, and `IndexingJobs.IndexChangesAsync` then skips
`SetLastIndexationDateAsync`, so the next run re-reads the same window.

Related: VCST-6487 — same `First` lookup surfaces as a 500 on `PUT /api/order/customerOrders` with an unknown currency.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront | N/A | background indexing |
| 2. Admin | N/A | (order search reads the stale index) |
| 3. xAPI | N/A | — |
| 4. REST / background job | FAIL | `IndexationDate.CustomerOrder` frozen; error per run; XTS re-add proof |

## Need hotfixes
Set — the defect is in the code of the two latest stable bundles (v16, v15): vc-module-order 3.1018.1
`DefaultCustomerOrderTotalsCalculator.cs:182` / 3.1009.0 `:166`; still present in 3.1021.0 `:182`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST / background job
- **Suggested repo:** VirtoCommerce/vc-module-order
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Orders — totals calculator currency lookup (indexing via CustomerOrderDocumentBuilder)
- **RCA anchor:** `src/VirtoCommerce.OrdersModule.Data/Services/DefaultCustomerOrderTotalsCalculator.cs:182` `GetCurrency` → `currencies.First(...)`; called from `CustomerOrderService.ProcessModel`
- **Routing confidence:** MEDIUM — a robust fix may also want vc-module-search to isolate a failing document instead of failing the batch; that half would be a second repo.
