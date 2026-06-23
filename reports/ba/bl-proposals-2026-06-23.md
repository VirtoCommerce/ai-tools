# Business Logic Proposals — BA-2026-06-23

> **PROMOTION STATUS (2026-06-23):** 4 of 5 promoted to `business-logic.md` per user approval —
> `BL-ORD-010`, `BL-LOY-007`, `BL-LOY-008`, `BL-LOY-009` (prefixes find-replaced in suites 075b/083b;
> BL-LOY-008 has no suite citation — its insufficient-balance cases were pruned out of scope).
> **`PROPOSED-BL-ORD-011` is HELD as a draft** until the PP-04 null-currency fix ships (currently
> AT RISK — promoting it now would document an invariant live code violates). Re-evaluate after the fix.

> **These are drafts. They are NOT applied to `.claude/agents/knowledge/business-logic.md`.**
> Promotion requires **explicit user approval per proposal**. Review, edit as needed,
> approve individual entries, assign final `BL-*` IDs, then direct Claude to promote
> only the approved entries. Claude will never modify `business-logic.md` on its own.
>
> Source: `/ba-analyze` run `2026-06-23` (VCST-5104 mixed-cart loyalty Create Order) — see `reports/ba/ba-report-2026-06-23.md`.
> Existing Domain 17 (`BL-LOY-001..006`) covers the **cart** layer only; these extend coverage to the **order-creation** layer. Next free IDs: `BL-ORD-010+`, `BL-LOY-007+`.

---

## New Invariants Proposed

### PROPOSED-BL-ORD-010: Order totals — one entry per distinct line currency, default-currency flag unique `[P1-data]`

- **Rule:** `CustomerOrder.OrderTotals[]` MUST contain exactly one entry per distinct currency present across `Items[].Currency`, `Shipments[].Currency`, `InPayments[].Currency`. The entry whose `CurrencyCode == CustomerOrder.Currency` MUST have `isDefaultTotalCurrency = true`; no other entry may. Each entry's `total/subTotal/taxTotal/discountTotal` reflect only that currency's entities. Single-currency order → exactly 1 entry. The REST `WithOrderTotals` (bit 9, =512) response group must be requested; without it `OrderTotals` is null (not empty).
- **Verify:**
  - Single-currency USD order → `order { orderTotals { isDefaultTotalCurrency total{currency{code}} } }` → exactly 1 entry, USD, `isDefaultTotalCurrency=true`.
  - Mixed (USD + PTS) order → exactly 2 entries; exactly one `isDefaultTotalCurrency=true`; each subTotal = sum of its-currency lines.
  - REST GET without `WithOrderTotals` → `orderTotals` is null.
- **Violation signal:** Duplicate currency entries; zero or two `isDefaultTotalCurrency=true`; an entry's subtotal mixes currencies; `OrderTotals` populated without the flag requested.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-order #497 `OrdersModule.Core/Model/OrderTotal.cs` + `DefaultCustomerOrderTotalsCalculator.CalculateTotals`; vc-module-x-order #43 `CustomerOrderAggregate.OrderTotals` + `CustomerOrderType.cs:179`; live-verified vcst-qa 2026-06-22 (order returned USD + PTS totals).
- **Triggered by:** VCST-5104 Task 1

---

### PROPOSED-BL-ORD-011: Placed-order line items retain per-line currency; currency non-null on every item `[P0-revenue]`

- **Rule:** Every `CustomerOrder.Items[i].Currency` MUST be non-null after order creation. Single-currency order → all items carry `order.Currency`. Mixed Cart → loyalty-currency lines retain the points currency (e.g. `PTS`/`XPT`), primary lines retain the primary currency. No conversion or nullification during cart→order projection; per-line currency is immutable after creation.
- **Verify:**
  - Single-currency order → `order.items[].currency.code` = `order.currency.code` for all items.
  - Mixed order → USD lines `currency=USD`, PTS lines `currency=PTS`, none null.
  - xAPI `order { items { currency { code } } }` resolves non-null on every item.
- **Violation signal:** Any item currency null; a PTS line shows USD; a non-null code matches no registered platform currency.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-x-order #43 `OrderLineItemType.cs:78` + `ResolveFieldContextExtensions.GetOrderItemCurrency` (fallback to `order.Currency` when line currency empty); live-verified 2026-06-22. **NOTE:** currently AT RISK — the resolver returns null (not the fallback) when a non-empty line currency is absent from `AllCurrencies` (see report PP-04 / API §B1).
- **Triggered by:** VCST-5104 Task 2 + PP-04

---

### PROPOSED-BL-LOY-007: Mixed Cart order — points earned and redeemed exactly once, dedup per operation type `[P0-revenue]`

