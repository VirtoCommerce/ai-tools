# salesRepCustomerOrder localizes the status but not the money — `$118.00` under de-DE — P3

**Severity:** P3 · **Type:** i18n / GraphQL xAPI (scoped `sales-rep` schema)
**Provenance:** PRE-EXISTING (shared single-order resolver in `vc-module-x-order`, not introduced by VCST-5733)
**Invariant:** BL-SR-013 (rep-facing status / money vocabulary localizes by `cultureName`)

**Env:** vcst-qa @ Platform 3.1063.0, SalesRep 3.1007.0-pr-14-5569, XOrder 3.1010.0

## Summary
`salesRepCustomerOrder(id:, cultureName:)` localizes `statusDisplayValue` (`Neu`, `Nouvelle`) but leaves
`total.formattedAmount` / `subTotal.formattedAmount` in the **en-US** format. The sibling *list* query
`salesRepCustomerOrders` formats the **same order** under the **same culture** correctly, so one order
renders two different ways depending on which query loaded it.

Concretely, for one order under `cultureName: "de-DE"`:

| Query | `statusDisplayValue` | `total.formattedAmount` |
|---|---|---|
| `salesRepCustomerOrders` (list) | `Neu` | `118,00 $` |
| `salesRepCustomerOrder` (by id) | `Neu` | `$118.00` |

## Steps to Reproduce
1. Obtain a sales-rep token (`storeId={{STORE_ID}}`).
2. `POST /graphql/sales-rep` → `{ salesRepCustomerOrders(storeId:"{{STORE_ID}}", cultureName:"de-DE", first:5) { items { id number statusDisplayValue total { formattedAmount } } } }`. Note one order's `number`, `id` and formatted total.
3. `POST /graphql/sales-rep` → `{ salesRepCustomerOrder(id:"<that id>", cultureName:"de-DE") { number statusDisplayValue total { formattedAmount } subTotal { formattedAmount } } }`.
4. Compare `total.formattedAmount` between the two responses.

## Expected vs Actual
- **Expected (BL-SR-013):** `formattedAmount` localizes by `cultureName` on every rep-facing surface; the same order formats identically whichever query returned it.
- **Actual:** the by-id query returns the en-US form (`$118.00`) while the list query returns the de-DE form (`118,00 $`).

## Triangulation — why this is PRE-EXISTING
The standard xAPI behaves identically: `order(id:…, cultureName:"de-DE")` returned `statusDisplayValue "Neu"` with `total "$1,757.99"`, while `orders(…, cultureName:"de-DE")` returned `"1.757,99 $"`. The
defect is therefore in the shared single-order resolver in `vc-module-x-order`, not in
`vc-module-sales-rep` PR #14 — this ticket merely exposes it on a new surface.

## Related, same session
`term_facets[].terms[].label` **is** localized (`Neu`, `Abgesagt`, `Bezahlung erforderlich`, `Vollendet`),
but **`Processing` is untranslated** in de-DE — a missing resource string in the shared status dictionary
rather than a code path. Recorded here so the two are not conflated: the money issue is a resolver bug,
the `Processing` gap is a missing translation.

## Notes
Below the `/qa-test` 5d severity floor, so **not filed to the tracker** — recorded in
`reports/tickets/Sprint26-17/VCST-5733/summary.json` `bugs_not_filed[]`. The storefront-visible half is
covered by case `SR-CO-013` (localized status/money, no raw enum or i18n key).
