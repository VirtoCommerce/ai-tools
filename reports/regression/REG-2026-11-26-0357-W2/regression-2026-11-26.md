# Regression REG-2026-11-26-0357-W2 — Sprint 26-23 W2 Subscriptions, cart, checkout & orders

Env vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · persona set S2 · `--no-promote` · triage deferred to the owner.

## Frontend Suites
| Suite | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|
| 120 Buyer Dashboard | 22 | 3 | 10 | 0 |
| 028 Cart | 31 | 4 | 14 | 17 |
| 011 Checkout | 30 | 9 | 2 | 30 |
| 014 Orders | 55 | 1 | 11 | 3 |
| **Total (242)** | **138** | **17** | **37** | **50** |

124 (subscriptions storefront) not run: not in the manifest on `main`, and the storefront half is not on vcst (PLAN.md §Not delivered) — `NOT_DEPLOYED`. No retries, no shared-cause halt.

## Bugs found (preliminary, for triage)
- 011 CHK-089 / CHK-096 / CHK-114 — Select address popup: clearing the search keeps the filter (KB-CC551D3B); no-match shows "no addresses yet" and hides facets (KB-9C031F08); first sort on Address is descending (VCST-6606, KB-9B275671).
- 028 CART-130/131 — `/cart` quantity commits partial values before blur (VCST-6768). CART-051 — currency switch drops the delivery method (KB-9C0EC5AB). CART-016 — totals stale 7–20 s after `ChangeFullCartItemsQuantity` (may be load from three lanes).
- 014 ORD-105 — Filters button on `/account/orders` at 375px has no accessible name (VCST-6482).
- 120 ORD-DASH-015 — "Max rows" clamps 0/21 instead of refusing (spec question); ORD-DASH-010 — `GetOrders` error shown without a retry.
- Needs a call: 011 CHK-004/027/028 accept ZIP "ABCDE" and phone "123" (KB-A370A56A). Probably stale: 011 CHK-005/009/095/104, 120 ORD-DASH-021, 014 ORD-004/006/013/014.

## NOT_DEPLOYED / environment
Blocked by the runner's no-`evaluate`/interception rule (120 ORD-DASH-017/018/020/027/028, 028 CART-126..129), timezone context (ORD-DASH-003/004/025), missing fixtures (ORD-DASH-013 needs `seed:buyer-dashboard`; 014 ORD-002/009/010/034/036/085, CHK-012/041/042; 011 CHK-058/106), `td:customer create` denied (028 CART-001/006/007/133/134), vc-frontend-next build (CART-119..123), buyer cancel / invoice not on the storefront (ORD-011, CHK-048). SR_REP_PRIMARY sign-in 400 — ORD-084..100 ran on the USER persona's orders. One S2 USER_DEFAULT clone shared by three lanes: a foreign cart line appeared in 011/028.

## Promotion
Skipped — `--no-promote`.
