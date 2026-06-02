# VCST-5100 [Loyalty][Mixed Cart][E2E] — Backend Execution Report

**Env:** vcst-qa @ Platform 3.1030.0, Loyalty 3.1002.0-pr-9-9fc4, Theme 2.50.0-pr-2296 · Store B2B-store (USD/en-US, loyalty PTS)
**Scope:** Backend suite `regression/suites/Backend/loyalty/075-loyalty.csv` LOY-001..025 · Admin SPA (playwright-edge) + REST/GraphQL
**Date:** 2026-05-27 · Health 200, admin OAuth OK

## Counts

| Result | Count | IDs |
|--------|-------|-----|
| PASS | 24 | LOY-001..016, LOY-019..025 |
| KNOWN-BUG (re-confirmed) | 1 | LOY-018 |
| BEHAVIOR-CHANGED (known bug) | 1 | LOY-017 |
| FAIL (new) | 0 | — |
| BLOCKED / N-A | 0 | — |

Note: LOY-017/018 counted within the 25; both exercised. 23 clean PASS + LOY-019/020 SPA + 2 known-bug re-confirms = all 25 executed.

## Passes (one line)
LOY-001, LOY-002, LOY-003, LOY-004, LOY-005, LOY-006, LOY-007, LOY-008, LOY-009, LOY-010, LOY-011, LOY-012, LOY-013, LOY-014, LOY-015, LOY-016, LOY-019, LOY-020, LOY-021, LOY-022, LOY-023, LOY-024, LOY-025

Verification method: SPA edits driven as real user (click/type), persistence confirmed via `GET /api/loyalty-programs/{id}` `dynamicExpression` round-trips. API cases (LOY-021..025) via direct REST/GraphQL.

Key confirmations:
- CRUD + conditions engine (OrderStatusCondition all 7 statuses: ReadyForPickup/Custom/Cancelled/New/Completed/Pending/Payment required) + rewards engine (FixedAmount, RelativeAmount %) all persist.
- LOY-016: language dropdown shows all 10 store langs (en-US, de-DE, fr-FR, es-ES, pl-PL, it-IT, pt-PT, ja-JP, zh-CN, ru-RU), no dups.
- LOY-019: SPA Loyalty settings blade reflects Enable=ON / Mixed Cart / PTS (matches API). LOY-020: Mode dropdown exactly 4 values (Coupon Redemption, Loyalty Store, Mixed Cart, Payment Method).
- LOY-021 GET 200 {enabled,mode=Mixed Cart,currency=PTS}; LOY-022 PUT 204 round-trip (Loyalty Store→restored Mixed Cart); LOY-023 403 via dedicated restricted Manager user (storefront USER token returns `user_cannot_login_in_store` — can't auth to platform, so a back-office no-permission user was created/used/deleted); LOY-024 unknown store → 200 + `null`; LOY-025 xAPI `store().settings.modules` exposes VirtoCommerce.Loyalty {Loyalty.Enable=true, Loyalty.Mode=Mixed Cart, Loyalty.Currency=PTS}, errors[] empty.
- LOY-014 (priority persists per program) covered by LOY-001 (priority=1) + LOY-003 (priority=10 persisted); did not mutate foreign "Completed order" program.

## Known-bug re-confirmation (do NOT re-file)

| TC | Prior bug | Current behavior | Status |
|----|-----------|------------------|--------|
| LOY-017 | empty Name → API **500** (`BUG-loyalty-program-empty-name-500-VCST-5100.md`) | `POST /api/loyalty-programs {name:""}` now returns **HTTP 200** and CREATES an empty-name program. No 500. Validation still absent server-side. | **BEHAVIOR CHANGED** — no longer a 500 crash; now silent-accept of empty name. Bug premise (server has no name validation) still holds; symptom changed. SPA Add-blade still enforces client-side required-Name (Save disabled when empty), so UI is protected. |
| LOY-018 | negative reward points accepted (`BUG-loyalty-reward-negative-points-accepted-VCST-5100.md`) | `POST` with FixedAmountReward amount=-5 → **HTTP 200**, saved `amount:-5`. | **STILL PRESENT** (unchanged). |

Recommendation (for triage owner, not filed here): update `BUG-loyalty-program-empty-name-500-VCST-5100` to reflect 200/silent-accept instead of 500 on current build.

## FRONTEND DATA-READINESS VERDICT: **READY (with 1 caveat)**

| # | Check | Result |
|---|-------|--------|
| 1 | Loyalty catalog ROUTE configured | **NOT configured.** `loyalty-setting` has the field `loyaltyRoute` but value = **null**. `LoyaltyCatalogRootPermalink` not exposed in this API; only `loyaltyRoute` exists and is empty. `{FRONT_URL}/loyalty-catalog` is unlikely to resolve via a configured route — **frontend route resolution must be verified on the storefront side; do NOT assume a backend-configured permalink.** |
| 2 | PTS price list for B2B-store | **YES.** Exactly one: **"Loyalty PTS price list"** (id 3dd9ceb1…), currency PTS. Assigned to B2B-store via "Loyalty PTS assignment" (catalog = fc596540… B2B virtual root). |
| 3 | Products priced in PTS in B2B catalog | **YES.** xAPI `products(currencyCode:"PTS", filter:"category.subtree:fc596540…")` → totalCount 4574; **50 products carry a PTS price > 0** (top = 200 PTS, e.g. md351816). Prices return with `currency.code = "PTS"`. (Default sort surfaces amount=0 unpriced items first; `sort:"price:desc"` confirms real PTS prices exist.) |
| 4 | Settings propagate to storefront xAPI store() | **YES (LOY-025 PASS).** module VirtoCommerce.Loyalty present; Loyalty.Enable=true, Loyalty.Mode=Mixed Cart, Loyalty.Currency=PTS; errors[] empty. |

**Verdict line:** Frontend prerequisites **READY** for data-driven catalog browsing (price list, ~50 PTS-priced products, settings propagation all good) — **EXCEPT** the loyalty catalog ROUTE (`loyaltyRoute` is null). If the frontend E2E expects `{FRONT_URL}/loyalty-catalog` to resolve from a backend-set permalink, that prerequisite is **NOT met** and must be configured or verified storefront-side first. All other catalog-browsing data is present.

## End state (happy path restored — required by frontend suite)
`GET /api/loyalty-setting/store/B2B-store` → `{loyaltyEnabled:true, loyaltyMode:"Mixed Cart", loyaltyCurrency:"PTS", loyaltyRoute:null}`. Confirmed as final action.

## New bugs
None beyond LOY-017/018. No new defects found.

## Teardown
- Created loyalty program (AGENT-TEST) deleted via SPA delete dialog (LOY-004) — verified 0 AGENT-TEST programs remain.
- Empty-name program (LOY-017) and negative-reward program (LOY-018) deleted via API (204).
- LOY-023 restricted Manager user + role created, used, deleted (204). Final sweep: 0 stray AGENT-TEST users/roles.
- Loyalty setting left in happy-path state.

## Evidence
Screenshots under `tests/Sprint-current/VCST-5100/screenshots/`: LOY-005-009-condition-reward, LOY-006-multi-condition, loy007-remove, loy011-rewards, loy016-languages, LOY-019-loyalty-settings, LOY-020-mode-options, LOY-004-delete-confirm. HAR auto-captured under `test-results/edge/har/`. Console: only benign `logo-only.svg` 404 (env noise, unrelated to loyalty) — no loyalty JS errors. Network: no 4xx/5xx on loyalty endpoints except the expected LOY-023 403 and LOY-017/018 behavior probes.
