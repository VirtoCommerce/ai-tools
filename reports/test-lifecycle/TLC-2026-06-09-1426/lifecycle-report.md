# Test Case Lifecycle Report — TLC-2026-06-09-1426

## Summary
- **Input:** VCST-5101 — [Loyalty][Mixed Cart][E2E] Add Loyalty Product to Cart (Story under epic VCST-5099)
- **Input Type:** change-source (JIRA → 3 deployed PRs)
- **Date:** 2026-06-09 14:26
- **Platform:** 3.1035.0 · **Theme:** vc-theme-b2b-vue-2.51.0-pr-2310-6b00d69d
- **Modules:** XCart 3.1018.0-pr-120 · Cart 3.1005.0-pr-188 (both PR artifacts, deployed to vcst-qa)
- **Verdict:** **APPROVED** — feature verified working live; all new + synced cases green.

## Phase Results
| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 5 suites; 3 PRs all deployed; schema refreshed; env healthy |
| 2. Sync | test-management-specialist | Done | 8 cases synced (currency-scoped) |
| 3. Generate | test-management-specialist | Done | 7 cases created (5 GQL + 2 storefront) |
| 4. Review & Fix | test-management-specialist | Done | 16 auto-fixes; 3 manual items; td-refs 2329/2329 |
| 5. Verify | qa-testing-expert | Done | Feature PASS; all synced cases VERIFIED; 4 GQL cases needed operator fix |
| 6. Approve | orchestrator | **APPROVED** | Gates 9/9 pass; 4 GQL cases re-run green after fix |

## Change Inventory
| Repo / PR | Layer | Key change |
|-----------|-------|-----------|
| vc-module-cart #188 | backend | `CartTotal` model + `ShoppingCart.CartTotals`; `DefaultShoppingCartTotalsCalculator` groups & rounds **per currency** |
| vc-module-x-cart #120 | graphql | `cart.cartTotals: [CartTotalType{isDefaultTotalCurrency,total,subTotal,taxTotal,discountTotal}]`; `LineItemType.currencyCode`; `itemCurrencyCode` input on addItem/addItems/updateQuantity; `extendedPriceTotal` now cart-currency-only |
| vc-frontend #2310 | storefront | `splitLineItemsByCurrency`; "Products in {currency}" group + "Total in {currency}" summary block; add/count-in-cart match by productId+currencyCode; i18n `total_in_currency`/`products_in_currency` (13 locales) |

**Concept:** loyalty currency `PTS`, loyalty mode "Mixed Cart" — a PTS loyalty product can coexist with USD products in one cart, with line items + totals split by currency. Configurable products excluded.

## Sync Results
| Case ID | Suite | Classification | Action |
|---------|-------|---------------|--------|
| CRX-GQL-096 | 050b4 | INCOMPLETE | + `cartTotals`/`extendedPriceTotal` to query + assertions |
| CRX-GQL-097 | 050b4 | INCOMPLETE | + `currencyCode` to items selection + assertion |
| CRB-GQL-021, CRB-GQL-132 | 050b1 | VALID (scoped) | currency-scope note (same-currency coalescing) + sync ref |
| CART-016 | 028 | INCOMPLETE | USD subtotal scoped to USD-currency lines |
| CART-033, CART-039 | 028 | VALID (scoped) | BL-CART-007 retitled "same currency"; assertion scoped |
| LOYF-025 | 083 | STALE → rewritten | Mixed Cart mode; auth → LOYALTY_VIP_USER |

## New Cases Generated
| Case ID | Suite | Layer | Priority | Title |
|---------|-------|-------|----------|-------|
| GQL-MC-001 | 050b1 | GraphQL | Critical | addItem itemCurrencyCode=PTS → separate PTS line |
| GQL-MC-004 | 050b1 | GraphQL | High | single-currency cart → cartTotals exactly 1 element |
| GQL-MC-002 | 050b4 | GraphQL | Critical | cartTotals 2 elements, exactly one isDefaultTotalCurrency=true |
| GQL-MC-003 | 050b4 | GraphQL | High | extendedPriceTotal excludes PTS line (cart-currency only) |
| GQL-MC-005 | 050b4 | GraphQL | High | changeCartItemQuantity targets PTS line via lineItemId |
| CART-071 | 028 | Storefront | Critical | "Products in PTS" group + "Total in PTS" summary block |
| CART-072 | 028 | Storefront | High | same product in different currencies → independent counts |

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 15-col format valid; IDs unique |
| G2 Determinism | PASS | cleanup_pre/post; reset-cart preconditions |
| G3 Completeness | PASS | P+N+B mix (1 Should-Fix gap, see below) |
| G4 Testability | PASS | falsifiable; live-verified |
| G5 Data Validity | PASS | no hardcodes; td-refs 2329/2329; no bare GUIDs |
| G6 BL Coverage | PASS | every new case maps BL-CART-*/BL-GQL-* |
| G7 Duplication | PASS | no same-layer dup |
| G8 Environment | PASS | feature VERIFIED live; all 7 new + synced cases green; 0 BROKEN |
| G9 Sync | PASS | 8 synced; BL conflicts flagged (not auto-edited) |

