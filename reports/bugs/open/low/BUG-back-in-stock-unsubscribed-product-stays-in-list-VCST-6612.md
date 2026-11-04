# An unsubscribed product stays in the Back-in-Stock List — **P3**

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-10-28-1013
**Tracker:** VCST-6612 (Relates VCST-6417) · case `B2C-STOCK-003` (suite 010) · KB-955C8CAC
**Env:** vcst · platform 3.1090.0 · theme 2.61.0-alpha.2605 · Chromium 1920

## STR
1. Sign in as a personal shopper (@td(AGENT_POOL_SLOT_1.email)), open @td(PROD_OOS.url), click **Stock alert**.
2. Open `/account/back-in-stock`, click **You'll be notified** in the row, reload.

## Actual
The button flips to **Stock alert**, but the row stays, also after reload. `GetBackInStockSubscriptions` sends no `isActive` and returns the row with `isActive:false`.

## Expected
The row is removed; the list holds active subscriptions (Storefront user guide, Back-in-stock notifications) `{DOC}`. Design caveat: the list sorts by `isActive`, so keeping inactive rows may be intended. The PO should confirm.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1 Storefront | FAIL | `evidence/B2C-STOCK-003/01-after-unsubscribe-and-reload-row-remains.png` |
| 2 Admin | N/A | not admin-visible |
| 3 xAPI | PASS (returns what is asked) | `evidence/B2C-STOCK-003/network-GetBackInStockSubscriptions.json` |
| 4 REST | PASS | `POST /api/back-in-stock/subscriptions/search` → isActive=false |

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend · **repoKind:** frontend · **Ownership hint:** platform
- **Component / module:** back-in-stock module page
- **RCA anchor:** `client-app/modules/back-in-stock/pages/subscriptions.vue:161` `fetchSubscriptions({ keyword })`
- **Routing confidence:** MEDIUM (the code is clear, but the intended behaviour is not)
