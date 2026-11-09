# BUG: Loyalty missions — OrderValueGoal accepts an invalid or lowercase currencyCode (XYZ, usd) and stores it verbatim

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-05-1645-W7

- **Tracker:** [VCST-6725](https://virtocommerce.atlassian.net/browse/VCST-6725) · Relates VCST-6042, VCST-5855, VCST-6084
- **Severity:** Medium (P3) · **Type:** validation gap (backend REST)
- **Case:** MSN-005 (suite 075d), stable-16 W7

## Env
- Stand `vcptcore_regression`, store `B2B-store`
- Platform 3.1076.8, VirtoCommerce.Loyalty 3.1009.0, Marketing 3.1009.0, MarketingExperienceApi 3.1004.0 — matches `vc-deploy-dev@vcptcore-regression`
- Repro rate: deterministic (2/2 W7 run, 2/2 re-verify 2026-11-06 10:38 UTC)
- Trace id: none — the stand sends neither Request-Id nor traceparent
- App Insights: N/A for this env — fallback is the response bodies in the package `network/`
- HAR / console / screenshot / DOM: none — REST from Node, no browser lane, no UI surface. **Evidence is non-visual.**

## Summary
`POST /api/loyalty-missions` accepts an `OrderValueGoal.currencyCode` that is not a known currency (`XYZ`) or is lowercase (`usd`). It returns 200 and stores the value as sent. Only null or empty is rejected. A mission like this probably cannot match any order currency (impact not verified).

## Steps to reproduce
1. Get an admin bearer token: `POST /connect/token`, bare password grant.
2. `POST /api/loyalty-missions` with a Draft mission: storeId `{{STORE_ID}}`, condition AnyUserGroupCondition, goal `{"id":"OrderValueGoal","value":100,"currencyCode":"XYZ"}`, reward FixedAmountReward 50 → **200**, id returned.
3. `GET /api/loyalty-missions/{id}` → goal `currencyCode:"XYZ"` persisted.
4. Repeat with `"usd"` → **200**, stored `"usd"` (not normalised). Control `"USD"` → 200.
5. Presence control (MSN-004, W7 PASS): currencyCode null → 400 "Currency code is required for the order value goal".

## Actual
- XYZ → 200, read-back `"XYZ"`; usd → 200, read-back `"usd"`. Bodies: `reports/regression/REG-2026-11-05-1645-W7/evidence/MSN-005/network/MSN-005-rest-exchange.json`

## Expected
- An unknown code → 400 with a validation message, as an empty code already is; a wrong-case code is rejected or normalised to `USD`.
- No doc page states a currency rule (VirtoOZ unreachable, module README at 3.1009.0 silent). Expected behaviour follows from the validator treating the code as required. **The docs check is still owed.**

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A — not probed by the investigation | — |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | FAIL | `evidence/MSN-005/network/MSN-005-rest-exchange.json` |

**Owning layer:** Layer 4 — REST validation

## Root Cause Analysis
- `LoyaltyMissionValidator.cs:46-49` (vc-module-loyalty tag 3.1009.0) checks only `OrderValueGoal { CurrencyCode: null or "" }`; `LoyaltyMissionController.Update` saves whatever passes. Copy: `evidence/_source/LoyaltyMissionValidator.cs`.
- `3.1009.0...dev` changes no validator file, so 3.1010.0 does not fix it.
- Ruled out: data drift (a fresh body on each call), later normalisation (read-back unchanged). By-design: not ruled out by docs (see Expected).
- Full package: `reports/regression/REG-2026-11-05-1645-W7/evidence/MSN-005/root-cause.md`

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-loyalty
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Loyalty — LoyaltyMissionValidator
- **RCA anchor:** `src/VirtoCommerce.Loyalty.Data/Validators/LoyaltyMissionValidator.cs:46-49` — `OrderValueGoal { CurrencyCode: null or "" }`
- **Routing confidence:** HIGH (mechanism); intent pending a docs/product decision on the allowed currency set (platform vs store currencies)
