# W2 — Subscriptions, cart, checkout & orders · REG-2026-11-26-0357-W2

Owner Elena Kutasina · vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · persona set S2.

| Suite | Planned | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| 124 Subscriptions storefront | — | — | — | — | NOT_DEPLOYED |
| 120 Buyer Dashboard | 35 | 22 | 3 | 10 | 0 |
| 028 Cart | 66 | 31 | 4 | 14 | 17 (manual) |
| 011 Checkout | 71 | 30 | 9 | 2 | 30 (28 manual, 2 deprecated) |
| 014 Orders | 70 | 55 | 1 | 11 | 3 |

**124 not run:** the suite is not in `config/test-suites.json` on `main` (it lives on an unmerged branch), and the subscription storefront is not on vcst (PLAN.md §Not delivered). Re-run after vc-frontend#2602 merges and a green alpha is deployed.

## Before morning triage (owner) — 54 FAIL/BLOCKED without a ledger row
- **Likely real:** 011 CHK-089 (clearing the address search keeps the filter, KB-CC551D3B), CHK-096 (no-match shows "no addresses yet", KB-9C031F08), CHK-114 (first Address sort descending, VCST-6606); 028 CART-130/131 (quantity commits before blur, VCST-6768), CART-051 (currency switch drops delivery method, KB-9C0EC5AB); 014 ORD-105 (Filters button unnamed at 375px, VCST-6482); 120 ORD-DASH-010 (orders error without retry, KB-782E9FA3).
- **Bug or spec call:** 120 ORD-DASH-015 ("Max rows" clamps instead of refusing, KB-2B78C4DB); 011 CHK-004/027/028 (ZIP "ABCDE", phone "123" accepted, KB-A370A56A); 028 CART-016 (totals stale 7–20 s — contradicts KB-E9AD9962, possibly three-lane load).
- **Probably stale cases:** 011 CHK-005, 009, 095, 104 (route is `/company/info`); 120 ORD-DASH-021 (Sales Statistics = VCST-6258); 014 ORD-004 (date format), 006, 013 ("Home page"), 014 (PDF opens in a tab).
- **Environment / runner:** no `evaluate`/interception (ORD-DASH-017/018/020/027/028, CART-126..129); timezone context (ORD-DASH-003/004/025); fixtures (ORD-DASH-013 needs `seed:buyer-dashboard`, ORD-DASH-006, 014 ORD-002/009/010/034/036/085, CHK-012/041/042, 011 CHK-058/106); `td:customer create` denied by the permission classifier (CART-001/006/007/133/134); vc-frontend-next build (CART-119..123); buyer cancel and invoice download not on the storefront (ORD-011, CHK-048).
- **Trust:** the S2 set has one USER_DEFAULT clone per wave, not per lane — 011 and 028 saw a foreign cart line; SR_REP_PRIMARY sign-in 400, so ORD-084..100 ran on the USER persona's orders.
- **Incidental:** German sidebar raw key `Skyflow.saved_credit_cards.menu_title` (KB-E97AD0E1); "Same as shipping" re-checks after reload; Admin "Get invoice PDF" ~61 s; Fanta 330ml images point at `starmarket-platform.demo.govirto.com`.
- **Cleanup left:** CO261126-00002 kept (120 Cleanup); USER_DEFAULT clone cart holds an "Animal Crossing" line; ORG_USER cart shipping address 200 Bay Street; BD_LAYOUT buyer on the default layout.
