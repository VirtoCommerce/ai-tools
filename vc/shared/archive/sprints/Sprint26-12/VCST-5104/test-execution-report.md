# VCST-5104 — QA Verdict: PASS WITH NOTES

**`[Loyalty][Mixed Cart][E2E] Create Order`** · Story · High/P1 · status **Testing**
**Env:** vcst-qa @ Storefront theme `2.52.0-pr-2335` · Loyalty `3.1004.0-pr-10` · Orders `3.1010.0-alpha.1429` · XOrder `3.1006.0-pr-43` (all 4 PR artifacts deployed to QA; PRs still open).
**Basis:** consolidated from same-day runs — no re-run (user-approved). Evidence:
`reports/regression/REG-2026-06-23-1024/` · `reports/test-lifecycle/TLC-2026-06-22-1337/`.

## Acceptance criteria — all 4 tasks verified working

| Task | Verdict | Evidence |
|------|---------|----------|
| 1. `order.orderTotals[]` per-currency dictionary (1 elem if primary-only) | PASS | MCO-GQL-001 7/7 (USD default + PTS), MCO-GQL-002 5/5 (single-currency) |
| 2. Order summary split-by-currency | PASS | MCO-E2E-003/004/005; per-line currency MCO-GQL-003 6/6; real order CO260623-00005 (USD $420 + PTS200) |
| 3. Loyalty balance decrease on order | PASS | MCO-GQL-004 6/6 op-log `Redeemed 200` + `Earned 200` (dedup-by-op-type works); Task 3 earn-half verified by seed-earn |
| 4. Admin UI multi-currency totals | PASS | MCO-ADM-001 — Admin items blade Currency column (PTS/USD), order CO260622-00009 |

**Runnable GraphQL: 7/7 PASS · Browser layer: 5/5 PASS.** Regression REG-2026-06-23-1024 executed 60/61 PASS (98.4%) across 075/075b/083/083b.
Business rules verified: BL-LOY-001/002/003/005, BL-CART-010, BL-ORD-001, BL-CHK-006. Edge: ECL-7.3/14.1/2.1/13.2.
Both Cursor Bugbot High/Med flags (loyaltyPoints batch loader, guest null-currency) **did not reproduce**.

## Notes — 2 candidate bugs (NOT filed, per user; detect-and-report)

1. **`CreateOrderFromCart` → HTTP 500 on PTS-only cart** (Low-Med, xOrder backend). PTS-only rejection is correct behavior but thrown as `GraphQL.ExecutionError`→500 in `CreateOrderFromCartCommandHandler.ValidateCart` instead of a typed `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` userError → storefront shows generic "error creating order" toast (MCO-E2E-006). Corroborated by App Insights `500 graphql/CreateOrderFromCart` @ 08:35:20Z. Add-to-cart path returns clean `validationErrors`; only place-order 500s.
2. **LOY-018 — negative loyalty points accepted/persisted** (Medium, admin; **out of VCST-5104 scope** — incidental in suite 075). `-5.00` fixed-points reward saves with no `min=0` guard, persists on reopen. Graceful (no 500). Evidence: `REG-2026-06-23-1024/screenshots/LOY-018-FAIL-negative-points-persisted.png`.

## Open items — fixture/tooling gaps, not product defects

- `LOYALTY_NOBAL_USER_*` creds unseeded → insufficient-balance path (MCO-GQL-005 / MCO-E2E-002) proven via diagnostic hook, not in-case.
- `ADMIN_DEFAULT.email_env` alias holds a sentence not a var name → blocks runner admin-auth (MCO-GQL-007).
- 075b/083b not registered in `config/test-suites.json`; off-list-currency order fixture (MCO-GQL-010) unseeded.

## App Insights (test window 08:20–09:05Z)

Storefront: clean. Platform: 1 signal = the `CreateOrderFromCart` 500 above (REAL_BUG Low-Med, already reflected in note 1 — no separate monitoring draft).

## Verdict: PASS WITH NOTES

All 4 ACs met, all BL-* verified, no P0/P1 defects. Two candidate bugs tracked (not filed per user). No JIRA transition performed (per user). 4 PRs remain unmerged — feature validated on deployed PR artifacts.
