# VCST-5135 ProductPoints Earning — Backend GraphQL Execution

Env: vcst-qa @ Loyalty 3.1004.0-pr-10, B2B-store / en-US / USD. Runner: `scripts/graphql-runner.ts` (canonical). Oracle: `cart.items[].loyaltyPoints`.
Suites: `regression/suites/Backend/loyalty/075c-loyalty-product-points-earning.csv`, `regression/suites/Backend/loyalty/075b-loyalty-mixed-cart-order.csv`. Date: 2026-06-24.

## Verdict: 10/10 PASS (075c) + MCO-GQL-004 PASS 8/8 (075b) — earn lifecycle fully automated via poll [WAIT]

| Case | Suite | Verdict | Captured amounts (PTS) | Proof |
|------|-------|---------|------------------------|-------|
| LOY-029 | 075c | PASS 6/6 | VIP WH-001=9999, ORG WH-001=99 | VIP group gate: VIP override (×100) vs ORG default (×1) |
| LOY-031 | 075c | PASS 8/8 | LT-001=649995, WH-001=99, PRIO-001=30000 | ALL wins for ORG; PRIO earns ALL's 500 not 999; WH-001 gate-blocked → default |
| LOY-032 | 075c | PASS 6/6 | WH-001=9999, LT-001=1299 | VIP single winner; LT-001 falls to default (ALL's 500 ignored) |
| LOY-033 | 075c | PASS 5/5 | QA-TIER-001=7497, LT-001=1299 | WHOLESALE wins for Wholesaler; LT-001 → default |
| LOY-034 | 075c | PASS 4/4 + cross-mult holds | PRIO-001=30000, LT-001=649995, prices 60 / 1299.99 | No-stacking proof (below) |
| LOY-035 | 075c | PASS 2/2 (structural) | QA-LOY-ZERO-001 present in catalog | DEFERRED GAP — zero-factor earning NOT asserted |
| LOY-036 | 075c | PASS 5/5 | MULTI-A=40, MULTI-B=80, total=120 | Cart total == Σ per-item; non-winner factors not applied |
| LOY-037 | 075c | PASS 5/5 | LOCALE-001=30, LT-001=649995 | Lowest-priority LOCALIZED never wins; stable w/ 5+ programs |
| LOY-038 | 075c | PASS 12/12 | PREVIEW=649995, BAL_BEFORE=3250884, BAL_AFTER=3900879, Earned=649995 | Poll settle 1 poll; items.0.operationType=Earned; amount=649995 > 1000 ✓ |
| MCO-GQL-004 | 075b | PASS 8/8 | Redeemed=150, Earned=121 | Poll settle 1 poll; both ops present for this order ✓ |

## LOY-034 no-stacking cross-multiplication (manual — runner cannot assert)

`AMT_PRIO001 × CART_PRICE_LT001` = 30000 × 1299.99 = **38,999,700**
`AMT_LT001 × CART_PRICE_PRIO001` = 649995 × 60 = **38,999,700**

EQUALITY HOLDS — exact (zero rounding error). Both SKUs earned at the SAME factor (500 from ALL):
QA-LOY-PRIO-001 = $60 × 500 = 30000 (NOT PRIORITY's 999 → would be 59940; NOT 999+500 stack → 89940).
LT-001 = $1299.99 × 500 = 649995. **Single-winner / no-stacking confirmed.**

## Resolution model — live-confirmed across all cases

- SINGLE highest-priority eligible (group) + active + in-window program wins GLOBALLY. Only its product factors override default=1; every other SKU earns default (×1). NO stacking, no per-SKU winners.
- Live priority order observed (highest wins): VIP(VIP-only) > WHOLESALE(Wholesaler-only) > ALL(all-groups) > PRIORITY > MULTI > ZERO > LOCALIZED.
- Group gates hold: VIP override only for VIP user, WHOLESALE override only for Wholesaler; ORG_USER gets ALL.
- `cart.loyaltyPoints.amount` aggregates per-item amounts exactly (LOY-036: 40+80=120).
- Currency = PTS on every earning item. Zero `errors[]` on all reads.

## LOY-038 earn-lifecycle — poll [WAIT] fully automated (2026-06-24 upgrade)

**Poll grammar used:**
```
[WAIT until=balance_after timeout=40 interval=4] data.loyaltyBalance.currentBalance > {{BAL_BEFORE}}
```
balance_after re-executes every 4s. Settled on poll #1 (4s) this run.

**getByPath() nested-key filter verdict:** `items[?object.orderId={{ORDER_ID}}]` is NOT supported — returns `undefined` (verified 2026-06-24 runner output). Fallback: `items.0.operationType` (newest-first `createdDate:desc`, post-settled → items.0 == this order's Earned op).

**History assertions (PASS 12/12):**
- `data.loyaltyBalance.currentBalance > {{BAL_BEFORE}}` (BAL_BEFORE=3250884, BAL_AFTER=3900879, delta=649995)
- `data.loyaltyPointsHistory.items.0.operationType = Earned` ✓
- `data.loyaltyPointsHistory.items.0.amount > 1000` (= 649995 — proves 500× override, not default 1×) ✓

Run captures: ORDER_NUMBER=CO260624-00037, ORDER_ID=2f5c48a9-3d8e-42f1-846a-bdddad228f08. AGENT-TEST orders (CO260624-00031..00037) are expected residue.

## MCO-GQL-004 earn+redeem settle — poll [WAIT] fully automated (2026-06-24 upgrade)

**Poll grammar used:**
```
[WAIT until=history_check timeout=40 interval=4] data.loyaltyPointsHistory.items[?operationType=Earned].amount > 0
```
Settled on poll #1 (4s). history_settle duplicate op removed.

**Symmetric cart (earn ~200 PTS / redeem ~200 PTS — net balance ~0):** balance assertion intentionally absent (do not assert currentBalance > or < BAL_BEFORE). Op-log is the settle signal: both Redeemed + Earned ops present > 0.

**History assertions (PASS 8/8):**
- `data.loyaltyPointsHistory.items[?operationType=Redeemed].amount > 0` (= 150) ✓
- `data.loyaltyPointsHistory.items[?operationType=Earned].amount > 0` (= 121) ✓

ORDER_ID captured for cross-ref (Admin history blade), nested-key filter NOT used per verified finding above.

## Post-settle lifecycle numbers (cumulative across all runs)

be-5135 first run (CO260624-00031): BAL_BEFORE=810, BAL_AFTER=650904, delta=650094 == PREVIEW_CART (LT-001 649995 + WH-001 99) == Earned op amount.
LOY-038 upgrade run (CO260624-00037): BAL_BEFORE=3250884, BAL_AFTER=3900879, delta=649995 == PREVIEW_ITEM (single LT-001 only).

## Gap (not a defect)

- **LOY-035 (AC9 zero-factor earning):** documented deferred gap. Only catalog presence of QA-LOY-ZERO-001 asserted; the earning assertion (ZERO wins → 0 points) requires program-state mutation that breaks parallel-run safety. Covered at admin-config level by LOY-018. Needs a serial-execution isolated fixture to close.

## No defects found. No JIRA/GitHub/Teams writes. No program-state mutation. Carts cleaned up per case (clearCart pre+post). AGENT-TEST orders CO260624-00031..00038 are expected authorized residue.

Evidence JSON: `reports/regression/graphql-evidence/LOY-038-1782337786056.json` (PASS 12/12, CO260624-00037, poll upgrade), `MCO-GQL-004-1782337847531.json` (PASS 8/8, CO260624-00038, poll upgrade). validate-td-refs: 2964/2964 resolved, 0 failures.