- **Rule:** On a Mixed-Cart order (`LoyaltyMode = "Mixed Cart"`): (a) exactly one `Earned` log per `(CustomerOrder, orderId)` for cash-line ProductPoints; (b) exactly one `Redeemed` log per `(CustomerOrder, orderId)` for the loyalty-currency order total; (c) both may coexist on one orderId — dedup key is `(objectType, objectId, operationType)`; (d) Hangfire retry of the job posts neither a second time; (e) orders paid via the LoyaltyPaymentMethod gateway are excluded (handled by the gateway).
- **Verify:**
  - Mixed order → operation log for `objectId=orderId` has exactly 2 entries: one `Earned`, one `Redeemed`.
  - Re-trigger `ProcessOrdersAsync` for the same order → still exactly 2 (idempotent).
  - Second mixed order, same user → its own 2 entries.
  - LoyaltyPaymentMethod-gateway order → 0 entries from this handler.
- **Violation signal:** 0 or ≥2 `Earned`/`Redeemed` for one order; missing earn (cash points not awarded) or redeem (balance not deducted); retry duplicates.
- **Agents:** qa-backend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyProgramHandler.EarnProductPointsAsync` / `RedeemLoyaltyProductsAsync` + `LoyaltyLogicService.LogLoyaltyProgramOperationInternalAsync` (dedup by op-type); live-verified 2026-06-22 (both posted, no dup on retry). **Related risk:** redeem relies on `OrderTotals` being loaded — see PP-06.
- **Triggered by:** VCST-5104 Task 3

---

### PROPOSED-BL-LOY-008: Insufficient loyalty balance blocks order creation with a typed `LOYALTY_INSUFFICIENT_BALANCE` error `[P0-revenue]`

- **Rule:** When a cart's loyalty-currency total exceeds the user's loyalty balance, `LoyaltyCartValidator` MUST surface a `LOYALTY_INSUFFICIENT_BALANCE` validation error with params `{required, available}` (where `required > available`), and the order MUST NOT be created — the balance shortfall blocks checkout. The cart MUST remain intact and readable.
- **Verify:**
  - Mixed cart whose PTS total exceeds balance (or drain balance to 0) → cart validation returns `LOYALTY_INSUFFICIENT_BALANCE` with `required`/`available` present and `required > available`.
  - Order is not created; cart still readable/unchanged.
  - Storefront surfaces the localized insufficient-balance message (i18n `loyalty_insufficient_balance`).
- **Violation signal:** Order created despite a balance shortfall; missing/empty `required`/`available` params; balance allowed to go negative.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyCartValidator.cs` (rule 4 emits `LOYALTY_INSUFFICIENT_BALANCE` with `errorParameters` required/available); vc-frontend #2335 i18n `loyalty_insufficient_balance`. Verified working on vcst-qa 2026-06-22 (`{required,available}` confirmed via 050b/075b diagnostic). Needs a dedicated zero-balance user for the full negative path (`LOYALTY_NOBAL_USER_*` fixture still open).
- **Triggered by:** VCST-5104 Task 3 (loyalty balance / redeem)

---

### PROPOSED-BL-LOY-009: Mixed Cart earn — only cash-currency lines earn points; loyalty-currency lines earn zero `[P1-data]`

- **Rule:** In Mixed-Cart `EarnProductPointsAsync`, earned points are computed exclusively from `order.Items` whose `Currency != loyaltyCurrency`. Loyalty-currency (points-priced) items contribute 0. Holds both in the order-time job and the cart `loyaltyPoints` preview. Guard: `Items.Where(x => !x.Currency.EqualsIgnoreCase(loyaltyCurrency))`.
- **Verify:**
  - Mixed cart 1 USD + 1 PTS → placed order `Earned` amount = points from the USD line only.
  - `cart.items { loyaltyPoints { amount } }` → PTS line returns null/0, USD line non-zero.
  - PTS-only cart → no `Earned` log (points ≤ 0 → not written).
- **Violation signal:** Loyalty-currency line earns non-zero; USD earn includes a PTS contribution; `loyaltyPoints` non-zero on a PTS line.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyProgramHandler.EarnProductPointsAsync` + `LineItemTypeHook` (currency-filtered) + `LoyaltyPointsCalculator.ResolveAsync` (early-return when `currencyCode == pointsCurrency`). Order-layer refinement of **BL-LOY-005**.
- **Triggered by:** VCST-5104 Task 3

---

## Stale BL-* Flagged

**None.** `BL-LOY-001..006` remain accurate (cart layer); the new order-layer behavior extends, not contradicts, them.

---

## Application Notes

1. Assign final IDs by reading `.claude/agents/knowledge/business-logic.md` for the next available `BL-<DOMAIN>-NNN`.
2. Replace `PROPOSED-` prefix with final ID.
3. Paste the edited entry into the correct domain section (Domain 17 for LOY; Orders & Fulfillment for ORD). Edit the body section only — do **not** auto-update the Invariant Coverage Summary table.
4. After the entry lands, re-run related `/qa-review-tests suite <ID> --verify` so test cases gain their `Business_Rule` mapping (075b / 083b loyalty mixed-cart suites).
