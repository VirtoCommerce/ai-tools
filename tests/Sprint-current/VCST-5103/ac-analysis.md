# VCST-5103 — AC Analysis & Traceability

**Story:** [Loyalty] [Mixed Cart] Loyalty Points Balance Validator · Epic VCST-5099 · Priority Medium (P2) · Status Tested
**Build:** Platform 3.1039.0 · Loyalty 3.1004.0-pr-10 · Orders pr-497 · XOrder pr-43 · XCart 3.1022.0-pr-125 · theme 2.52.0-pr-2335
**Implementation source:** LoyaltyCartValidator (vc-module-loyalty#10) wired via ICartValidator (vc-module-x-cart#125). No PR linked to 5103 directly — reconciled against the deployed epic PRs + suites 075b/083b.

## Story text (verbatim)
> As a Customer, I want to see a validation error on the add and cart level validation error `Σ(items WHERE Currency==PTS) ≤ getAvailableBalanceAsync(userId)`. Returns a generic "not enough points" error, so that I can remove some loyalty products from cart.
> **Note:** Error should block checkout.
> **Note:** At least one common product should be added to cart, otherwise error. Can be configurable, can be added as extension point …

## AC Quality Scorecard

| # | Condition (atomic, testable) | Quality | Verdict |
|---|---|---|---|
| AC1 | When Σ(PTS line totals) > available loyalty balance, a validation error is emitted | testable | KEEP |
| AC2 | The error is a generic "not enough points" error carrying the shortfall (required / available) | vague ("generic") | REWRITE → assert `errorParameters` `required`/`available` non-null |
| AC3 | The error blocks checkout — no order is created | testable | KEEP |
| AC4 | The error surfaces "on the add and cart level" | **ambiguous** (UI vs API layer unspecified) | SPLIT → AC4a backend `cart.validationErrors` at cart level; AC4b UI presentation |
| AC5 | Customer can remove the loyalty product(s) to resolve and proceed | testable | KEEP |
| AC6 | A cart with only point products (no common/cash line) emits an error | testable | KEEP (Note 2) |
| AC7 | Adding a common product clears the points-only error | testable | KEEP (Note 2) |
| AC8 | The "≥1 common product" rule is configurable / extensible | **non-falsifiable** (dev extension point, no UI/API surface) | DROP from QA scope — note as dev-design, untestable from black box |

### Weak ACs (rewrites)
- **AC2** "generic 'not enough points'": *On a PTS-over-balance cart, `cart.validationErrors` contains `LOYALTY_INSUFFICIENT_BALANCE` with `errorParameters` keys `required` and `available` (non-null), and the storefront renders the localized i18n `loyalty_insufficient_balance` message (not a raw key).*
- **AC4** "add and cart level": the **backend** contract exposes the error at cart level (`cart.validationErrors`) — true at both add and read. The **storefront UI does NOT render a pre-emptive cart/add banner**; the localized message surfaces as a **toast at the Place-Order attempt** (memory `project_loyalty_insufficient_balance_placeorder_timing`, verified 2026-06-24). Split accordingly; AC4b is a known **DRIFT** between story wording and shipped UX.

## AC ↔ Implementation coverage (deployed)

| # | Impl verdict | Evidence basis | Covering case |
|---|---|---|---|
| AC1 | **SATISFIED** | `LOYALTY_INSUFFICIENT_BALANCE` in `cart.validationErrors` (LoyaltyCartValidator rule 4). Live-verified PASS 9/9 today (2026-06-24, MCO-GQL-005). | 075b **MCO-GQL-005** |
| AC2 | **SATISFIED** | `errorParameters` `required`/`available` non-null (lowercase string values). | 075b MCO-GQL-005 |
| AC3 | **SATISFIED** | `place_order` `errors[]` non-empty + `createOrderFromCart` null = blocked (BL-LOY-008). | 075b MCO-GQL-005 / 083b MCO-E2E-002 |
| AC4a (backend, cart level) | **SATISFIED** | `cart.validationErrors` carries the code on add + on read. | 075b MCO-GQL-005 |
| AC4b (UI, add/cart banner) | **DRIFT** (verify live) | No pre-emptive /cart banner; surfaces as toast at Place Order. Story says "add and cart level" → UX diverges (server-side at placement). | 083b MCO-E2E-002 |
| AC5 | **SATISFIED** | Removing the PTS line clears the error; valid checkout completes. | 083b MCO-E2E-002 |
| AC6 | **SATISFIED** | `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` on PTS-only cart. | 075b **MCO-GQL-006** / 083b MCO-E2E-006 |
| AC7 | **SATISFIED** | Adding a cash line clears the points-only error. | 075b MCO-GQL-006 |
| AC8 | **NOT-FOUND** (out of QA scope) | No black-box surface for the configurability/extension point. | — |

**Unspecified implementation (no AC governs):** the points-only place-order path throws a **known 500 → generic toast** (not the typed cart error) at placement — tracked as MCO-E2E-006 KNOWN issue, not a fresh defect.

## Gap-ACs (folded into test scope)

| ID | Gap-AC | BL/ECL | Covering |
|---|---|---|---|
| GAP-1 | **Boundary:** Σ(PTS) == balance exactly → ALLOWED (rule is `≤`, not `<`) | ECL-2 (BVA), BL-LOY-008 | Exploratory |
| GAP-2 | **Boundary:** Σ(PTS) one unit over balance → blocked | ECL-2 (BVA) | Exploratory |
| GAP-3 | Σ is across **all** PTS lines (multi-line summation), not per-line | BL-LOY-008 | Exploratory |
| GAP-4 | Reducing qty / removing one of several PTS lines under balance clears the error | BL-LOY-008 | Exploratory / MCO-E2E-002 |
| GAP-5 | Localized message renders (i18n `loyalty_insufficient_balance`), not a raw key | BL-UI (i18n) | MCO-E2E-002 |
| GAP-6 | `required`/`available` params reflect actual numbers (consistent with cart PTS total vs balance) | BL-LOY-008 | MCO-GQL-005 |

## Verdict spine
PASS requires PASS evidence for AC1, AC2, AC3, AC4a, AC5, AC6, AC7 + live reconciliation of **AC4b (DRIFT)**. AC8 is waived (out of black-box scope). Gap-ACs are coverage enrichment; GAP-1/GAP-2 (boundary `≤`) are the most likely to surface a real defect.
