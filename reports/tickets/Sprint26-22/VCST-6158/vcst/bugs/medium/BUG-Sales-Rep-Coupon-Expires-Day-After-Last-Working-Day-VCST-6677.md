# BUG: [Sales Rep Hub] Coupon "Expires" shows the day after the code stops working `[Medium]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6158
**Tracker:** [VCST-6677](https://virtocommerce.atlassian.net/browse/VCST-6677) — standalone Bug, Relates VCST-6158 (re-filed from sub-task VCST-6673; Jira cannot convert a Subtask to a Bug)
**Severity:** Medium (graded at /qa-test 5-triage)

Env: vcst-qa @ Platform 3.1093.0-pr-3154-4607, VirtoCommerce.SalesRep 3.1017.0-pr-30-1e10 (vc-module-sales-rep#30), theme 2.62.0-pr-2596-e749-e749b47f (vc-frontend#2596), Marketing 3.1010.0; store B2B-store; browser TZ Europe (CET/CEST).

## Summary
The rep's coupon card renders `endDate` as a date only, in the browser time zone. A coupon ending at local midnight
shows a day on which the code no longer works (ZUR10 `2027-05-31T22:00:00Z` → "Expires Jun 1, 2027"); every
`23:59:59Z` end shows the next day in UTC+1, and a UTC/US viewer sees the previous day. Which time zone is the
reference (store / viewer / UTC) is a **PO decision**.

## Steps to reproduce
1. Browser TZ = Central Europe; sign in to the storefront as a sales rep (`@td(SR_REP_PRIMARY)`).
2. **Sales Rep Hub → My customers** → any served customer.
3. **All promotion coupons** → find **ZUR10** → read **Expires**.

## Expected vs Actual
- **Expected** (checklist C-17, case SR-CP-084): the date shown is never after the last day the code works (ZUR10: May 31, 2027 for a UTC+2 reader); one reference TZ on rep and buyer pages.
- **Actual:** ZUR10 "Jun 1, 2027"; AGENTTESTSRCPNEND `2026-11-13T23:59:59Z` → "Nov 14, 2026"; MUESLI → "Aug 18, 2027"; LOVE → "Sep 16, 2027".

![ZUR10 Expires Jun 1](../screenshots/Sales-Rep-Coupon-Expires-Day-After-Last-Working-Day/SR-CP-084-FAIL-expires-day-after-last-working-day.png)
Context: `../screenshots/Sales-Rep-Coupon-Expires-Day-After-Last-Working-Day/exp-rep-zur10-expires-jun1-cet.png`

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | FAIL — wrong calendar day | SR-CP-084 screenshot + `reports/regression/REG-2026-11-03-1732/traces/SR-CP-084-FAIL-trace.json` |
| 2. Admin | N/A | not admin-visible |
| 3. xAPI `salesRepCoupons` | PASS — exact instant | checklist C-17 (3x) |
| 4. REST | PASS | end stored as the instant |

**Owning layer:** L1 storefront. The buyer `/account/coupons` uses the same card and formatting (pre-existing there).

## Root Cause Analysis
`client-app/shared/account/components/coupon-item.vue` line 21: `{{ $d(coupon.endDate, "short") }}` — date-only, browser TZ.

**Need hotfixes: set.** The same line is present in both latest stable bundles: v15 (vc-frontend 2.51.1) and v16
(vc-frontend 2.59.0). It is not fixed on 2.51.2 or on `dev`. Whether to hotfix is the PO's decision.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend (and/or the vc-module-sales-rep storefront plugin, depending on where the card is fed)
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** shared account coupon card (`coupon-item.vue`), Sales Rep Hub customer profile
- **RCA anchor:** `client-app/shared/account/components/coupon-item.vue:21` `$d(coupon.endDate, "short")`
- **Routing confidence:** LOW — needs a PO time-zone decision first; two candidate repos. Auto-fix labels withheld.
