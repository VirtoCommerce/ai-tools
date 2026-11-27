# W2 — Subscriptions, cart, checkout & orders · REG-2026-11-26-0357-W2

Owner Elena Kutasina · vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · persona set S2.

After triage and the RB re-run (state.json is the source of truth):

| Suite | Planned | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| 124 Subscriptions storefront | — | — | — | — | NOT_DEPLOYED |
| 120 Buyer Dashboard | 35 | 22 | 3 | 10 | 0 |
| 028 Cart | 66 | 36 | 4 | 9 | 17 (manual) |
| 011 Checkout | 71 | 30 | 9 | 2 | 30 (28 manual, 2 deprecated) |
| 014 Orders | 70 | 49 | 1 | 17 | 3 |

**124 not run — out of scope by owner decision 2026-11-26 (subscriptions are not part of this regression).** Background: the suite is not in `config/test-suites.json` on `main` (it lives on an unmerged branch), and the subscription storefront is not on vcst (PLAN.md §Not delivered). Re-run after vc-frontend#2602 merges and a green alpha is deployed.

## Before morning triage (owner) — 54 FAIL/BLOCKED without a ledger row
- **Likely real:** 011 CHK-089 (clearing the address search keeps the filter, KB-CC551D3B), CHK-096 (no-match shows "no addresses yet", KB-9C031F08), CHK-114 (first Address sort descending, VCST-6606); 028 CART-130/131 (quantity commits before blur, VCST-6768), CART-051 (currency switch drops delivery method, KB-9C0EC5AB); 014 ORD-105 (Filters button unnamed at 375px, VCST-6482); 120 ORD-DASH-010 (orders error without retry, KB-782E9FA3).
- **Bug or spec call:** 120 ORD-DASH-015 ("Max rows" clamps instead of refusing, KB-2B78C4DB); 011 CHK-004/027/028 (ZIP "ABCDE", phone "123" accepted, KB-A370A56A); 028 CART-016 (totals stale 7–20 s — contradicts KB-E9AD9962, possibly three-lane load).
- **Probably stale cases (night notes; settled in Triage below):** 011 CHK-005, 009, 095, 104; 120 ORD-DASH-021; 014 ORD-014.
- **Environment / runner:** no `evaluate`/interception (ORD-DASH-017/018/020/027/028, CART-126..129); timezone context (ORD-DASH-003/004/025); fixtures (ORD-DASH-013 needs `seed:buyer-dashboard`, ORD-DASH-006, 014 ORD-002/009/010/034/036/085, CHK-012/041/042, 011 CHK-058/106); `td:customer create` denied by the permission classifier (CART-001/006/007/133/134); vc-frontend-next build (CART-119..123); buyer cancel and invoice download not on the storefront (ORD-011, CHK-048).
- **Trust:** the S2 set has one USER_DEFAULT clone per wave, not per lane — 011 and 028 saw a foreign cart line; SR_REP_PRIMARY sign-in 400, so ORD-084..100 ran on the USER persona's orders.
- **Incidental:** German sidebar raw key `Skyflow.saved_credit_cards.menu_title` (KB-E97AD0E1); "Same as shipping" re-checks after reload; Admin "Get invoice PDF" ~61 s; Fanta 330ml images point at `starmarket-platform.demo.govirto.com`.
- **Cleanup left:** CO261126-00002 kept (120 Cleanup); USER_DEFAULT clone cart holds an "Animal Crossing" line; ORG_USER cart shipping address 200 Bay Street; BD_LAYOUT buyer on the default layout.

## Triage (49 rows in ledger.csv, 0 untriaged)
CART-001/006/007/133/134 passed in REG-2026-11-26-1000-RB (disposable customer allowed).
- **Sales-rep cases (ORD-084..099):** at night SR_REP_PRIMARY did not sign in and they ran as the USER S2 buyer, so that result was voided. Re-run as SR_REP_PRIMARY in REG-2026-11-26-1540-W2S (the password works; the night failure was the S2 persona binding): 8 pass, 7 blocked — the account has only 1 order, the cases need a multi-order day (no seeder provides it). ORD-093 is a buyer case (SIGNIN_AS:USER_DEFAULT); its night PASS stands.
- **Shared cart (S2 USER_DEFAULT on several lanes):** CHK-001, CART-003, CART-005 saw a foreign cart line; their assertions are per line or per field, so the PASS stands. CART-016 is the one affected (FLAKY).
- **Bugs — all already filed (DUPLICATE):** VCST-6820 (CHK-089), VCST-6821 (CHK-096), VCST-6606 (CHK-114), VCST-6933 (CART-051), VCST-6768 (CART-130/131), VCST-6482 (ORD-105).
- **Product-owner questions:** address validation — ZIP "ABCDE" and phone "123" accepted (CHK-004/027/028, KB-A370A56A); duplicate-address guard OQ-8 (CHK-106); dashboard "Max rows" → VCST-7040 (ORD-DASH-015, task); orders widget error has no retry (ORD-DASH-010).
- **Test defects:** CHK-005 (no per-method cost in the option list), CHK-009 (confirmation page minimal, KB-50EBEEE9), CHK-095 (0 addresses → form opens directly, KB-6D20A8C3), ORD-DASH-021 (widget reworked by VCST-6258); CHK-048 and ORD-011 are by design (invoice Admin-only; no buyer cancel on the storefront, KB-795F2020). Fixed in this PR: CHK-104 URL → `/company/info`. Still to fix (Draft, needs a re-run): ORD-014 — the Admin invoice PDF opens inline in a new tab, not as a download.
- **Flaky:** CART-016 — did not reproduce live (0/17); the night delay came from three lanes on one account.
- **Data / env:** order fixtures for the S2 personas (CHK-012/041/042, ORD-002/009/010/034/036), no default address (CHK-058), dashboard fixtures (ORD-DASH-006/013); SR_REP_PRIMARY order fixture (ORD-084/085/086/088/089/091/094).
- **Not testable on the MCP lane:** timezone override, request interception, browser_evaluate (ORD-DASH-003/004/017/018/020/025/027/028, CART-126..129); vc-frontend-next (CART-119..123).