## Environment Verification (Phase 5)
Feature **works end-to-end** on vcst-qa (VIP user, Mixed Cart mode):
- /cart: USD items in main section, PTS items under "Products in PTS"; order summary shows USD totals + separate "Total in PTS" block; currency blocks independent.
- xAPI cart returns `cartTotals` = 2 elements ([0] USD `isDefaultTotalCurrency:true`, [1] PTS false); each line item carries `currencyCode`; `extendedPriceTotal` USD-only.
- GraphQL cases: GQL-MC-004 passed as authored; GQL-MC-001/002/003/005 reported false-FAIL from a filter-operator defect (`==` vs runner's `=`/`!=`) — **fixed by orchestrator** (`[?field==v]`→`[?field=v]`, 12 occurrences) and **re-run live: all PASS** (6/6, 7/7, 6/6, 3/3).
- Synced storefront cases (CART-016/033/039/071/072, LOYF-025): all VERIFIED.
- Screenshots: `tests/Sprint26-11/VCST-5101/screenshots/cart-mixed-split-lineitems.png`, `cart-order-summary-pts-block.png`.

## Remaining Items (non-blocking)

### Should Fix
- **Coverage gap (Medium):** no negative for a **non-VIP user + PTS-only product** (expected: unavailable or USD fallback). Suggest CART-073 / GQL-MC-006.
- **BL conflicts (need human decision — `--update-bl` not run, so no proposals file written):**
  - `BL-CART-004` "no mixed-currency state" — now contradicted by design. Needs a Mixed-Cart exception clause.
  - `BL-CART-007` "same SKU → quantity not duplicate line" — now currency-scoped (same productId + different currencyCode → new line). Needs a currency-scope clause.
  - Re-run `/qa-test-lifecycle suite 028 --skip-sync --skip-generate --update-bl` (or approve drafts manually) to fold these in.

### Investigate (root-caused — client-side only, not a backend defect)
- **Apollo cache error #13 "Missing field 'currencyCode' while writing result"** on every add-to-cart (LineItemType). **Non-fatal** (cart/totals render & persist correctly).
- **Root cause (verified):** *not* the xAPI/backend. Live reproduction of the exact `updateCartQuantity` mutation (the add-to-cart-simple path) returns `currencyCode` **present, non-null, correct** for every item (`errors: null`) — server response is complete. The warning is a **vc-frontend (PR #2310) cache-write artifact**: PR #2310 added `currencyCode` to the *shared* `shortLineItem` + `fullCart` fragments, so every normalized `LineItemType` cache entity now expects the field — but the add-to-cart path writes line items through the **client-side mutation batcher** (`useMutationBatcher` + `getMergeStrategyUniqueBy`, `useShortCart().updateItemCartQuantity`), and that interim/merged write constructs LineItem objects **without** `currencyCode`. Apollo logs the missing-field warning on that write, then reconciles against the authoritative server response (which has it) → harmless.
- **Fix (belongs in vc-frontend PR #2310, not QA/backend):** include `currencyCode` in the batcher's merged/optimistic LineItem write (mirror the shared `shortLineItem` selection), or relax the cache field policy. Low severity — cosmetic console noise, no functional/data impact.
- Evidence: live xAPI mutation replay (USD + PTS adds) — both items returned `currencyCode` "USD"/"PTS"; ruled the backend out as the second source.

## Files Modified
- `regression/suites/Backend/graphql/050b1-graphql-xcart-basic.csv` (CRB-GQL-021/132 synced; GQL-MC-001/004 added; operator fix)
- `regression/suites/Backend/graphql/050b4-graphql-xcart-cross-domain.csv` (CRX-GQL-096/097 synced; GQL-MC-002/003/005 added; operator fix)
- `regression/suites/Frontend/cart/028-cart-core.csv` (CART-016/033/039 synced; CART-071/072 added)
- `regression/suites/Frontend/loyalty/083-loyalty-catalog.csv` (LOYF-025 rewritten)
- `config/test-suites.json` (testCount: 028 44→46, 050b1 17→19, 050b4 20→23)
- `test-data/aliases.json` (LOYALTY_VIP_USER: + email_env/password_env; v1.5.13→1.5.14)
- `.env.vcst` (+ LOYALTY_VIP_USER_EMAIL) · `.env.local` (+ LOYALTY_VIP_USER_PASSWORD, gitignored) — wire the existing VIP account into runner `[AUTH role=...]`
- `.claude/agents/knowledge/graphql-schema.md` (live schema refresh — pre-flight)

## Next Steps
- [ ] Promote the 7 new Draft cases → Reviewed (feature live-verified, all green).
- [ ] Decide BL-CART-004 / BL-CART-007 amendments (run with `--update-bl` or edit manually).
- [ ] (Optional) add the non-VIP negative case (CART-073 / GQL-MC-006).
- [ ] Second-source repro of the Apollo `currencyCode` cache write before any bug filing.
- [ ] Run `/qa-regression cart` (+ 050b1, 050b4) on next sprint pass — VCST-5101 coverage is ready.
